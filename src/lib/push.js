import { supabase } from './supabase'

/**
 * Notificaciones push mediante la Web Push API nativa del navegador.
 *
 * Se eligió sobre Firebase Cloud Messaging porque no requiere SDK
 * externo ni un proyecto adicional que administrar: bastan un par de
 * claves VAPID y una Edge Function. Si más adelante se publican apps
 * nativas en las tiendas, habrá que migrar a FCM, pero el lado del
 * servidor se reaprovecha casi entero.
 */

export function pushDisponible() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function estadoPermiso() {
  if (!('Notification' in window)) return 'no-soportado'
  return Notification.permission // 'default' | 'granted' | 'denied'
}

/** Registra el service worker. Necesario antes de suscribirse. */
export async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try {
    // ActualizacionApp ya lo registra al arrancar; aquí solo se espera
    // a que esté listo para evitar dos registros simultáneos.
    const existente = await navigator.serviceWorker.getRegistration()
    if (existente) return existente
    return await navigator.serviceWorker.register('/sw.js')
  } catch (err) {
    console.warn('No se pudo registrar el service worker:', err)
    return null
  }
}

/**
 * Solicita permiso y registra la suscripción en la base de datos.
 * Devuelve { ok, error } para que la interfaz pueda explicar qué pasó.
 */
export async function activarPush(clavePublicaVapid) {
  if (!pushDisponible()) {
    return { ok: false, error: 'Su navegador no admite notificaciones push.' }
  }

  if (!clavePublicaVapid) {
    return { ok: false, error: 'Las notificaciones push no están configuradas en el servidor.' }
  }

  const permiso = await Notification.requestPermission()

  if (permiso === 'denied') {
    return {
      ok: false,
      error:
        'Bloqueó las notificaciones para este sitio. Debe permitirlas desde la configuración del navegador.',
    }
  }
  if (permiso !== 'granted') {
    return { ok: false, error: 'No se concedió el permiso.' }
  }

  const registro = await registrarServiceWorker()
  if (!registro) {
    return { ok: false, error: 'No se pudo preparar el servicio de notificaciones.' }
  }

  await navigator.serviceWorker.ready

  try {
    // Si ya existe una suscripción con otra clave, hay que reemplazarla
    const existente = await registro.pushManager.getSubscription()
    if (existente) await existente.unsubscribe()

    const suscripcion = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlABytes(clavePublicaVapid),
    })

    const datos = suscripcion.toJSON()

    // Refrescar la sesión ANTES de guardar. getUser() no renueva un token
    // caducado; getSession() sí lo refresca si hace falta. Sin esto, si el
    // token expiró (p. ej. la pestaña estuvo mucho tiempo inactiva), el
    // guardado falla con "JWT expired" y la suscripción se pierde en silencio.
    let { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      const r = await supabase.auth.refreshSession()
      session = r.data?.session
    }
    if (!session?.user) {
      return { ok: false, error: 'La sesión expiró. Inicie sesión nuevamente y vuelva a intentarlo.' }
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: session.user.id,
        endpoint: datos.endpoint,
        p256dh: datos.keys.p256dh,
        auth: datos.keys.auth,
        user_agent: navigator.userAgent.slice(0, 200),
      },
      { onConflict: 'endpoint' }
    )

    if (error) throw error

    return { ok: true }
  } catch (err) {
    console.error('Error activando push:', err)
    return { ok: false, error: err.message || 'No se pudo activar.' }
  }
}

export async function desactivarPush() {
  try {
    const registro = await navigator.serviceWorker.getRegistration()
    const suscripcion = await registro?.pushManager.getSubscription()

    if (suscripcion) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', suscripcion.endpoint)
      await suscripcion.unsubscribe()
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export async function pushActivo() {
  if (!pushDisponible() || Notification.permission !== 'granted') return false
  try {
    const registro = await navigator.serviceWorker.getRegistration()
    const suscripcion = await registro?.pushManager.getSubscription()
    return Boolean(suscripcion)
  } catch {
    return false
  }
}

/**
 * Re-verifica y regenera la suscripción al entrar a la app.
 *
 * Las suscripciones push pueden perderse sin que el usuario lo sepa: al
 * actualizarse el service worker, al limpiar datos del navegador, o si el
 * guardado en la base falló por un token caducado. Esta función, llamada
 * al arrancar, detecta esos casos y vuelve a registrar la suscripción sin
 * pedir permiso de nuevo (ya lo tiene). Silenciosa: no molesta si algo
 * falla, solo lo registra en consola.
 */
export async function sincronizarSuscripcion(clavePublicaVapid) {
  try {
    if (!pushDisponible() || Notification.permission !== 'granted') return
    if (!clavePublicaVapid) return

    const registro = await registrarServiceWorker()
    if (!registro) return
    await navigator.serviceWorker.ready

    let suscripcion = await registro.pushManager.getSubscription()

    // Si no hay suscripción en el navegador pero el permiso está concedido,
    // se recrea (caso típico: el SW se actualizó y la perdió).
    if (!suscripcion) {
      suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlABytes(clavePublicaVapid),
      })
    }

    const datos = suscripcion.toJSON()

    // Sesión fresca antes de escribir, igual que en activarPush
    let { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return

    // upsert idempotente: si ya está, no duplica; si faltaba, la crea
    await supabase.from('push_subscriptions').upsert(
      {
        user_id: session.user.id,
        endpoint: datos.endpoint,
        p256dh: datos.keys.p256dh,
        auth: datos.keys.auth,
        user_agent: navigator.userAgent.slice(0, 200),
      },
      { onConflict: 'endpoint' }
    )
  } catch (err) {
    console.warn('No se pudo sincronizar la suscripción push:', err?.message)
  }
}

/** Convierte la clave VAPID de base64url al formato que espera el navegador. */
function base64UrlABytes(base64Url) {
  const relleno = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + relleno).replace(/-/g, '+').replace(/_/g, '/')
  const binario = window.atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

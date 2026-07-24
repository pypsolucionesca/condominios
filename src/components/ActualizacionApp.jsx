import { useState, useEffect, useCallback } from 'react'

const INTERVALO_COMPROBACION = 5 * 60 * 1000 // cinco minutos

/**
 * Detecta y aplica actualizaciones de la aplicación instalada.
 *
 * Sin esto, un usuario con la PWA en su pantalla de inicio puede quedarse
 * indefinidamente con una versión antigua, o peor: con una pantalla en
 * blanco si el service worker sirve referencias a archivos que ya no
 * existen en el servidor.
 *
 * No se actualiza sola de forma silenciosa: si el usuario está a mitad de
 * registrar un pago, una recarga sin avisar le haría perder los datos.
 */
export default function ActualizacionApp() {
  const [hayNueva, setHayNueva] = useState(false)
  const [registro, setRegistro] = useState(null)
  const [aplicando, setAplicando] = useState(false)

  const comprobar = useCallback(async (reg) => {
    if (!reg) return
    try {
      await reg.update()
    } catch {
      /* sin conexión o el servidor no responde; se reintentará */
    }
  }, [])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let intervalo = null

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        setRegistro(reg)

        // Ya hay una versión esperando desde una visita anterior
        if (reg.waiting) setHayNueva(true)

        reg.addEventListener('updatefound', () => {
          const nuevo = reg.installing
          if (!nuevo) return

          nuevo.addEventListener('statechange', () => {
            // 'installed' con un controlador activo significa que hay
            // una versión nueva lista y otra en uso
            if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
              setHayNueva(true)
            }
          })
        })

        comprobar(reg)
        intervalo = setInterval(() => comprobar(reg), INTERVALO_COMPROBACION)
      })
      .catch((err) => {
        console.warn('No se pudo registrar el service worker:', err)
      })

    // Al volver a la aplicación se comprueba de inmediato
    const alVolver = () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.getRegistration().then(comprobar)
      }
    }
    document.addEventListener('visibilitychange', alVolver)

    // Cuando el nuevo service worker toma el control, se recarga una vez
    let recargando = false
    const alCambiar = () => {
      if (recargando) return
      recargando = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', alCambiar)

    return () => {
      if (intervalo) clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
      navigator.serviceWorker.removeEventListener('controllerchange', alCambiar)
    }
  }, [comprobar])

  const actualizar = () => {
    setAplicando(true)

    if (registro?.waiting) {
      registro.waiting.postMessage({ tipo: 'SALTAR_ESPERA' })
      // controllerchange se encargará de recargar
      setTimeout(() => window.location.reload(), 1500)
    } else {
      window.location.reload()
    }
  }

  if (!hayNueva) return null

  return (
    <div className="aviso-actualizacion" role="status">
      <div className="aviso-actualizacion-texto">
        <strong>Hay una versión nueva</strong>
        <small>Actualice para obtener las últimas mejoras y correcciones.</small>
      </div>
      <button className="btn-mini btn-primary" onClick={actualizar} disabled={aplicando}>
        {aplicando ? 'Actualizando…' : 'Actualizar'}
      </button>
    </div>
  )
}

/**
 * Limpia el service worker y las cachés.
 *
 * Recurso para cuando la aplicación queda en un estado inconsistente y
 * el usuario no puede resolverlo desde la configuración del navegador,
 * que en móvil es especialmente enrevesada.
 */
export async function reiniciarAplicacion() {
  try {
    if ('serviceWorker' in navigator) {
      const registros = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registros.map((r) => r.unregister()))
    }

    if ('caches' in window) {
      const nombres = await caches.keys()
      await Promise.all(nombres.map((n) => caches.delete(n)))
    }

    // La sesión se conserva: el objetivo es limpiar archivos, no cerrar sesión
    window.location.reload(true)
  } catch (err) {
    console.error('Error reiniciando la aplicación:', err)
    window.location.reload()
  }
}

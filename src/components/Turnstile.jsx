import { useEffect, useRef, useState } from 'react'

/**
 * Widget de verificación humana de Cloudflare Turnstile.
 *
 * Robusto contra el fallo de "Verificando..." infinito:
 *  - Espera a que el script defina window.turnstile antes de renderizar
 *    (poll corto), en vez de asumir que ya está listo.
 *  - retry:'auto' y refresh-expired:'auto' para que reintente solo si la
 *    verificación falla, en lugar de colgarse.
 *
 * Prop `requerido`:
 *  - true  (login/registro con Supabase exigiendo captcha): NO se auto-oculta;
 *    si falla muestra aviso para reintentar.
 *  - false (tolerante): si no carga en unos segundos, llama onNoDisponible().
 *
 * Clave pública en VITE_TURNSTILE_SITE_KEY. La secreta va en Supabase.
 */
export default function Turnstile({ onToken, onExpire, onNoDisponible, accion, requerido = false }) {
  const contenedorRef = useRef(null)
  const widgetIdRef = useRef(null)
  const [estado, setEstado] = useState('cargando') // cargando | listo | error | no_disponible

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY

  useEffect(() => {
    let cancelado = false
    let pollId = null

    const marcarNoDisponible = () => {
      if (cancelado) return
      if (requerido) { setEstado('error'); return }
      setEstado('no_disponible')
      if (typeof onNoDisponible === 'function') onNoDisponible()
    }

    if (!siteKey) {
      if (requerido) { setEstado('error'); return }
      marcarNoDisponible()
      return
    }

    const timeout = requerido ? null : setTimeout(marcarNoDisponible, 8000)

    // Cargar el script (una sola vez para toda la app).
    const cargarScript = () =>
      new Promise((resolve, reject) => {
        const existente = document.querySelector('script[data-turnstile]')
        if (existente) {
          if (window.turnstile) return resolve()
          existente.addEventListener('load', () => resolve())
          existente.addEventListener('error', reject)
          return
        }
        const s = document.createElement('script')
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
        s.async = true
        s.defer = true
        s.setAttribute('data-turnstile', 'true')
        s.onload = () => resolve()
        s.onerror = reject
        document.head.appendChild(s)
      })

    // Esperar a que window.turnstile esté realmente definido antes de render.
    const esperarTurnstile = () =>
      new Promise((resolve, reject) => {
        let intentos = 0
        const chequear = () => {
          if (cancelado) return
          if (window.turnstile && typeof window.turnstile.render === 'function') {
            return resolve()
          }
          if (++intentos > 100) return reject(new Error('turnstile no disponible'))
          pollId = setTimeout(chequear, 100) // hasta ~10s esperando
        }
        chequear()
      })

    cargarScript()
      .then(esperarTurnstile)
      .then(() => {
        if (cancelado || !contenedorRef.current) return
        // Protección contra doble montaje (React StrictMode ejecuta el efecto
        // dos veces): si ya hay un widget en este contenedor, no creamos otro,
        // porque dos widgets Turnstile compitiendo se quedan en "Verificando".
        if (widgetIdRef.current) return
        try {
          contenedorRef.current.innerHTML = '' // por si quedó un render previo
          widgetIdRef.current = window.turnstile.render(contenedorRef.current, {
            sitekey: siteKey,
            action: accion || undefined,
            callback: (token) => {
              if (timeout) clearTimeout(timeout)
              if (!cancelado) {
                setEstado('listo')
                if (typeof onToken === 'function') onToken(token)
              }
            },
            'expired-callback': () => {
              if (typeof onExpire === 'function') onExpire()
            },
            'error-callback': (codigo) => {
              // No reintentar en bucle: registramos el código para diagnóstico
              // y mostramos aviso. El usuario puede recargar.
              if (typeof console !== 'undefined') {
                console.warn('[Turnstile] error-callback código:', codigo)
              }
              marcarNoDisponible()
            },
            theme: 'light',
          })
        } catch {
          marcarNoDisponible()
        }
      })
      .catch(marcarNoDisponible)

    return () => {
      cancelado = true
      if (timeout) clearTimeout(timeout)
      if (pollId) clearTimeout(pollId)
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current) } catch { /* ya limpiado */ }
        widgetIdRef.current = null
      }
    }
  }, [siteKey, accion, requerido, onToken, onExpire, onNoDisponible])

  if (estado === 'no_disponible') return null

  return (
    <div style={{ width: '100%' }}>
      <div ref={contenedorRef} style={{ margin: '12px 0', minHeight: 65, display: 'flex', justifyContent: 'center' }} />
      {estado === 'error' && (
        <small className="texto-ayuda" style={{ display: 'block', textAlign: 'center', color: '#b91c1c' }}>
          No se pudo cargar la verificación de seguridad. Recargue la página e intente de nuevo.
        </small>
      )}
    </div>
  )
}

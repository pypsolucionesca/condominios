import { useEffect, useRef, useState } from 'react'

/**
 * Widget de verificación humana de Cloudflare Turnstile.
 *
 * Dos comportamientos según la prop `requerido`:
 *
 *  • requerido = true (p. ej. login/registro cuando Supabase EXIGE el captcha):
 *    el widget NO se auto-oculta. Espera a que Cloudflare termine (el modo
 *    "Managed" puede tardar). Si hay error, muestra un aviso para reintentar,
 *    pero nunca se esconde dejando pasar sin token (Supabase lo rechazaría).
 *
 *  • requerido = false (tolerante): si la clave falta o el script no carga en
 *    unos segundos, llama a onNoDisponible() y se oculta, para no bloquear.
 *
 * La clave pública se lee de VITE_TURNSTILE_SITE_KEY. La secreta va en Supabase.
 *
 * Props:
 *   onToken(token), onExpire(), onNoDisponible(), accion, requerido (bool)
 */
export default function Turnstile({ onToken, onExpire, onNoDisponible, accion, requerido = false }) {
  const contenedorRef = useRef(null)
  const widgetIdRef = useRef(null)
  const [estado, setEstado] = useState('cargando') // cargando | listo | error | no_disponible

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY

  useEffect(() => {
    let cancelado = false

    const marcarNoDisponible = () => {
      if (cancelado) return
      // Cuando el captcha es requerido, NO nos ocultamos: mostramos error para
      // que el usuario reintente, porque saltarlo haría que el backend rechace.
      if (requerido) {
        setEstado('error')
        return
      }
      setEstado('no_disponible')
      if (typeof onNoDisponible === 'function') onNoDisponible()
    }

    // Sin clave configurada.
    if (!siteKey) {
      if (requerido) { setEstado('error'); return }
      marcarNoDisponible()
      return
    }

    // Timeout de gracia SOLO en modo tolerante. Si es requerido, esperamos a
    // Cloudflare sin límite (Managed puede tardar en la primera verificación).
    const timeout = requerido ? null : setTimeout(marcarNoDisponible, 8000)

    const cargarScript = () =>
      new Promise((resolve, reject) => {
        if (window.turnstile) return resolve()
        const existente = document.querySelector('script[data-turnstile]')
        if (existente) {
          existente.addEventListener('load', () => resolve())
          existente.addEventListener('error', reject)
          return
        }
        const s = document.createElement('script')
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        s.async = true
        s.defer = true
        s.setAttribute('data-turnstile', 'true')
        s.onload = () => resolve()
        s.onerror = reject
        document.head.appendChild(s)
      })

    cargarScript()
      .then(() => {
        if (cancelado || !contenedorRef.current || !window.turnstile) return
        try {
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
            'error-callback': () => {
              // Error de Cloudflare: en modo requerido mostramos aviso de
              // reintento; en modo tolerante, ocultamos.
              marcarNoDisponible()
            },
            theme: 'light',
          })
          if (!cancelado && estado !== 'error') setEstado('listo')
        } catch {
          marcarNoDisponible()
        }
      })
      .catch(marcarNoDisponible)

    return () => {
      cancelado = true
      if (timeout) clearTimeout(timeout)
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          /* ya limpiado */
        }
      }
    }
  }, [siteKey, accion, requerido, onToken, onExpire, onNoDisponible])

  // Modo tolerante y no disponible: no renderizamos nada (login sigue sin captcha).
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

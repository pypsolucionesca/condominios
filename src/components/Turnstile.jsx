import { useEffect, useRef, useState } from 'react'

/**
 * Widget de verificación humana de Cloudflare Turnstile.
 *
 * Carga el script de Cloudflare una sola vez y renderiza el widget. Cuando el
 * usuario pasa la verificación, entrega un token de un solo uso vía onToken(token).
 * Ese token se envía a Supabase Auth (options.captchaToken) para probar que
 * detrás hay una persona y no un bot.
 *
 * La clave del sitio (site key) se lee de la variable de entorno
 * VITE_TURNSTILE_SITE_KEY. Es una clave PÚBLICA (va en el frontend); la clave
 * secreta se configura en el panel de Supabase, nunca aquí.
 *
 * Props:
 *   onToken(token)   → se llama con el token cuando la verificación pasa.
 *   onExpire()       → opcional; el token caducó, hay que rehacer la verificación.
 *   accion           → opcional; etiqueta para distinguir "registro" de "login".
 */
export default function Turnstile({ onToken, onExpire, accion }) {
  const contenedorRef = useRef(null)
  const widgetIdRef = useRef(null)
  const [errorCarga, setErrorCarga] = useState(false)

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY

  useEffect(() => {
    if (!siteKey) {
      // Sin clave configurada no se puede renderizar; se avisa en consola
      // para el desarrollador, pero no se rompe la pantalla.
      console.warn('VITE_TURNSTILE_SITE_KEY no está configurada; el captcha no se mostrará.')
      setErrorCarga(true)
      return
    }

    let cancelado = false

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
        widgetIdRef.current = window.turnstile.render(contenedorRef.current, {
          sitekey: siteKey,
          action: accion || undefined,
          callback: (token) => onToken?.(token),
          'expired-callback': () => onExpire?.(),
          'error-callback': () => setErrorCarga(true),
          theme: 'light',
        })
      })
      .catch(() => setErrorCarga(true))

    return () => {
      cancelado = true
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          /* el widget ya pudo haberse limpiado */
        }
      }
    }
  }, [siteKey, accion, onToken, onExpire])

  if (errorCarga) {
    return (
      <small className="texto-ayuda" style={{ display: 'block', margin: '8px 0' }}>
        No se pudo cargar la verificación de seguridad. Recargue la página e intente de nuevo.
      </small>
    )
  }

  return <div ref={contenedorRef} style={{ margin: '12px 0', minHeight: 65 }} />
}

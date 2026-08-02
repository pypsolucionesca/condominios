import { useEffect, useRef, useState } from 'react'

/**
 * Widget de verificación humana de Cloudflare Turnstile — TOLERANTE A FALLOS.
 *
 * Filosofía: el captcha SUMA seguridad, pero NUNCA debe impedir que un usuario
 * legítimo inicie sesión. Por eso, si la clave no está configurada, o el script
 * de Cloudflare no carga (bloqueadores, red móvil, etc.), este componente avisa
 * al padre mediante onNoDisponible() para que el login continúe sin captcha,
 * en lugar de romperse o bloquear el botón.
 *
 * La clave se lee de VITE_TURNSTILE_SITE_KEY (clave pública). La clave secreta
 * se configura en Supabase, nunca aquí.
 *
 * Props:
 *   onToken(token)      → token cuando la verificación pasa.
 *   onExpire()          → el token caducó.
 *   onNoDisponible()    → el captcha no se pudo cargar; el login debe continuar sin él.
 *   accion              → etiqueta opcional (registro / login).
 */
export default function Turnstile({ onToken, onExpire, onNoDisponible, accion }) {
  const contenedorRef = useRef(null)
  const widgetIdRef = useRef(null)
  const [estado, setEstado] = useState('cargando') // cargando | listo | no_disponible

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY

  useEffect(() => {
    let cancelado = false

    const marcarNoDisponible = () => {
      if (cancelado) return
      setEstado('no_disponible')
      if (typeof onNoDisponible === 'function') onNoDisponible()
    }

    // Sin clave configurada -> el login sigue sin captcha.
    if (!siteKey) {
      marcarNoDisponible()
      return
    }

    // Si el script tarda demasiado, no dejamos al usuario atrapado.
    const timeout = setTimeout(marcarNoDisponible, 8000)

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
              clearTimeout(timeout)
              if (!cancelado) {
                setEstado('listo')
                if (typeof onToken === 'function') onToken(token)
              }
            },
            'expired-callback': () => {
              if (typeof onExpire === 'function') onExpire()
            },
            'error-callback': marcarNoDisponible,
            theme: 'light',
          })
          if (!cancelado) setEstado('listo')
        } catch {
          marcarNoDisponible()
        }
      })
      .catch(marcarNoDisponible)

    return () => {
      cancelado = true
      clearTimeout(timeout)
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          /* el widget ya pudo haberse limpiado */
        }
      }
    }
  }, [siteKey, accion, onToken, onExpire, onNoDisponible])

  if (estado === 'no_disponible') return null

  return <div ref={contenedorRef} style={{ margin: '12px 0', minHeight: 65 }} />
}

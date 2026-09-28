import { useEffect, useState } from 'react'

/**
 * P08_ACTUALIZACION · P11_AVISO_COMPACTO
 * Aviso de nueva versión: tarjeta compacta abajo a la derecha (escritorio) o
 * encima de la barra inferior (móvil). Estilos en línea y posición explícita
 * para que ninguna regla global del sitio la estire.
 */
// eslint-disable-next-line no-undef
const VERSION_ACTUAL = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : null
const CADA_MS = 5 * 60 * 1000

export default function AvisoActualizacion() {
  const [nueva, setNueva] = useState(null)
  const [pospuesta, setPospuesta] = useState(null)
  const [actualizando, setActualizando] = useState(false)
  const [movil, setMovil] = useState(
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const cambio = (e) => setMovil(e.matches)
    mq.addEventListener?.('change', cambio)
    return () => mq.removeEventListener?.('change', cambio)
  }, [])

  useEffect(() => {
    if (!VERSION_ACTUAL) return
    let vivo = true

    const revisar = async () => {
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!r.ok) return
        const { version } = await r.json()
        if (vivo && version && version !== VERSION_ACTUAL) setNueva(version)
      } catch {
        // Sin conexión: se intenta en la próxima revisión.
      }
    }

    const alVolver = () => {
      if (document.visibilityState === 'visible') revisar()
    }

    revisar()
    const intervalo = setInterval(revisar, CADA_MS)
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    return () => {
      vivo = false
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
    }
  }, [])

  const actualizar = async () => {
    setActualizando(true)
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.()
      await reg?.update?.()
      if (reg?.waiting) reg.waiting.postMessage({ tipo: 'SALTAR_ESPERA' })
      if (window.caches) {
        const nombres = await caches.keys()
        await Promise.all(nombres.filter((n) => n.startsWith('condominios-')).map((n) => caches.delete(n)))
      }
    } catch {
      // Si algo falla, la recarga igual trae la versión nueva.
    }
    window.location.reload()
  }

  if (!nueva || pospuesta === nueva) return null

  const boton = {
    borderRadius: 6,
    padding: '7px 12px',
    fontSize: '0.82rem',
    fontWeight: 700,
    cursor: 'pointer',
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  }

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 'auto',
        left: movil ? 12 : 'auto',
        right: movil ? 12 : 20,
        bottom: movil ? 76 : 20,
        width: movil ? 'auto' : 340,
        height: 'auto',
        maxHeight: 'none',
        zIndex: 2000,
        boxSizing: 'border-box',
        background: '#1e293b',
        border: '1px solid #334155',
        borderLeft: '4px solid #f97316',
        color: '#ffffff',
        borderRadius: 10,
        padding: '12px 14px',
        boxShadow: '0 10px 28px rgba(15, 23, 42, 0.4)',
        fontSize: '0.88rem',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 2 }}>Hay una actualización disponible</div>
      <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginBottom: 10 }}>
        Guarde lo que esté haciendo y pulse «Actualizar».
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => setPospuesta(nueva)}
          disabled={actualizando}
          style={{ ...boton, background: 'transparent', color: '#ffffff', border: '1px solid #64748b' }}
        >
          Más tarde
        </button>
        <button
          type="button"
          onClick={actualizar}
          disabled={actualizando}
          style={{ ...boton, background: '#f97316', color: '#ffffff', border: '1px solid #f97316' }}
        >
          {actualizando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'

/**
 * P08_ACTUALIZACION · Aviso de nueva versión.
 *
 * Cada compilación deja /version.json con su identificador (vite.config.js).
 * La app lo consulta cada 5 minutos y al volver a la pestaña; si cambió,
 * muestra la barra "Hay una actualización disponible". No recarga sola para
 * no perder un formulario a medio llenar.
 */
// eslint-disable-next-line no-undef
const VERSION_ACTUAL = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : null
const CADA_MS = 5 * 60 * 1000

export default function AvisoActualizacion() {
  const [nueva, setNueva] = useState(null)
  const [pospuesta, setPospuesta] = useState(null)
  const [actualizando, setActualizando] = useState(false)

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

  return (
    <>
      <style>{`
        .aviso-actualizacion {
          position: fixed; left: 50%; transform: translateX(-50%); bottom: 16px; z-index: 2000;
          width: calc(100% - 32px); max-width: 480px;
          display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
          background: #1e3a8a; color: #ffffff; border-radius: 10px;
          padding: 12px 14px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.35);
          font-size: 0.9rem;
        }
        .aviso-actualizacion span { flex: 1 1 180px; font-weight: 600; }
        .aviso-actualizacion button {
          border-radius: 6px; padding: 8px 12px; font-size: 0.85rem; font-weight: 700; cursor: pointer;
        }
        .aviso-actualizacion .aa-si { background: #ffffff; color: #1e3a8a; border: none; }
        .aviso-actualizacion .aa-no { background: transparent; color: #ffffff; border: 1px solid #ffffff; }
        @media (max-width: 768px) { .aviso-actualizacion { bottom: 76px; } }
      `}</style>
      <div className="aviso-actualizacion" role="status">
        <span>🔄 Hay una actualización disponible.</span>
        <button type="button" className="aa-si" onClick={actualizar} disabled={actualizando}>
          {actualizando ? 'Actualizando…' : 'Actualizar'}
        </button>
        <button type="button" className="aa-no" onClick={() => setPospuesta(nueva)} disabled={actualizando}>
          Más tarde
        </button>
      </div>
    </>
  )
}

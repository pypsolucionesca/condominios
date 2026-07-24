import { useState, useEffect } from 'react'

/**
 * Instalación de la aplicación desde el perfil.
 *
 * El banner automático de Chrome no siempre aparece: el navegador lo
 * silencia durante semanas si el usuario lo descartó o desinstaló la
 * app alguna vez. Esta vía siempre está disponible.
 */
export default function BotonInstalar() {
  const [evento, setEvento] = useState(null)
  const [instalada, setInstalada] = useState(false)
  const [esIOS, setEsIOS] = useState(false)
  const [instruccionesIOS, setInstruccionesIOS] = useState(false)

  useEffect(() => {
    const yaInstalada =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true

    setInstalada(yaInstalada)

    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    setEsIOS(ios)

    const capturar = (e) => {
      e.preventDefault()
      setEvento(e)
    }

    window.addEventListener('beforeinstallprompt', capturar)
    window.addEventListener('appinstalled', () => setInstalada(true))

    return () => window.removeEventListener('beforeinstallprompt', capturar)
  }, [])

  const instalar = async () => {
    if (!evento) return
    evento.prompt()
    const { outcome } = await evento.userChoice
    if (outcome === 'accepted') setInstalada(true)
    setEvento(null)
  }

  if (instalada) {
    return (
      <div className="estado-instalada">
        <span aria-hidden="true">✅</span>
        <div>
          <strong>Aplicación instalada</strong>
          <small>Puede abrirla desde su pantalla de inicio.</small>
        </div>
      </div>
    )
  }

  // iOS no dispara beforeinstallprompt: hay que explicar el proceso
  if (esIOS) {
    return (
      <div className="bloque-instalar">
        <button
          className="btn btn-primary btn-accion"
          onClick={() => setInstruccionesIOS((v) => !v)}
        >
          Instalar en mi iPhone
        </button>

        {instruccionesIOS && (
          <ol className="pasos-ios">
            <li>Toque el botón Compartir en la barra inferior de Safari.</li>
            <li>Deslice y elija «Agregar a inicio».</li>
            <li>Confirme con «Agregar».</li>
          </ol>
        )}
      </div>
    )
  }

  if (!evento) {
    return (
      <div className="bloque-instalar">
        <p className="texto-ayuda">
          Para instalarla, abra el menú de su navegador y elija «Instalar aplicación» o
          «Añadir a pantalla de inicio».
        </p>
      </div>
    )
  }

  return (
    <div className="bloque-instalar">
      <button className="btn btn-primary btn-accion" onClick={instalar}>
        Instalar aplicación
      </button>
      <p className="texto-ayuda">
        Se abrirá desde su pantalla de inicio, sin pasar por el navegador, y podrá recibir
        notificaciones.
      </p>
    </div>
  )
}

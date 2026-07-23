import { useEffect, useState } from 'react'

const CLAVE_DESCARTADO = 'condominios-instalacion-descartada'
const DIAS_ESPERA = 30

/**
 * Invitación a instalar la aplicación.
 *
 * Reemplaza al aviso que no se podía cerrar. Aquí el usuario puede
 * descartarlo, y no vuelve a aparecer durante 30 días: un banner
 * insistente que no se deja cerrar molesta más de lo que convierte.
 */
export default function AvisoInstalacion() {
  const [evento, setEvento] = useState(null)
  const [visible, setVisible] = useState(false)
  const [esIOS, setEsIOS] = useState(false)

  useEffect(() => {
    // Ya instalada: no tiene sentido invitar
    const instalada =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    if (instalada) return

    // Descartada hace poco
    try {
      const guardado = localStorage.getItem(CLAVE_DESCARTADO)
      if (guardado) {
        const dias = (Date.now() - Number(guardado)) / 86400000
        if (dias < DIAS_ESPERA) return
      }
    } catch {
      /* almacenamiento no disponible; se continúa */
    }

    // iOS no dispara beforeinstallprompt: hay que explicar el proceso
    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    const safari = /^((?!chrome|android|crios|fxios).)*safari/i.test(window.navigator.userAgent)

    if (ios && safari) {
      setEsIOS(true)
      const t = setTimeout(() => setVisible(true), 4000)
      return () => clearTimeout(t)
    }

    const alInstalar = (e) => {
      e.preventDefault()
      setEvento(e)
      setTimeout(() => setVisible(true), 3000)
    }

    window.addEventListener('beforeinstallprompt', alInstalar)
    window.addEventListener('appinstalled', () => setVisible(false))

    return () => window.removeEventListener('beforeinstallprompt', alInstalar)
  }, [])

  const descartar = () => {
    setVisible(false)
    try {
      localStorage.setItem(CLAVE_DESCARTADO, String(Date.now()))
    } catch {
      /* sin almacenamiento: se ocultará solo en esta sesión */
    }
  }

  const instalar = async () => {
    if (!evento) return
    evento.prompt()
    await evento.userChoice
    setEvento(null)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="aviso-instalacion" role="dialog" aria-label="Instalar aplicación">
      <button className="aviso-instalacion-cerrar" onClick={descartar} aria-label="Cerrar">
        ×
      </button>

      <div className="aviso-instalacion-icono" aria-hidden="true">
        🏢
      </div>

      <div className="aviso-instalacion-texto">
        <strong>Instalar la aplicación</strong>
        {esIOS ? (
          <small>
            Toque el botón Compartir y elija «Agregar a inicio» para acceder más rápido.
          </small>
        ) : (
          <small>Acceda más rápido desde su pantalla de inicio, sin abrir el navegador.</small>
        )}
      </div>

      <div className="aviso-instalacion-botones">
        <button className="btn-mini btn-secundario" onClick={descartar}>
          Ahora no
        </button>
        {!esIOS && (
          <button className="btn-mini btn-primary" onClick={instalar}>
            Instalar
          </button>
        )}
      </div>
    </div>
  )
}

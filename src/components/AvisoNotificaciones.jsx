import { useEffect, useState } from 'react'
import { pushDisponible, estadoPermiso, activarPush } from '../lib/push'

const CLAVE_DESCARTADO = 'condominios-notif-descartada'
const DIAS_ESPERA = 14
const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY

/**
 * Invitación a activar las notificaciones.
 *
 * Aparece como banner discreto cuando el usuario tiene sesión pero aún
 * no ha concedido el permiso. Sin esto, la activación queda escondida en
 * el perfil y casi nadie la encuentra, así que los residentes no se
 * enteran de sus avisos de cobro.
 *
 * No aparece si: el navegador no admite push, el permiso ya está
 * concedido o bloqueado, o el usuario lo descartó hace poco.
 */
export default function AvisoNotificaciones() {
  const [visible, setVisible] = useState(false)
  const [activando, setActivando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Requisitos para invitar: soporte y permiso aún sin decidir
    if (!pushDisponible()) return
    if (estadoPermiso() !== 'default') return
    if (!VAPID) return

    // Descartado hace poco: no insistir
    try {
      const guardado = localStorage.getItem(CLAVE_DESCARTADO)
      if (guardado) {
        const dias = (Date.now() - Number(guardado)) / 86400000
        if (dias < DIAS_ESPERA) return
      }
    } catch {
      /* almacenamiento no disponible; se continúa */
    }

    // Pequeña espera para no saltar encima del usuario nada más entrar
    const t = setTimeout(() => setVisible(true), 2500)
    return () => clearTimeout(t)
  }, [])

  const descartar = () => {
    setVisible(false)
    try {
      localStorage.setItem(CLAVE_DESCARTADO, String(Date.now()))
    } catch {
      /* sin almacenamiento: se ocultará solo en esta sesión */
    }
  }

  const activar = async () => {
    setError(null)
    setActivando(true)
    const res = await activarPush(VAPID)
    setActivando(false)

    if (res.ok) {
      setVisible(false)
    } else {
      // Si el usuario bloqueó el permiso en el diálogo, se descarta el
      // banner: no tiene sentido insistir hasta que lo permita en ajustes.
      if (estadoPermiso() === 'denied') {
        descartar()
      } else {
        setError(res.error || 'No se pudo activar. Intente de nuevo.')
      }
    }
  }

  if (!visible) return null

  return (
    <div className="aviso-notif" role="dialog" aria-label="Activar notificaciones">
      <button className="aviso-notif-cerrar" onClick={descartar} aria-label="Cerrar">
        ×
      </button>

      <div className="aviso-notif-icono" aria-hidden="true">
        🔔
      </div>

      <div className="aviso-notif-texto">
        <strong>Active las notificaciones</strong>
        <small>
          {error
            ? error
            : 'Reciba un aviso cuando se emita su recibo o se confirme un pago, aunque no tenga la aplicación abierta.'}
        </small>
      </div>

      <div className="aviso-notif-botones">
        <button className="btn-mini btn-secundario" onClick={descartar} disabled={activando}>
          Ahora no
        </button>
        <button className="btn-mini btn-primary" onClick={activar} disabled={activando}>
          {activando ? 'Activando…' : 'Activar'}
        </button>
      </div>
    </div>
  )
}

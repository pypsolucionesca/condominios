import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const ICONOS = {
  aviso_emitido: '📄',
  aviso_vencido: '⚠️',
  pago_confirmado: '✅',
  pago_rechazado: '❌',
  pago_reportado: '💵',
  resumen_semanal: '📊',
  compromiso_vencido: '🔔',
  general: '📬',
}

export default function Campana() {
  const { usuario } = useAuth()
  const navigate = useNavigate()

  const [abierto, setAbierto] = useState(false)
  const [items, setItems] = useState([])
  const [sinLeer, setSinLeer] = useState(0)
  const [cargando, setCargando] = useState(false)
  const ref = useRef(null)

  const contar = useCallback(async () => {
    if (!usuario) return
    const { data } = await supabase.rpc('unread_count')
    setSinLeer(Number(data) || 0)
  }, [usuario])

  const cargar = useCallback(async () => {
    if (!usuario) return
    setCargando(true)
    const { data } = await supabase
      .from('notifications')
      .select('id, kind, title, body, link, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(25)
    setItems(data || [])
    setCargando(false)
  }, [usuario])

  useEffect(() => {
    if (!usuario) return
    contar()

    // Actualización en tiempo real: si el administrador confirma un pago,
    // el residente lo ve sin recargar la página.
    const canal = supabase
      .channel(`notif-${usuario.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${usuario.id}`,
        },
        () => {
          contar()
          if (abierto) cargar()
        }
      )
      .subscribe()

    // Respaldo por si la conexión en tiempo real falla
    const intervalo = setInterval(contar, 120000)

    return () => {
      supabase.removeChannel(canal)
      clearInterval(intervalo)
    }
  }, [usuario, contar, cargar, abierto])

  useEffect(() => {
    if (!abierto) return
    cargar()

    const fuera = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto, cargar])

  const abrirNotificacion = async (n) => {
    if (!n.read_at) {
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', n.id)
      contar()
    }
    setAbierto(false)
    if (n.link) navigate(n.link)
  }

  const marcarTodas = async () => {
    await supabase.rpc('mark_all_read')
    setSinLeer(0)
    cargar()
  }

  if (!usuario) return null

  return (
    <div className="campana" ref={ref}>
      <button
        className="campana-boton"
        onClick={() => setAbierto((v) => !v)}
        aria-label={sinLeer > 0 ? `${sinLeer} notificaciones sin leer` : 'Notificaciones'}
        aria-expanded={abierto}
      >
        <span aria-hidden="true">🔔</span>
        {sinLeer > 0 && <span className="campana-punto">{sinLeer > 9 ? '9+' : sinLeer}</span>}
      </button>

      {abierto && (
        <div className="campana-panel">
          <div className="campana-cabecera">
            <strong>Notificaciones</strong>
            {sinLeer > 0 && (
              <button className="enlace-inline" onClick={marcarTodas}>
                Marcar todas
              </button>
            )}
          </div>

          <div className="campana-lista">
            {cargando ? (
              <div className="campana-vacia">Cargando…</div>
            ) : items.length === 0 ? (
              <div className="campana-vacia">
                <span aria-hidden="true">📭</span>
                Sin notificaciones
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  className={`campana-item ${!n.read_at ? 'sin-leer' : ''}`}
                  onClick={() => abrirNotificacion(n)}
                >
                  <span className="campana-icono" aria-hidden="true">
                    {ICONOS[n.kind] || ICONOS.general}
                  </span>
                  <span className="campana-texto">
                    <strong>{n.title}</strong>
                    <small>{n.body}</small>
                    <em>{tiempoRelativo(n.created_at)}</em>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function tiempoRelativo(fecha) {
  const d = new Date(fecha)
  const segundos = Math.floor((Date.now() - d.getTime()) / 1000)

  if (segundos < 60) return 'hace un momento'
  if (segundos < 3600) return `hace ${Math.floor(segundos / 60)} min`
  if (segundos < 86400) return `hace ${Math.floor(segundos / 3600)} h`
  if (segundos < 604800) return `hace ${Math.floor(segundos / 86400)} d`

  return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })
}

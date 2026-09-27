import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtNumero, fmtFecha } from '../lib/formato'

/**
 * P08_ACTUALIZACION · Tasa BCV siempre a mano en el menú.
 * Azul: tasa vigente hoy. Ámbar: la última tasa registrada es de otro día.
 */
export default function TasaMenu({ movil = false }) {
  const [tasa, setTasa] = useState(null)
  const [cargando, setCargando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const { data } = await supabase.rpc('rate_health')
      if (data) setTasa(data)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
    const intervalo = setInterval(cargar, 30 * 60 * 1000)
    return () => clearInterval(intervalo)
  }, [cargar])

  if (!tasa) return null

  const dias = Number(tasa.dias_antiguedad)
  const sinTasa = !tasa.tasa
  const vieja = sinTasa || dias > 0
  const detalle = sinTasa
    ? 'Sin tasa registrada'
    : dias > 0
    ? `Tasa del ${fmtFecha(tasa.fecha)}`
    : dias < 0
    ? `Vigente desde ${fmtFecha(tasa.fecha)}`
    : 'Vigente hoy'

  return (
    <div
      style={{
        background: vieja ? '#b45309' : '#1e40af',
        color: '#ffffff',
        borderRadius: 8,
        padding: '8px 10px',
        margin: movil ? '8px 12px' : '0 0 10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em' }}>TASA BCV</div>
        {!sinTasa && (
          <div style={{ fontSize: '1.05rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
            Bs. {fmtNumero(tasa.tasa)}
          </div>
        )}
        <div style={{ fontSize: '0.72rem' }}>{detalle}</div>
      </div>
      <button
        type="button"
        onClick={cargar}
        disabled={cargando}
        title="Volver a consultar la tasa"
        style={{
          background: '#ffffff',
          color: '#0f172a',
          border: 'none',
          borderRadius: 6,
          padding: '6px 8px',
          fontSize: '0.75rem',
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {cargando ? 'Consultando…' : '↻ Actualizar'}
      </button>
    </div>
  )
}

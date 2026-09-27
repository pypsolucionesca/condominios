import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtNumero, fmtFecha } from '../lib/formato'

/**
 * P08_ACTUALIZACION · P09_TASA_EURO
 * Tasa BCV (dólar y euro) siempre a mano en el menú, con los colores del menú.
 * Punto verde: tasa de hoy. Punto ámbar: la última tasa registrada es de otro día.
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
  const nota = sinTasa ? 'Regístrela en Ajustes' : dias > 0 ? `Tasa del ${fmtFecha(tasa.fecha)}` : null

  const etiqueta = { fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.04em' }
  const valor = { fontSize: '0.92rem', fontWeight: 800, color: '#ffffff' }

  return (
    <div
      style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 10,
        padding: '8px 8px 8px 10px',
        margin: movil ? '8px 12px' : '0 0 10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            flexShrink: 0,
            background: vieja ? '#f59e0b' : '#22c55e',
          }}
        />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {!sinTasa && (
            <span style={{ whiteSpace: 'nowrap' }}>
              <span style={etiqueta}>BCV </span>
              <span style={valor}>{fmtNumero(tasa.tasa)}</span>
            </span>
          )}
          {!sinTasa && tasa.euro && (
            <span style={{ whiteSpace: 'nowrap' }}>
              <span style={etiqueta}>EUR </span>
              <span style={valor}>{fmtNumero(tasa.euro)}</span>
            </span>
          )}
          {sinTasa && <span style={{ ...valor, fontSize: '0.8rem' }}>Sin tasa</span>}
        </div>
        <button
          type="button"
          onClick={cargar}
          disabled={cargando}
          title="Volver a consultar la tasa"
          aria-label="Actualizar tasa"
          style={{
            width: 30,
            height: 30,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0f172a',
            color: '#e2e8f0',
            border: '1px solid #334155',
            borderRadius: 8,
            fontSize: '0.95rem',
            cursor: 'pointer',
            opacity: cargando ? 0.6 : 1,
          }}
        >
          ↻
        </button>
      </div>
      {nota && (
        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#fbbf24', marginTop: 4, paddingLeft: 16 }}>
          {nota}
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Panel } from './UI'

const PREGUNTAS_FRECUENTES = [
  {
    modulo: 'Configuración y Arranque',
    preguntas: [
      {
        q: '¿Cómo configuro la tasa de cambio?',
        a: 'El sistema consulta la tasa oficial del BCV automáticamente todos los días. Solo necesita registrar una tasa manual en Configuración > Tasa de cambio si necesita registrar un pago con fecha anterior y aplicar la tasa exacta de ese día.'
      },
      {
        q: '¿Qué diferencia hay entre Cuota Fija y Alícuota?',
        a: 'En Cuota Fija, usted define un monto estándar (ej. $50) que se cobra a todos por igual (configurable por unidad). En Alícuota, usted define un presupuesto mensual (ej. $1000) y el sistema lo divide automáticamente según el porcentaje de propiedad de cada apartamento.'
      }
    ]
  },
  {
    modulo: 'Cobranza y Avisos',
    preguntas: [
      {
        q: '¿Por qué no puedo borrar un aviso emitido?',
        a: 'Por seguridad contable y auditoría, los recibos emitidos no se eliminan, se "Anulan". Al anularlo, la deuda desaparece del estado de cuenta del residente, pero queda el registro de que existió y fue revertido.'
      },
      {
        q: '¿Cómo cobro una multa o un consumo extra a un solo vecino?',
        a: 'Utilice el botón "Cargo individual" dentro del módulo de Cobranza. Elija la unidad, el concepto y el monto. Esto le generará un aviso de cobro independiente a ese residente sin afectar al resto del edificio.'
      }
    ]
  },
  {
    modulo: 'Tesorería y Pagos',
    preguntas: [
      {
        q: '¿Cómo corrijo un gasto si me equivoqué en el monto?',
        a: 'Los montos de los gastos no se pueden editar directamente porque alteran el saldo de las cuentas de forma silenciosa. Debe anular el gasto incorrecto (lo que devuelve el dinero a la cuenta) y registrar uno nuevo con el monto correcto.'
      },
      {
        q: '¿Para qué sirve el Ajuste de Arqueo?',
        a: 'Se utiliza en la pestaña Cuentas > Comisión o Ajuste. Sirve para cuadrar el saldo del sistema con la realidad de su banco o caja física cuando hay discrepancias por comisiones bancarias, redondeos o intereses ganados.'
      }
    ]
  }
]

export default function CentroAyuda({ abierto, onCerrar }) {
  const [expandido, setExpandido] = useState(null)

  const toggle = (index) => {
    setExpandido(expandido === index ? null : index)
  }

  return (
    <Panel
      abierto={abierto}
      titulo={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span aria-hidden="true" style={{ fontSize: '1.2rem' }}>💡</span>
          Centro de Ayuda
        </div>
      }
      onCerrar={onCerrar}
      ancho={450}
    >
      <p className="texto-ayuda" style={{ marginBottom: '20px' }}>
        Respuestas rápidas a las consultas operativas más comunes de P&P Admin.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {PREGUNTAS_FRECUENTES.map((seccion, sIdx) => (
          <div key={sIdx}>
            <h4 className="subtitulo" style={{ marginBottom: '8px', color: 'var(--primary-color)' }}>
              {seccion.modulo}
            </h4>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
              {seccion.preguntas.map((item, pIdx) => {
                const id = `${sIdx}-${pIdx}`
                const estaAbierto = expandido === id

                return (
                  <div 
                    key={pIdx} 
                    style={{ 
                      borderBottom: pIdx !== seccion.preguntas.length - 1 ? '1px solid #e5e7eb' : 'none' 
                    }}
                  >
                    <button
                      onClick={() => toggle(id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        background: estaAbierto ? '#f9fafb' : 'white',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '0.95rem',
                        fontWeight: 500,
                        color: 'var(--text-main)',
                        transition: 'background 0.2s'
                      }}
                    >
                      <span>{item.q}</span>
                      <span style={{ fontSize: '0.8rem', color: '#6b7280', transform: estaAbierto ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        ▼
                      </span>
                    </button>
                    
                    {estaAbierto && (
                      <div style={{ padding: '0 16px 16px 16px', background: '#f9fafb', fontSize: '0.9rem', color: '#4b5563', lineHeight: '1.5' }}>
                        {item.a}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '30px', padding: '16px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
        <strong style={{ display: 'block', color: '#1e3a8a', marginBottom: '4px' }}>¿Necesita soporte técnico?</strong>
        <small style={{ color: '#3b82f6' }}>Si experimenta una falla en el sistema, contacte a P&P Soluciones indicando el nombre de su condominio y una captura de pantalla del error.</small>
      </div>

    </Panel>
  )
}
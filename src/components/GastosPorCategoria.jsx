import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtUSD } from '../lib/formato'
import { Vacio } from './UI'

const COLORES = [
  '#1d4ed8', '#0891b2', '#16a34a', '#d97706',
  '#dc2626', '#7c3aed', '#db2777', '#64748b',
]

const MESES_ATRAS = 3
const MINIMO_PARA_GRAFICAR = 3

/**
 * Reparto del gasto por categoría en los últimos meses.
 *
 * Responde a la pregunta que se hace en toda asamblea: en qué se va el
 * dinero. Se dibuja en SVG en lugar de usar una librería de gráficos
 * porque una sola dona no justifica sumar cientos de kilobytes al bundle.
 *
 * Con menos de tres categorías se muestra una tabla: un gráfico circular
 * de dos porciones no aporta nada que el número no diga mejor.
 */
export default function GastosPorCategoria({ condominiumId }) {
  const [datos, setDatos] = useState([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [activo, setActivo] = useState(null)

  useEffect(() => {
    if (!condominiumId) {
      setCargando(false)
      return
    }

    const desde = new Date()
    desde.setMonth(desde.getMonth() - MESES_ATRAS)

    supabase
      .from('expenses')
      .select('amount_usd, expense_categories:category_id (name)')
      .eq('condominium_id', condominiumId)
      .gte('expense_date', desde.toISOString().slice(0, 10))
      .then(({ data, error }) => {
        if (error || !data) {
          setCargando(false)
          return
        }

        const acumulado = {}
        let suma = 0

        for (const g of data) {
          const nombre = g.expense_categories?.name || 'Sin categoría'
          const monto = Number(g.amount_usd) || 0
          acumulado[nombre] = (acumulado[nombre] || 0) + monto
          suma += monto
        }

        const lista = Object.entries(acumulado)
          .map(([nombre, monto]) => ({ nombre, monto }))
          .sort((a, b) => b.monto - a.monto)

        setDatos(lista)
        setTotal(suma)
        setCargando(false)
      })
  }, [condominiumId])

  if (cargando || total === 0) return null

  return (
    <div className="card">
      <h2 className="card-header">En qué se ha gastado</h2>
      <p className="texto-ayuda">Últimos {MESES_ATRAS} meses · {fmtUSD(total)} en total</p>

      {datos.length < MINIMO_PARA_GRAFICAR ? (
        <TablaCategorias datos={datos} total={total} />
      ) : (
        <div className="grafico-contenedor">
          <Dona datos={datos} total={total} activo={activo} onActivo={setActivo} />
          <Leyenda datos={datos} total={total} activo={activo} onActivo={setActivo} />
        </div>
      )}
    </div>
  )
}

function Dona({ datos, total, activo, onActivo }) {
  const radio = 70
  const grosor = 26
  const centro = 90

  let anguloAcumulado = -90

  const segmentos = datos.map((d, i) => {
    const porcion = d.monto / total
    const angulo = porcion * 360
    const inicio = anguloAcumulado
    anguloAcumulado += angulo

    return {
      ...d,
      indice: i,
      path: arco(centro, centro, radio, grosor, inicio, inicio + angulo),
      color: COLORES[i % COLORES.length],
      porcentaje: porcion * 100,
    }
  })

  const destacado = activo !== null ? segmentos[activo] : null

  return (
    <svg viewBox="0 0 180 180" className="grafico-dona" role="img" aria-label="Gastos por categoría">
      {segmentos.map((s) => (
        <path
          key={s.indice}
          d={s.path}
          fill={s.color}
          opacity={activo === null || activo === s.indice ? 1 : 0.35}
          onMouseEnter={() => onActivo(s.indice)}
          onMouseLeave={() => onActivo(null)}
          style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
        />
      ))}

      <text x={centro} y={centro - 4} textAnchor="middle" className="dona-valor">
        {destacado ? `${destacado.porcentaje.toFixed(0)}%` : fmtUSD(total)}
      </text>
      <text x={centro} y={centro + 12} textAnchor="middle" className="dona-etiqueta">
        {destacado ? recortar(destacado.nombre, 16) : 'Total'}
      </text>
    </svg>
  )
}

function Leyenda({ datos, total, activo, onActivo }) {
  return (
    <ul className="grafico-leyenda">
      {datos.map((d, i) => (
        <li
          key={d.nombre}
          className={activo === i ? 'activo' : ''}
          onMouseEnter={() => onActivo(i)}
          onMouseLeave={() => onActivo(null)}
        >
          <span className="punto" style={{ background: COLORES[i % COLORES.length] }} />
          <span className="nombre">{d.nombre}</span>
          <span className="monto">{fmtUSD(d.monto)}</span>
          <span className="porcentaje">{((d.monto / total) * 100).toFixed(1)}%</span>
        </li>
      ))}
    </ul>
  )
}

function TablaCategorias({ datos, total }) {
  return (
    <ul className="grafico-leyenda sin-grafico">
      {datos.map((d, i) => (
        <li key={d.nombre}>
          <span className="punto" style={{ background: COLORES[i % COLORES.length] }} />
          <span className="nombre">{d.nombre}</span>
          <span className="monto">{fmtUSD(d.monto)}</span>
          <span className="porcentaje">{((d.monto / total) * 100).toFixed(1)}%</span>
        </li>
      ))}
    </ul>
  )
}

/** Genera el path SVG de un segmento de dona. */
function arco(cx, cy, radioExterno, grosor, gradoInicio, gradoFin) {
  const radioInterno = radioExterno - grosor

  // Un segmento de 360° no se puede dibujar con un solo arco
  const fin = gradoFin - gradoInicio >= 360 ? gradoInicio + 359.99 : gradoFin

  const p1 = polar(cx, cy, radioExterno, gradoInicio)
  const p2 = polar(cx, cy, radioExterno, fin)
  const p3 = polar(cx, cy, radioInterno, fin)
  const p4 = polar(cx, cy, radioInterno, gradoInicio)

  const arcoLargo = fin - gradoInicio > 180 ? 1 : 0

  return [
    `M ${p1.x} ${p1.y}`,
    `A ${radioExterno} ${radioExterno} 0 ${arcoLargo} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${radioInterno} ${radioInterno} 0 ${arcoLargo} 0 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ')
}

function polar(cx, cy, radio, grados) {
  const rad = (grados * Math.PI) / 180
  return { x: cx + radio * Math.cos(rad), y: cy + radio * Math.sin(rad) }
}

function recortar(texto, max) {
  return texto.length > max ? texto.slice(0, max - 1) + '…' : texto
}

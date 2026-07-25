import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmtUSD, fmtFecha, etiqueta } from '../lib/formato'
import { Cargador } from '../components/UI'

/**
 * Estado de cuenta detallado de UNA unidad, para el administrador.
 *
 * Se llega haciendo clic en una unidad desde el Panel (morosos) o desde
 * Unidades. Reutiliza la RPC unit_statement (la misma que ve el residente
 * en Mi cuenta), pero recibe la unidad por la URL para poder consultar
 * cualquiera. Resume lo pendiente y muestra el detalle de movimientos.
 */
export default function EstadoUnidad() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { condominio } = useAuth()

  const [unidad, setUnidad] = useState(null)
  const [movimientos, setMovimientos] = useState([])
  const [avisos, setAvisos] = useState([])
  const [pagos, setPagos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!id) return
    let activo = true
    setCargando(true)
    setError(null)

    Promise.all([
      supabase
        .from('units')
        .select('id, code, unit_type, location_name, business_name, aliquot, fixed_fee')
        .eq('id', id)
        .maybeSingle(),
      supabase.rpc('unit_statement', { p_unit_id: id }),
      supabase
        .from('invoices')
        .select('id, invoice_number, issue_date, due_date, subtotal, previous_balance, total, status')
        .eq('unit_id', id)
        .order('issue_date', { ascending: false })
        .limit(36),
      supabase
        .from('payments')
        .select('id, payment_date, amount, currency, amount_usd, reference, status, rejection_reason')
        .eq('unit_id', id)
        .order('payment_date', { ascending: false })
        .limit(36),
    ])
      .then(([rU, rMov, rAvi, rPag]) => {
        if (!activo) return
        if (rU.error) throw rU.error
        if (rMov.error) throw rMov.error
        if (rAvi.error) throw rAvi.error
        if (rPag.error) throw rPag.error
        setUnidad(rU.data)
        setMovimientos(rMov.data || [])
        setAvisos(rAvi.data || [])
        setPagos(rPag.data || [])
      })
      .catch((err) => activo && setError(mensajeError(err)))
      .finally(() => activo && setCargando(false))

    return () => {
      activo = false
    }
  }, [id])

  // Saldo actual: último running_balance de los movimientos
  const saldo = movimientos.length
    ? Number(movimientos[movimientos.length - 1].running_balance)
    : 0

  // Resumen de lo pendiente
  const avisosPendientes = avisos.filter((a) => ['emitido', 'parcial'].includes(a.status))
  const totalPendiente = avisosPendientes.reduce((s, a) => s + Number(a.subtotal || 0), 0)
  const pagosPorVerificar = pagos.filter((p) => p.status === 'reportado').length
  const avisoMasAntiguo = avisosPendientes.length
    ? avisosPendientes.reduce((min, a) => (a.due_date < min.due_date ? a : min))
    : null
  const diasMora = avisoMasAntiguo
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(avisoMasAntiguo.due_date + 'T00:00:00')) / 86400000)
      )
    : 0

  const descargarEstado = async () => {
    try {
      const { pdfEstadoCuenta, logoParaPdf, descargarPdf } = await import('../lib/pdf')
      const logo = await logoParaPdf(condominio?.logo_url)
      const doc = pdfEstadoCuenta({ unidad, movimientos, condominio, saldo, logoDataUrl: logo })
      descargarPdf(doc, `Estado-cuenta-${unidad?.code || ''}.pdf`)
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  if (cargando) return <Cargador texto="Cargando estado de cuenta…" />

  if (!unidad) {
    return (
      <div className="card">
        <h2 className="card-header">Unidad no encontrada</h2>
        <button className="btn btn-secundario" onClick={() => navigate(-1)}>
          ← Volver
        </button>
      </div>
    )
  }

  const nombreUnidad =
    unidad.unit_type === 'local_comercial' && unidad.business_name
      ? `${unidad.code} · ${unidad.business_name}`
      : unidad.location_name
      ? `${unidad.code} · ${unidad.location_name}`
      : unidad.code

  return (
    <>
      <div className="pagina-cabecera">
        <button className="btn btn-secundario btn-auto" onClick={() => navigate(-1)}>
          ← Volver
        </button>
      </div>

      {/* Resumen destacado */}
      <div className="card">
        <div className={`saldo-destacado ${saldo > 0 ? 'saldo-deuda' : 'saldo-favor'}`}>
          <span className="saldo-etiqueta">
            {saldo > 0 ? 'Saldo pendiente' : saldo < 0 ? 'Saldo a favor' : 'Estado'}
          </span>
          <strong className="saldo-monto">
            {saldo === 0 ? 'Solvente' : fmtUSD(Math.abs(saldo))}
          </strong>
          <span className="saldo-unidad">{nombreUnidad}</span>
        </div>

        <div className="resumen-cuadros">
          <div className="resumen-cuadro">
            <small>Avisos pendientes</small>
            <strong>{avisosPendientes.length}</strong>
          </div>
          <div className="resumen-cuadro">
            <small>Cargos por cobrar</small>
            <strong>{fmtUSD(totalPendiente)}</strong>
          </div>
          <div className="resumen-cuadro">
            <small>Días de mora</small>
            <strong className={diasMora > 0 ? 'texto-danger' : ''}>{diasMora}</strong>
          </div>
          {pagosPorVerificar > 0 && (
            <div className="resumen-cuadro">
              <small>Pagos por verificar</small>
              <strong className="texto-warning">{pagosPorVerificar}</strong>
            </div>
          )}
        </div>
      </div>

      {error && <div className="alerta alerta-error">{error}</div>}

      {/* Avisos de cobro */}
      <div className="card">
        <h2 className="card-header">Avisos de cobro</h2>
        {avisos.length === 0 ? (
          <p className="texto-vacio">No hay avisos de cobro registrados.</p>
        ) : (
          <ul className="list-group">
            {avisos.map((a) => (
              <li key={a.id} className="list-item">
                <div>
                  <strong>Aviso N° {a.invoice_number}</strong>
                  <small>
                    Emitido {fmtFecha(a.issue_date)} · Vence {fmtFecha(a.due_date)}
                  </small>
                </div>
                <div className="list-item-derecha">
                  <span className={`badge badge-${a.status}`}>{etiqueta(a.status)}</span>
                  <strong>{fmtUSD(a.subtotal)}</strong>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pagos */}
      <div className="card">
        <h2 className="card-header">Pagos</h2>
        {pagos.length === 0 ? (
          <p className="texto-vacio">No hay pagos registrados.</p>
        ) : (
          <ul className="list-group">
            {pagos.map((p) => (
              <li key={p.id} className="list-item">
                <div>
                  <strong>{fmtFecha(p.payment_date)}</strong>
                  <small>
                    {p.currency === 'VES'
                      ? `Bs. ${Number(p.amount).toLocaleString('es-VE')} → ${fmtUSD(p.amount_usd)}`
                      : fmtUSD(p.amount)}
                    {p.reference ? ` · Ref. ${p.reference}` : ''}
                  </small>
                  {p.status === 'rechazado' && p.rejection_reason && (
                    <small className="texto-danger">Motivo: {p.rejection_reason}</small>
                  )}
                </div>
                <span className={`badge badge-${p.status}`}>{etiqueta(p.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Movimientos (estado de cuenta contable) */}
      <div className="card">
        <div className="card-header-flex">
          <h2>Estado de cuenta</h2>
          {movimientos.length > 0 && (
            <button className="btn btn-secundario btn-auto" onClick={descargarEstado}>
              Descargar PDF
            </button>
          )}
        </div>
        {movimientos.length === 0 ? (
          <p className="texto-vacio">No hay movimientos registrados.</p>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th className="der">Cargo</th>
                  <th className="der">Abono</th>
                  <th className="der">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m, i) => (
                  <tr key={i}>
                    <td>{fmtFecha(m.entry_date)}</td>
                    <td>{m.description}</td>
                    <td className="der">{Number(m.debit_usd) > 0 ? fmtUSD(m.debit_usd) : '—'}</td>
                    <td className="der">{Number(m.credit_usd) > 0 ? fmtUSD(m.credit_usd) : '—'}</td>
                    <td className="der">
                      <strong>{fmtUSD(m.running_balance)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

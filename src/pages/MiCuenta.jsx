import { useEffect, useState } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const fmtUSD = (n) =>
  new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }).format(Number(n) || 0)

const fmtFecha = (f) => {
  if (!f) return '—'
  const d = new Date(f + 'T00:00:00')
  return isNaN(d) ? f : d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function MiCuenta() {
  const { unidades, perfil, condominio } = useAuth()
  const [unidadSel, setUnidadSel] = useState(null)
  const [movimientos, setMovimientos] = useState([])
  const [avisos, setAvisos] = useState([])
  const [pagos, setPagos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (unidades.length && !unidadSel) setUnidadSel(unidades[0].id)
  }, [unidades, unidadSel])

  useEffect(() => {
    if (!unidadSel) {
      setCargando(false)
      return
    }

    let activo = true
    setCargando(true)
    setError(null)

    Promise.all([
      supabase.rpc('unit_statement', { p_unit_id: unidadSel }),
      supabase
        .from('invoices')
        .select('id, invoice_number, issue_date, due_date, total, status')
        .eq('unit_id', unidadSel)
        .order('issue_date', { ascending: false })
        .limit(24),
      supabase
        .from('payments')
        .select('id, payment_date, amount, currency, amount_usd, reference, status, rejection_reason')
        .eq('unit_id', unidadSel)
        .order('payment_date', { ascending: false })
        .limit(24),
    ])
      .then(([rMov, rAvi, rPag]) => {
        if (!activo) return
        if (rMov.error) throw rMov.error
        if (rAvi.error) throw rAvi.error
        if (rPag.error) throw rPag.error
        setMovimientos(rMov.data || [])
        setAvisos(rAvi.data || [])
        setPagos(rPag.data || [])
      })
      .catch((err) => activo && setError(mensajeError(err)))
      .finally(() => activo && setCargando(false))

    return () => {
      activo = false
    }
  }, [unidadSel])

  const unidad = unidades.find((u) => u.id === unidadSel)

  const saldo = movimientos.length
    ? Number(movimientos[movimientos.length - 1].running_balance)
    : 0

  const descargarEstado = async () => {
    try {
      const { pdfEstadoCuenta, logoParaPdf, descargarPdf } = await import('../lib/pdf')
      const logo = await logoParaPdf(condominio?.logo_url)
      const doc = pdfEstadoCuenta({
        unidad,
        movimientos,
        condominio,
        saldo,
        logoDataUrl: logo,
      })
      descargarPdf(doc, `Estado-cuenta-${unidad?.code || ''}.pdf`)
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  if (!unidades.length) {
    return (
      <div className="card">
        <h2 className="card-header">Sin apartamento asignado</h2>
        <p>
          Su usuario aún no está vinculado a ningún apartamento. Comuníquese con la
          administración del condominio para completar su registro.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="card">
        <h2 className="card-header">Hola, {perfil?.full_name || 'residente'}</h2>

        {unidades.length > 1 && (
          <div className="form-group">
            <label htmlFor="unidad">Apartamento</label>
            <select
              id="unidad"
              className="form-control"
              value={unidadSel || ''}
              onChange={(e) => setUnidadSel(e.target.value)}
            >
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} {u.tower ? `· Torre ${u.tower}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={`saldo-destacado ${saldo > 0 ? 'saldo-deuda' : 'saldo-favor'}`}>
          <span className="saldo-etiqueta">
            {saldo > 0 ? 'Saldo pendiente' : saldo < 0 ? 'Saldo a favor' : 'Estado'}
          </span>
          <strong className="saldo-monto">
            {saldo === 0 ? 'Solvente' : fmtUSD(Math.abs(saldo))}
          </strong>
          <span className="saldo-unidad">Apartamento {unidad?.code}</span>
        </div>
      </div>

      {error && <div className="alerta alerta-error">{error}</div>}
      {cargando && <div className="card">Cargando su estado de cuenta…</div>}

      {!cargando && (
        <>
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
                      <span className={`badge badge-${a.status}`}>{etiquetaEstado(a.status)}</span>
                      <strong>{fmtUSD(a.total)}</strong>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h2 className="card-header">Mis pagos</h2>
            {pagos.length === 0 ? (
              <p className="texto-vacio">Aún no ha reportado pagos.</p>
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
                        <small className="texto-error">Motivo: {p.rejection_reason}</small>
                      )}
                    </div>
                    <span className={`badge badge-${p.status}`}>{etiquetaEstado(p.status)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

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
      )}
    </>
  )
}

function etiquetaEstado(s) {
  const mapa = {
    borrador: 'Borrador',
    emitido: 'Pendiente',
    parcial: 'Abonado',
    pagado: 'Pagado',
    anulado: 'Anulado',
    reportado: 'Por verificar',
    confirmado: 'Confirmado',
    rechazado: 'Rechazado',
  }
  return mapa[s] || s
}

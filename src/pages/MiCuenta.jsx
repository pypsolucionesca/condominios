import { useEffect, useState, useMemo } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { DetalleAviso, DetallePago } from '../components/Detalles'
import { normalizar, fmtMesAno } from '../lib/formato'

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
  const [saldo, setSaldo] = useState(0)
  const [avisoDetalle, setAvisoDetalle] = useState(null)
  const [pagoDetalle, setPagoDetalle] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')

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
      // Traemos invoice_items para mostrar el concepto real en la vista externa
      supabase
        .from('invoices')
        .select('id, invoice_number, issue_date, due_date, subtotal, total, status, notes, billing_periods(period), payment_allocations(amount_usd), invoice_items(description)')
        .eq('unit_id', unidadSel)
        .order('issue_date', { ascending: false })
        .limit(24),
      supabase
        .from('payments')
        .select('id, payment_date, amount, currency, amount_usd, reference, status, rejection_reason, payment_allocations(amount_usd, invoices(invoice_number, notes, billing_periods(period), invoice_items(description)))')
        .eq('unit_id', unidadSel)
        .order('payment_date', { ascending: false })
        .limit(24),
      supabase.rpc('unit_balance', { p_unit_id: unidadSel }),
    ])
      .then(([rMov, rAvi, rPag, rSaldo]) => {
        if (!activo) return
        if (rMov.error) throw rMov.error
        if (rAvi.error) throw rAvi.error
        if (rPag.error) throw rPag.error
        if (rSaldo.error) throw rSaldo.error
        
        setMovimientos(rMov.data || [])
        
        const avisosProcesados = (rAvi.data || []).map(a => {
          const pagado = a.payment_allocations?.reduce((acc, p) => acc + Number(p.amount_usd), 0) || 0
          let estadoReal = a.status
          if (a.status !== 'anulado') {
            estadoReal = pagado >= a.subtotal ? 'pagado' : (pagado > 0 ? 'parcial' : 'emitido')
          }
          return { ...a, status: estadoReal, pagado }
        })
        
        setAvisos(avisosProcesados)
        setPagos(rPag.data || [])
        setSaldo(Number(rSaldo.data) || 0)
      })
      .catch((err) => activo && setError(mensajeError(err)))
      .finally(() => activo && setCargando(false))

    return () => {
      activo = false
    }
  }, [unidadSel])

  const unidad = unidades.find((u) => u.id === unidadSel)

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

  // Filtrado tolerante a errores ortográficos
  const avisosVisibles = useMemo(() => {
    const q = normalizar(busqueda)
    return avisos.filter(a => {
      if (!q) return true
      
      const conceptosStr = a.invoice_items?.length > 0 
        ? a.invoice_items.map(i => i.description).join(' ')
        : (a.billing_periods?.period ? fmtMesAno(a.billing_periods.period) : a.notes || 'Cargo puntual')

      return normalizar(String(a.invoice_number)).includes(q) || 
             normalizar(conceptosStr).includes(q) || 
             normalizar(etiquetaEstado(a.status)).includes(q)
    })
  }, [avisos, busqueda])

  const pagosVisibles = useMemo(() => {
    const q = normalizar(busqueda)
    return pagos.filter(p => {
      if (!q) return true
      const conceptosPagados = p.payment_allocations?.map(pa => {
        const inv = pa.invoices
        if (!inv) return ''
        const conceptosInv = inv.invoice_items?.length > 0 
          ? inv.invoice_items.map(i => i.description).join(' ')
          : (inv.billing_periods?.period ? fmtMesAno(inv.billing_periods.period) : inv.notes || 'Cargo')
        return `${conceptosInv} (Aviso ${inv.invoice_number})`
      }).join(' ') || ''

      return normalizar(p.reference || '').includes(q) || 
             normalizar(conceptosPagados).includes(q) || 
             normalizar(fmtUSD(p.amount_usd)).includes(q) ||
             normalizar(etiquetaEstado(p.status)).includes(q)
    })
  }, [pagos, busqueda])

  const movimientosVisibles = useMemo(() => {
    const q = normalizar(busqueda)
    return movimientos.filter(m => {
      if (!q) return true
      return normalizar(m.description).includes(q) || normalizar(fmtUSD(m.running_balance)).includes(q)
    })
  }, [movimientos, busqueda])

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
          {saldo < 0 && (
            <span className="saldo-nota">
              Este monto se aplicará automáticamente a su próximo recibo.
            </span>
          )}
        </div>
      </div>

      {!cargando && (
        <div className="barra-filtros">
          <input
            className="form-control"
            placeholder="Buscar por concepto, número de aviso, referencia o estado…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      )}

      {error && <div className="alerta alerta-error">{error}</div>}
      {cargando && <div className="card">Cargando su estado de cuenta…</div>}

      {!cargando && (
        <>
          <div className="card">
            <h2 className="card-header">Avisos de cobro</h2>
            {avisosVisibles.length === 0 ? (
              <p className="texto-vacio">No hay avisos de cobro que coincidan.</p>
            ) : (
              <ul className="list-group">
                {avisosVisibles.map((a) => {
                  const conceptosAviso = a.invoice_items?.length > 0 
                    ? a.invoice_items.map(i => i.description).join(' + ')
                    : (a.billing_periods?.period ? fmtMesAno(a.billing_periods.period) : a.notes || 'Cargo puntual');

                  return (
                    <li
                      key={a.id}
                      className="list-item list-item-clicable"
                      onClick={() => setAvisoDetalle(a.id)}
                    >
                      <div>
                        <strong style={{ display: 'block', fontSize: '1.1rem', marginBottom: '4px', color: 'var(--text-main)' }}>
                          {conceptosAviso}
                        </strong>
                        <strong>Aviso N° {a.invoice_number}</strong>
                        <small className="bloque">
                          Emitido {fmtFecha(a.issue_date)} · Vence {fmtFecha(a.due_date)}
                        </small>
                      </div>
                      <div className="list-item-derecha">
                        <span className={`badge badge-${a.status}`}>{etiquetaEstado(a.status)}</span>
                        <strong style={{ fontSize: '1.1rem' }}>{fmtUSD(a.subtotal)}</strong>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="card">
            <h2 className="card-header">Mis pagos</h2>
            {pagosVisibles.length === 0 ? (
              <p className="texto-vacio">Aún no ha reportado pagos o no coinciden con la búsqueda.</p>
            ) : (
              <ul className="list-group">
                {pagosVisibles.map((p) => {
                  const conceptosPagados = p.payment_allocations?.map(pa => {
                    const inv = pa.invoices
                    if (!inv) return ''
                    const conceptosInv = inv.invoice_items?.length > 0 
                      ? inv.invoice_items.map(i => i.description).join(' + ')
                      : (inv.billing_periods?.period ? fmtMesAno(inv.billing_periods.period) : inv.notes || 'Cargo')
                    return `${conceptosInv} (Aviso N° ${inv.invoice_number})`
                  }).filter(Boolean).join(', ')

                  return (
                    <li
                      key={p.id}
                      className="list-item list-item-clicable"
                      onClick={() => setPagoDetalle(p.id)}
                    >
                      <div>
                        <strong style={{ display: 'block', fontSize: '1.05rem', marginBottom: '2px', color: 'var(--text-main)' }}>
                          {conceptosPagados ? `Pago a: ${conceptosPagados}` : 'Pago recibido'}
                        </strong>
                        <strong>{fmtFecha(p.payment_date)}</strong>
                        <small className="bloque">
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
                  )
                })}
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
            {movimientosVisibles.length === 0 ? (
              <p className="texto-vacio">No hay movimientos registrados o que coincidan.</p>
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
                    {movimientosVisibles.map((m, i) => (
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

      <DetalleAviso
        invoiceId={avisoDetalle}
        abierto={!!avisoDetalle}
        onCerrar={() => setAvisoDetalle(null)}
        soloLectura
      />
      <DetallePago
        paymentId={pagoDetalle}
        abierto={!!pagoDetalle}
        onCerrar={() => setPagoDetalle(null)}
      />
    </>
  )
}

function etiquetaEstado(s) {
  const mapa = {
    borrador: 'Borrador',
    emitido: 'Pendiente',
    parcial: 'Pago parcial',
    pagado: 'Pagado',
    exonerado: 'Exonerado',
    anulado: 'Anulado',
    reportado: 'Por verificar',
    confirmado: 'Confirmado',
    rechazado: 'Rechazado',
  }
  return mapa[s] || s
}
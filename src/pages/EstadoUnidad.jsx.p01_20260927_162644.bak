import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmtUSD, fmtFecha, etiqueta, normalizar, fmtMesAno } from '../lib/formato'
import { Cargador } from '../components/UI'
import { DetalleAviso, DetallePago } from '../components/Detalles'

export default function EstadoUnidad() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { condominio } = useAuth()

  const [unidad, setUnidad] = useState(null)
  const [movimientos, setMovimientos] = useState([])
  const [avisos, setAvisos] = useState([])
  const [pagos, setPagos] = useState([])
  const [saldo, setSaldo] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')

  const [avisoDetalle, setAvisoDetalle] = useState(null)
  const [pagoDetalle, setPagoDetalle] = useState(null)

  const cargar = useCallback(() => {
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
        .select('id, invoice_number, issue_date, due_date, subtotal, previous_balance, total, status, notes, billing_periods(period), payment_allocations(amount_usd), invoice_items(description)')
        .eq('unit_id', id)
        .order('issue_date', { ascending: false })
        .limit(36),
      supabase
        .from('payments')
        .select('id, payment_date, amount, currency, amount_usd, reference, status, rejection_reason, payment_allocations(amount_usd, invoices(invoice_number, notes, billing_periods(period), invoice_items(description)))')
        .eq('unit_id', id)
        .order('payment_date', { ascending: false })
        .limit(36),
      supabase.rpc('unit_balance', { p_unit_id: id }),
    ])
      .then(([rU, rMov, rAvi, rPag, rSaldo]) => {
        if (!activo) return
        if (rU.error) throw rU.error
        if (rMov.error) throw rMov.error
        if (rAvi.error) throw rAvi.error
        if (rPag.error) throw rPag.error
        if (rSaldo.error) throw rSaldo.error
        
        setUnidad(rU.data)
        setMovimientos(rMov.data || [])
        
        let avisosProcesados = (rAvi.data || []).map(a => {
          const pagadoDirecto = a.payment_allocations?.reduce((acc, p) => acc + Number(p.amount_usd), 0) || 0
          let estadoReal = a.status
          if (a.status !== 'anulado') {
            estadoReal = pagadoDirecto >= a.subtotal ? 'pagado' : (pagadoDirecto > 0 ? 'parcial' : 'emitido')
          }
          const conceptoPrincipal = a.invoice_items?.[0]?.description || ''
          return { ...a, status: estadoReal, pagado: pagadoDirecto, conceptoPrincipal }
        })

        // MOTOR DE AUTO-CONCILIACIÓN (CERO SOPORTE)
        const saldoGlobal = Number(rSaldo.data) || 0
        const deudaAbiertaVisual = avisosProcesados
          .filter(a => ['emitido', 'parcial'].includes(a.status))
          .reduce((acc, a) => acc + (Number(a.subtotal) - Number(a.pagado)), 0)
          
        let efectivoFlotante = deudaAbiertaVisual - saldoGlobal

        // Si el admin olvidó amarrar un pago a una factura pero hay dinero flotante en caja, se asigna en cascada automáticamente.
        if (efectivoFlotante > 0.01) {
          avisosProcesados.sort((a, b) => new Date(a.issue_date) - new Date(b.issue_date))
          for (let a of avisosProcesados) {
            if (!['emitido', 'parcial'].includes(a.status)) continue
            const falta = Number(a.subtotal) - Number(a.pagado)
            if (falta > 0 && efectivoFlotante > 0.01) {
              const aplicable = Math.min(falta, efectivoFlotante)
              a.pagado = Number(a.pagado) + aplicable
              efectivoFlotante -= aplicable
              a.status = a.pagado >= (Number(a.subtotal) - 0.01) ? 'pagado' : 'parcial'
            }
          }
          avisosProcesados.sort((a, b) => new Date(b.issue_date) - new Date(a.issue_date))
        }

        setAvisos(avisosProcesados)
        setPagos(rPag.data || [])
        setSaldo(saldoGlobal)
      })
      .catch((err) => activo && setError(mensajeError(err)))
      .finally(() => activo && setCargando(false))

    return () => {
      activo = false
    }
  }, [id])

  useEffect(() => {
    const cleanup = cargar()
    return cleanup
  }, [cargar])

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

  const avisosVisibles = useMemo(() => {
    const q = normalizar(busqueda)
    return avisos.filter(a => {
      if (!q) return true
      const conceptosStr = a.invoice_items?.length > 0 
        ? a.invoice_items.map(i => i.description).join(' ')
        : (a.billing_periods?.period ? fmtMesAno(a.billing_periods.period) : a.notes || 'Cargo puntual')

      return normalizar(String(a.invoice_number)).includes(q) || 
             normalizar(conceptosStr).includes(q) || 
             normalizar(etiqueta(a.status)).includes(q)
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
        return `${conceptosInv} (Aviso N° ${inv.invoice_number})`
      }).join(' ') || ''

      return normalizar(p.reference || '').includes(q) || 
             normalizar(conceptosPagados).includes(q) || 
             normalizar(fmtUSD(p.amount_usd)).includes(q) ||
             normalizar(etiqueta(p.status)).includes(q)
    })
  }, [pagos, busqueda])

  const movimientosVisibles = useMemo(() => {
    const q = normalizar(busqueda)
    return movimientos.filter(m => {
      if (!q) return true
      return normalizar(m.description).includes(q) || normalizar(fmtUSD(m.running_balance)).includes(q)
    })
  }, [movimientos, busqueda])

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

  const avisosPendientes = avisos.filter((a) => ['emitido', 'parcial'].includes(a.status))
  const totalPendiente = avisosPendientes.reduce((s, a) => s + (Number(a.subtotal) - Number(a.pagado)), 0)
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

      <div className="barra-filtros">
        <input
          className="form-control"
          placeholder="Buscar por concepto, número de aviso, referencia o estado…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {error && <div className="alerta alerta-error">{error}</div>}

      <div className="card">
        <h2 className="card-header">Avisos de cobro</h2>
        {avisosVisibles.length === 0 ? (
          <p className="texto-vacio">No hay avisos de cobro registrados que coincidan.</p>
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
                    <span className={`badge badge-${a.status}`}>{etiqueta(a.status)}</span>
                    <strong style={{ fontSize: '1.1rem' }}>{fmtUSD(a.subtotal)}</strong>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 className="card-header">Pagos</h2>
        {pagosVisibles.length === 0 ? (
          <p className="texto-vacio">No hay pagos registrados que coincidan.</p>
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
                      <small className="texto-danger">Motivo: {p.rejection_reason}</small>
                    )}
                  </div>
                  <span className={`badge badge-${p.status}`}>{etiqueta(p.status)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="card">
        {/* FIX EN LÍNEA: Flexbox garantizado para que el botón PDF nunca se pise */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb', marginBottom: '12px' }}>
          <h2 style={{ margin: 0 }}>Estado de cuenta</h2>
          {movimientos.length > 0 && (
            <button className="btn btn-secundario btn-auto" onClick={descargarEstado} style={{ margin: 0 }}>
              Descargar PDF
            </button>
          )}
        </div>
        
        {movimientosVisibles.length === 0 ? (
          <p className="texto-vacio">No hay movimientos registrados que coincidan.</p>
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

      <DetalleAviso
        invoiceId={avisoDetalle}
        abierto={!!avisoDetalle}
        onCerrar={() => setAvisoDetalle(null)}
        onCambio={cargar}
      />
      <DetallePago
        paymentId={pagoDetalle}
        abierto={!!pagoDetalle}
        onCerrar={() => setPagoDetalle(null)}
        puedeGestionar={true}
        esAdmin={true}
        onCambio={cargar}
      />
    </>
  )
}
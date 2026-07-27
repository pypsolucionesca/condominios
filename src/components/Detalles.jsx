import { useState, useEffect, useCallback } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { urlComprobante } from '../lib/imagenes'
import { fmtUSD, fmtMoneda, fmtNumero, fmtFecha, fmtHoraLocal, etiqueta } from '../lib/formato'
import { Panel, Aviso, Cargador, Confirmar } from './UI'
import CampoFecha from './CampoFecha'

const TIPOS_CARGO = [
  { valor: 'ordinaria', etiqueta: 'Cuota ordinaria' },
  { valor: 'extraordinaria', etiqueta: 'Cuota extraordinaria' },
  { valor: 'multa', etiqueta: 'Multa' },
  { valor: 'consumo', etiqueta: 'Consumo' },
  { valor: 'interes_mora', etiqueta: 'Interés de mora' },
  { valor: 'otro', etiqueta: 'Otro' },
]

/**
 * Detalle de un aviso de cobro.
 *
 * Los montos solo se editan mientras no haya pagos aplicados: si el
 * residente ya tiene un PDF con una cifra, cambiarla en silencio genera
 * un conflicto peor que el error original. Con pagos aplicados, la vía
 * correcta es anular y emitir de nuevo.
 */
export function DetalleAviso({ invoiceId, abierto, onCerrar, onCambio, soloLectura = false }) {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [editando, setEditando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [confirmacion, setConfirmacion] = useState(null)

  const [renglones, setRenglones] = useState([])
  const [vencimiento, setVencimiento] = useState('')
  const [motivo, setMotivo] = useState('')

  const cargar = useCallback(async () => {
    if (!invoiceId) return
    setCargando(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.rpc('invoice_detail', {
        p_invoice_id: invoiceId,
      })
      if (err) throw err
      setDatos(data)
      setRenglones(
        (data.renglones || []).map((r) => ({
          kind: r.tipo,
          description: r.concepto,
          unit_price: String(r.precio),
        }))
      )
      setVencimiento(data.vencimiento)
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setCargando(false)
    }
  }, [invoiceId])

  useEffect(() => {
    if (abierto) {
      cargar()
      setEditando(false)
      setMotivo('')
    }
  }, [abierto, cargar])

  const guardar = async () => {
    setError(null)

    if (!motivo.trim()) {
      return setError('Indique el motivo de la corrección. Quedará registrado.')
    }
    if (renglones.some((r) => !r.description.trim() || !Number(r.unit_price))) {
      return setError('Todos los renglones necesitan concepto y monto.')
    }

    setEnviando(true)
    try {
      const { error: err } = await supabase.rpc('update_invoice', {
        p_invoice_id: invoiceId,
        p_items: datos.editable
          ? renglones.map((r) => ({
              kind: r.kind,
              description: r.description.trim(),
              quantity: 1,
              unit_price: Number(r.unit_price),
            }))
          : null,
        p_due_date: vencimiento || null,
        p_notes: null,
        p_reason: motivo.trim(),
      })
      if (err) throw err

      setEditando(false)
      setMotivo('')
      cargar()
      onCambio?.()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  const anular = () => {
    setConfirmacion({
      titulo: `Anular aviso N° ${datos.numero}`,
      mensaje: `Se revertirá el cargo de ${fmtUSD(datos.subtotal)} en el estado de cuenta de ${datos.unidad?.codigo}. El movimiento queda registrado.`,
      accion: async (razon) => {
        setEnviando(true)
        const { error: err } = await supabase.rpc('void_invoice', {
          p_invoice_id: invoiceId,
          p_reason: razon,
        })
        setEnviando(false)
        setConfirmacion(null)
        if (err) setError(mensajeError(err))
        else {
          cargar()
          onCambio?.()
        }
      },
    })
  }

  // Calculamos el estado real ignorando el acumulado viejo
  const estadoReal = datos?.estado === 'anulado' 
    ? 'anulado' 
    : (Number(datos?.pagado) >= Number(datos?.subtotal) 
        ? 'pagado' 
        : (Number(datos?.pagado) > 0 ? 'parcial' : 'emitido'))

  return (
    <Panel
      abierto={abierto}
      titulo={datos ? `Aviso N° ${datos.numero}` : 'Aviso de cobro'}
      onCerrar={onCerrar}
      ancho={620}
    >
      {cargando ? (
        <Cargador />
      ) : !datos ? (
        error && <Aviso tipo="error">{error}</Aviso>
      ) : (
        <>
          {error && <Aviso tipo="error" onCerrar={() => setError(null)}>{error}</Aviso>}

          <div className="detalle-cabecera">
            <div>
              <span className={`badge badge-${estadoReal}`}>{etiqueta(estadoReal)}</span>
              <h3>{datos.unidad?.codigo}</h3>
              <small>
                {datos.residentes?.[0]?.nombre || 'Sin residente vinculado'}
              </small>
            </div>
            <div className="detalle-monto">
              <small>Total del mes</small>
              <strong>{fmtUSD(datos.subtotal)}</strong>
              {Number(datos.pagado) > 0 && (
                <em>Abonado a este mes {fmtUSD(datos.pagado)}</em>
              )}
            </div>
          </div>

          <div className="detalle-datos">
            <div>
              <small>Emisión</small>
              <strong>{fmtFecha(datos.emision)}</strong>
            </div>
            <div>
              <small>Vencimiento</small>
              <strong className={datos.dias_mora > 0 ? 'texto-danger' : ''}>
                {fmtFecha(datos.vencimiento)}
                {datos.dias_mora > 0 && ` · ${datos.dias_mora} días`}
              </strong>
            </div>
            {/* Ocultamos intencionalmente la Tasa de Emisión y el Equivalente 
                para evitar cruces y confusiones con las tasas de los pagos */}
          </div>

          {!editando ? (
            <>
              <h4 className="subtitulo">Conceptos</h4>
              <table className="tabla tabla-compacta">
                <tbody>
                  {(datos.renglones || []).map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.concepto}
                        <small className="bloque">{etiqueta(r.tipo)}</small>
                      </td>
                      <td className="der">
                        <strong>{fmtUSD(r.monto)}</strong>
                      </td>
                    </tr>
                  ))}
                  {/* Se oculta la línea de "Saldo anterior" para mantener el recibo 
                      enfocado estrictamente en la cuota pura del mes */}
                  {Number(datos.credito_aplicado) > 0 && (
                    <tr>
                      <td>Saldo a favor aplicado</td>
                      <td className="der texto-exito">
                        − {fmtUSD(datos.credito_aplicado)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {(datos.pagos || []).length > 0 && (
                <>
                  <h4 className="subtitulo">Pagos aplicados</h4>
                  <ul className="list-group">
                    {datos.pagos.map((p) => (
                      <li key={p.id} className="list-item">
                        <div>
                          <strong>{fmtFecha(p.fecha)}</strong>
                          <small>
                            {p.referencia ? `Ref. ${p.referencia}` : 'Sin referencia'}
                            {p.moneda === 'VES' && Number(p.monto_usd) > 0 && ` · ${fmtMoneda(p.monto, 'VES')} (Tasa: Bs. ${fmtNumero(Number(p.monto) / Number(p.monto_usd))})`}
                          </small>
                        </div>
                        <strong>{fmtUSD(p.monto_usd)}</strong>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {datos.motivo_bloqueo && (
                <Aviso tipo="aviso">{datos.motivo_bloqueo}</Aviso>
              )}

              {!soloLectura && (
                <div className="panel-acciones">
                  {datos.estado !== 'anulado' && (
                    <button className="btn btn-danger" onClick={anular} disabled={enviando}>
                      Anular
                    </button>
                  )}
                  <button
                    className="btn btn-primary"
                    onClick={() => setEditando(true)}
                    disabled={datos.estado === 'anulado'}
                  >
                    {datos.editable ? 'Editar' : 'Cambiar vencimiento'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {datos.editable ? (
                <>
                  <h4 className="subtitulo">Conceptos</h4>
                  {renglones.map((r, i) => (
                    <div key={i} className="renglon-edit">
                      <select
                        className="form-control"
                        value={r.kind}
                        onChange={(e) => {
                          const n = [...renglones]
                          n[i] = { ...n[i], kind: e.target.value }
                          setRenglones(n)
                        }}
                      >
                        {TIPOS_CARGO.map((t) => (
                          <option key={t.valor} value={t.valor}>
                            {t.etiqueta}
                          </option>
                        ))}
                      </select>
                      <input
                        className="form-control"
                        value={r.description}
                        onChange={(e) => {
                          const n = [...renglones]
                          n[i] = { ...n[i], description: e.target.value }
                          setRenglones(n)
                        }}
                        placeholder="Concepto"
                      />
                      <input
                        type="number"
                        step="0.01"
                        className="form-control"
                        value={r.unit_price}
                        onChange={(e) => {
                          const n = [...renglones]
                          n[i] = { ...n[i], unit_price: e.target.value }
                          setRenglones(n)
                        }}
                      />
                      <button
                        type="button"
                        className="btn-mini btn-danger"
                        onClick={() => setRenglones(renglones.filter((_, j) => j !== i))}
                        disabled={renglones.length === 1}
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="btn-enlace-mini"
                    onClick={() =>
                      setRenglones([
                        ...renglones,
                        { kind: 'otro', description: '', unit_price: '' },
                      ])
                    }
                  >
                    + Añadir concepto
                  </button>

                  <div className="total-seleccion" style={{ marginTop: 14 }}>
                    <span>Nuevo subtotal</span>
                    <strong>
                      {fmtUSD(
                        renglones.reduce((s, r) => s + (Number(r.unit_price) || 0), 0)
                      )}
                    </strong>
                  </div>
                </>
              ) : (
                <Aviso tipo="aviso">{datos.motivo_bloqueo}</Aviso>
              )}

              <div className="form-group" style={{ marginTop: 16 }}>
                <label>Vencimiento</label>
                <CampoFecha value={vencimiento} onChange={setVencimiento} />
              </div>

              <div className="form-group">
                <label>Motivo de la corrección *</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Error en el monto de la cuota"
                />
                <small className="texto-ayuda">
                  Queda registrado en la auditoría junto con los valores anteriores.
                </small>
              </div>

              <div className="panel-acciones">
                <button
                  className="btn btn-secundario"
                  onClick={() => {
                    setEditando(false)
                    cargar()
                  }}
                >
                  Cancelar
                </button>
                <button className="btn btn-primary" onClick={guardar} disabled={enviando}>
                  {enviando ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </>
          )}
        </>
      )}

      <ConfirmarMotivo
        datos={confirmacion}
        enviando={enviando}
        onCancelar={() => setConfirmacion(null)}
      />
    </Panel>
  )
}

/** Detalle de un pago, con su comprobante y los avisos que cubrió. */
export function DetallePago({ paymentId, abierto, onCerrar, puedeGestionar = false, esAdmin = false, onCambio }) {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [urlRecibo, setUrlRecibo] = useState(null)
  const [editando, setEditando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [confirmacion, setConfirmacion] = useState(null)
  const [form, setForm] = useState({})

  const cargarDetalle = useCallback(() => {
    if (!paymentId) return
    setCargando(true)
    supabase
      .rpc('payment_detail', { p_payment_id: paymentId })
      .then(async ({ data, error: err }) => {
        if (err) {
          setError(mensajeError(err))
          return
        }
        setDatos(data)
        setForm({
          amount: data.monto ?? '',
          currency: data.moneda ?? 'USD',
          payment_date: data.fecha ?? '',
          reference: data.referencia ?? '',
          notes: data.notas ?? '',
          rate: data.tasa ?? '',
        })
        if (data.comprobante) {
          setUrlRecibo(await urlComprobante(data.comprobante))
        }
      })
      .finally(() => setCargando(false))
  }, [paymentId])

  useEffect(() => {
    if (!abierto || !paymentId) return
    setEditando(false)
    cargarDetalle()
  }, [abierto, paymentId, cargarDetalle])

  // Guardar la edición de un pago reportado
  const guardarEdicion = async (e) => {
    e.preventDefault()
    setError(null)
    if (!(Number(form.amount) > 0)) {
      setError('El monto debe ser mayor que cero.')
      return
    }
    setEnviando(true)
    try {
      const { error: err } = await supabase.rpc('update_payment', {
        p_payment_id: paymentId,
        p_amount: Number(form.amount),
        p_currency: form.currency,
        p_payment_date: form.payment_date,
        p_reference: form.reference || null,
        p_notes: form.notes || null,
        p_rate: esAdmin && form.rate ? Number(form.rate) : null,
      })
      if (err) throw err
      setEditando(false)
      cargarDetalle()
      onCambio?.()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  // Anular un pago confirmado (con motivo)
  const anular = () => {
    setConfirmacion({
      titulo: 'Anular pago confirmado',
      mensaje:
        'Se revertirá el abono en el estado de cuenta, el ingreso en tesorería y la aplicación a los avisos. El pago quedará como anulado. Indique el motivo.',
      requiereMotivo: true,
      accion: async (motivo) => {
        setError(null)
        try {
          const { error: err } = await supabase.rpc('void_payment', {
            p_payment_id: paymentId,
            p_reason: motivo,
          })
          if (err) throw err
          setConfirmacion(null)
          cargarDetalle()
          onCambio?.()
        } catch (err) {
          setError(mensajeError(err))
          setConfirmacion(null)
        }
      },
    })
  }

  return (
    <Panel abierto={abierto} titulo="Detalle del pago" onCerrar={onCerrar} ancho={560}>
      {cargando ? (
        <Cargador />
      ) : error ? (
        <Aviso tipo="error">{error}</Aviso>
      ) : datos ? (
        <>
          <div className="detalle-cabecera">
            <div>
              <span className={`badge badge-${datos.estado}`}>{etiqueta(datos.estado)}</span>
              <h3>{datos.unidad?.codigo}</h3>
              <small>{fmtFecha(datos.fecha)}</small>
            </div>
            <div className="detalle-monto">
              <small>Monto</small>
              <strong>{fmtUSD(datos.monto_usd)}</strong>
              {datos.moneda === 'VES' && <em>{fmtMoneda(datos.monto, 'VES')}</em>}
            </div>
          </div>

          <div className="detalle-datos">
            <div>
              <small>Referencia</small>
              <strong>{datos.referencia || '—'}</strong>
            </div>
            <div>
              <small>Cuenta</small>
              <strong>{datos.cuenta?.nombre || '—'}</strong>
            </div>
            {datos.moneda === 'VES' && (
              <div>
                <small>Tasa aplicada</small>
                <strong>
                  Bs. {fmtNumero(datos.tasa)}
                  {datos.tasa_ajustada && ' *'}
                </strong>
              </div>
            )}
            <div>
              <small>Reportado por</small>
              <strong>{datos.reportado_por || '—'}</strong>
            </div>
          </div>

          {datos.tasa_ajustada && (
            <Aviso tipo="aviso">
              La tasa se ajustó manualmente para cuadrar el depósito.
              {datos.nota_tasa && ` ${datos.nota_tasa}`}
            </Aviso>
          )}

          {datos.motivo_rechazo && (
            <Aviso tipo="error">Rechazado: {datos.motivo_rechazo}</Aviso>
          )}

          {datos.notas && <p className="texto-ayuda">Nota: {datos.notas}</p>}

          {(datos.aplicaciones || []).length > 0 && (
            <>
              <h4 className="subtitulo">Avisos cubiertos</h4>
              <ul className="list-group">
                {datos.aplicaciones.map((a) => (
                  <li key={a.aviso_id} className="list-item">
                    <div>
                      <strong>{a.periodo}</strong>
                      <small>
                        Aviso N° {a.numero} · {etiqueta(a.estado)}
                      </small>
                    </div>
                    <strong>{fmtUSD(a.monto)}</strong>
                  </li>
                ))}
              </ul>
            </>
          )}

          {urlRecibo && (
            <div className="form-group" style={{ marginTop: 16 }}>
              <label>Comprobante</label>
              {urlRecibo.includes('.pdf') ? (
                <a
                  href={urlRecibo}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secundario btn-accion"
                >
                  Abrir PDF
                </a>
              ) : (
                <a href={urlRecibo} target="_blank" rel="noreferrer">
                  <img src={urlRecibo} alt="Comprobante" className="comprobante-img" />
                </a>
              )}
            </div>
          )}

          {datos.confirmado_en && (
            <small className="texto-ayuda">
              Confirmado por {datos.confirmado_por || '—'} el{' '}
              {fmtHoraLocal(datos.confirmado_en)}
            </small>
          )}

          {/* Acciones de gestión: editar mientras está reportado; anular si
              ya fue confirmado (solo admin). */}
          {puedeGestionar && !editando && (
            <div className="panel-acciones">
              {datos.estado === 'reportado' && (
                <button
                  type="button"
                  className="btn btn-secundario"
                  onClick={() => setEditando(true)}
                >
                  Editar
                </button>
              )}
              {datos.estado === 'confirmado' && esAdmin && (
                <button type="button" className="btn btn-danger" onClick={anular}>
                  Anular pago
                </button>
              )}
            </div>
          )}

          {/* Formulario de edición (solo para pagos reportados) */}
          {puedeGestionar && editando && (
            <form onSubmit={guardarEdicion} className="editor-pago">
              <h4 className="subtitulo">Corregir el pago</h4>
              <div className="grid-form">
                <div className="form-group">
                  <label>Monto *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Moneda *</label>
                  <select
                    className="form-control"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  >
                    <option value="USD">Dólares (USD)</option>
                    <option value="VES">Bolívares (Bs.)</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Fecha del pago *</label>
                <CampoFecha
                  value={form.payment_date}
                  onChange={(v) => setForm({ ...form, payment_date: v })}
                />
              </div>
              {esAdmin && form.currency === 'VES' && (
                <div className="form-group">
                  <label>Tasa (Bs. por USD)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="form-control"
                    value={form.rate}
                    onChange={(e) => setForm({ ...form, rate: e.target.value })}
                    placeholder="Vacío = tasa según la fecha"
                  />
                  <small className="texto-ayuda">
                    Déjela vacía para usar la tasa oficial de la fecha del pago.
                  </small>
                </div>
              )}
              <div className="form-group">
                <label>Referencia</label>
                <input
                  className="form-control"
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Nota</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <div className="panel-acciones">
                <button
                  type="button"
                  className="btn btn-secundario"
                  onClick={() => {
                    setEditando(false)
                    cargarDetalle()
                  }}
                >
                  Cancelar
                </button>
                <button className="btn btn-primary" disabled={enviando}>
                  {enviando ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          )}
        </>
      ) : null}

      <ConfirmarMotivo
        datos={confirmacion}
        enviando={false}
        onCancelar={() => setConfirmacion(null)}
      />
    </Panel>
  )
}

/** Detalle de un gasto, editable en sus datos descriptivos. */
export function DetalleGasto({ expenseId, abierto, onCerrar, onCambio, categorias = [], personal = [] }) {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [editando, setEditando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [urlRecibo, setUrlRecibo] = useState(null)
  const [confirmacion, setConfirmacion] = useState(null)
  const [form, setForm] = useState({})

  const cargar = useCallback(async () => {
    if (!expenseId) return
    setCargando(true)
    try {
      const { data, error: err } = await supabase.rpc('expense_detail', {
        p_expense_id: expenseId,
      })
      if (err) throw err
      setDatos(data)
      setForm({
        description: data.concepto || '',
        category_id: data.categoria?.id || '',
        supplier: data.proveedor || '',
        invoice_ref: data.factura || '',
        payee_id: data.beneficiario?.id || '',
      })
      if (data.comprobante) setUrlRecibo(await urlComprobante(data.comprobante))
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setCargando(false)
    }
  }, [expenseId])

  useEffect(() => {
    if (abierto) {
      cargar()
      setEditando(false)
    }
  }, [abierto, cargar])

  const guardar = async () => {
    setEnviando(true)
    setError(null)
    try {
      const { error: err } = await supabase.rpc('update_expense', {
        p_expense_id: expenseId,
        p_description: form.description.trim() || null,
        p_category_id: form.category_id || null,
        p_supplier: form.supplier.trim() || null,
        p_invoice_ref: form.invoice_ref.trim() || null,
        p_payee_id: form.payee_id || null,
        p_receipt_url: null,
      })
      if (err) throw err
      setEditando(false)
      cargar()
      onCambio?.()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  const anular = () => {
    setConfirmacion({
      titulo: 'Anular gasto',
      mensaje: `Se devolverá ${fmtUSD(datos.monto_usd)} a ${datos.cuenta?.nombre}. Ambos movimientos quedan visibles en el historial.`,
      accion: async (razon) => {
        setEnviando(true)
        const { error: err } = await supabase.rpc('void_expense', {
          p_expense_id: expenseId,
          p_reason: razon,
        })
        setEnviando(false)
        setConfirmacion(null)
        if (err) setError(mensajeError(err))
        else {
          cargar()
          onCambio?.()
        }
      },
    })
  }

  return (
    <Panel abierto={abierto} titulo="Detalle del gasto" onCerrar={onCerrar} ancho={560}>
      {cargando ? (
        <Cargador />
      ) : !datos ? (
        error && <Aviso tipo="error">{error}</Aviso>
      ) : (
        <>
          {error && <Aviso tipo="error" onCerrar={() => setError(null)}>{error}</Aviso>}

          <div className="detalle-cabecera">
            <div>
              <h3>{datos.concepto}</h3>
              <small>{fmtFecha(datos.fecha)}</small>
            </div>
            <div className="detalle-monto">
              <small>Monto</small>
              <strong>{fmtUSD(datos.monto_usd)}</strong>
              {datos.moneda === 'VES' && <em>{fmtMoneda(datos.monto, 'VES')}</em>}
            </div>
          </div>

          {!editando ? (
            <>
              <div className="detalle-datos">
                <div>
                  <small>Cuenta</small>
                  <strong>{datos.cuenta?.nombre || '—'}</strong>
                </div>
                <div>
                  <small>Categoría</small>
                  <strong>{datos.categoria?.nombre || 'Sin categoría'}</strong>
                </div>
                <div>
                  <small>Beneficiario</small>
                  <strong>{datos.beneficiario?.nombre || datos.proveedor || '—'}</strong>
                </div>
                <div>
                  <small>N° de factura</small>
                  <strong>{datos.factura || '—'}</strong>
                </div>
              </div>

              {urlRecibo && (
                <div className="form-group">
                  <label>Factura o recibo</label>
                  {urlRecibo.includes('.pdf') ? (
                    <a
                      href={urlRecibo}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secundario btn-accion"
                    >
                      Abrir PDF
                    </a>
                  ) : (
                    <a href={urlRecibo} target="_blank" rel="noreferrer">
                      <img src={urlRecibo} alt="" className="comprobante-img" />
                    </a>
                  )}
                </div>
              )}

              <small className="texto-ayuda">
                Registrado por {datos.registrado_por || '—'} el {fmtHoraLocal(datos.creado_en)}
              </small>

              {datos.editable && (
                <div className="panel-acciones">
                  <button className="btn btn-danger" onClick={anular} disabled={enviando}>
                    Anular
                  </button>
                  <button className="btn btn-primary" onClick={() => setEditando(true)}>
                    Editar
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <Aviso tipo="aviso">
                El monto no se puede modificar aquí: alteraría el saldo de la cuenta sin dejar
                rastro. Para corregirlo, anule el gasto y regístrelo de nuevo.
              </Aviso>

              <div className="form-group">
                <label>Concepto</label>
                <input
                  className="form-control"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="grid-form">
                <div className="form-group">
                  <label>Categoría</label>
                  <select
                    className="form-control"
                    value={form.category_id}
                    onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  >
                    <option value="">Sin categoría</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Beneficiario</label>
                  <select
                    className="form-control"
                    value={form.payee_id}
                    onChange={(e) => setForm({ ...form, payee_id: e.target.value })}
                  >
                    <option value="">Sin beneficiario</option>
                    {personal.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Proveedor</label>
                  <input
                    className="form-control"
                    value={form.supplier}
                    onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>N° de factura</label>
                  <input
                    className="form-control"
                    value={form.invoice_ref}
                    onChange={(e) => setForm({ ...form, invoice_ref: e.target.value })}
                  />
                </div>
              </div>

              <div className="panel-acciones">
                <button className="btn btn-secundario" onClick={() => setEditando(false)}>
                  Cancelar
                </button>
                <button className="btn btn-primary" onClick={guardar} disabled={enviando}>
                  {enviando ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </>
          )}
        </>
      )}

      <ConfirmarMotivo
        datos={confirmacion}
        enviando={enviando}
        onCancelar={() => setConfirmacion(null)}
      />
    </Panel>
  )
}

/** Confirmación que exige escribir un motivo. */
function ConfirmarMotivo({ datos, enviando, onCancelar }) {
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    if (datos) setMotivo('')
  }, [datos])

  if (!datos) return null

  return (
    <div className="panel-fondo" onClick={onCancelar} style={{ zIndex: 2600 }}>
      <div className="dialogo" onClick={(e) => e.stopPropagation()} role="alertdialog">
        <h3>{datos.titulo}</h3>
        <p>{datos.mensaje}</p>
        <div className="form-group">
          <label>Motivo *</label>
          <textarea
            className="form-control"
            rows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            autoFocus
          />
        </div>
        <div className="dialogo-botones">
          <button className="btn btn-secundario" onClick={onCancelar}>
            Cancelar
          </button>
          <button
            className="btn btn-danger"
            onClick={() => datos.accion(motivo.trim())}
            disabled={enviando || !motivo.trim()}
          >
            {enviando ? 'Procesando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
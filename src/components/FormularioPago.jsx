import { useState, useEffect, useCallback } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { fmtUSD, fmtVES, fmtNumero, fmtFecha, hoy } from '../lib/formato'
import { Aviso, Cargador } from './UI'

/**
 * Registro de un pago con toda la información que el administrador
 * necesita para decidir: deuda actual, meses pendientes, conversión
 * a bolívares con la tasa del día del pago, y ajuste manual de tasa
 * para cuadrar depósitos con céntimos sobrantes.
 */
export default function FormularioPago({
  unidades,
  cuentas,
  unidadInicial,
  onCompletado,
  onCancelar,
}) {
  const [paso, setPaso] = useState(1)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  const [unidadId, setUnidadId] = useState(unidadInicial || '')
  const [pendientes, setPendientes] = useState([])
  const [seleccionados, setSeleccionados] = useState([])
  const [saldo, setSaldo] = useState(0)
  const [cargandoDeuda, setCargandoDeuda] = useState(false)

  const [moneda, setMoneda] = useState('USD')
  const [fecha, setFecha] = useState(hoy())
  const [tasaInfo, setTasaInfo] = useState(null)
  const [tasaManual, setTasaManual] = useState('')
  const [usarTasaManual, setUsarTasaManual] = useState(false)

  const [monto, setMonto] = useState('')
  const [referencia, setReferencia] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [nota, setNota] = useState('')
  const [comprobante, setComprobante] = useState(null)
  const [vistaComprobante, setVistaComprobante] = useState(null)

  // ------------------------------------------------------- carga de deuda

  const cargarDeuda = useCallback(async (id) => {
    if (!id) return
    setCargandoDeuda(true)
    try {
      const [rInv, rSaldo] = await Promise.all([
        supabase.rpc('unit_pending_invoices', { p_unit_id: id }),
        supabase.rpc('unit_balance', { p_unit_id: id }),
      ])
      if (rInv.error) throw rInv.error

      setPendientes(rInv.data || [])
      setSaldo(Number(rSaldo.data) || 0)
      // Por defecto se marcan todos: lo habitual es pagar la deuda completa
      setSeleccionados((rInv.data || []).map((i) => i.id))
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setCargandoDeuda(false)
    }
  }, [])

  useEffect(() => {
    if (unidadId) cargarDeuda(unidadId)
  }, [unidadId, cargarDeuda])

  // ------------------------------------------------- tasa según la fecha

  useEffect(() => {
    if (!fecha) return
    supabase.rpc('rate_detail', { p_date: fecha }).then(({ data }) => {
      setTasaInfo(data)
      if (data?.tasa && !usarTasaManual) setTasaManual(String(data.tasa))
    })
  }, [fecha, usarTasaManual])

  const tasaEfectiva = usarTasaManual && tasaManual ? Number(tasaManual) : tasaInfo?.tasa

  const totalSeleccionado = pendientes
    .filter((p) => seleccionados.includes(p.id))
    .reduce((s, p) => s + Number(p.pendiente || 0), 0)

  const montoUSD =
    moneda === 'USD'
      ? Number(monto) || 0
      : tasaEfectiva
      ? (Number(monto) || 0) / tasaEfectiva
      : 0

  const diferencia = montoUSD - totalSeleccionado

  const alternarAviso = (id) => {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  /** Rellena el monto con el equivalente exacto de lo seleccionado. */
  const usarMontoSugerido = () => {
    if (moneda === 'USD') {
      setMonto(totalSeleccionado.toFixed(2))
    } else if (tasaEfectiva) {
      setMonto((totalSeleccionado * tasaEfectiva).toFixed(2))
    }
  }

  /**
   * Calcula qué tasa haría que el depósito cuadre exactamente.
   * Resuelve el caso de que el vecino deposite una cifra redonda y
   * queden céntimos de residuo en el estado de cuenta.
   */
  const ajustarTasaParaCuadrar = () => {
    const bs = Number(monto)
    if (!bs || !totalSeleccionado) return
    const tasaExacta = bs / totalSeleccionado
    setTasaManual(tasaExacta.toFixed(6))
    setUsarTasaManual(true)
  }

  const elegirComprobante = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      return setError('El comprobante debe ser una imagen o un PDF.')
    }
    if (file.size > 10 * 1024 * 1024) {
      return setError('El archivo supera los 10 MB.')
    }

    setError(null)
    setComprobante(file)
    setVistaComprobante(file.type.startsWith('image/') ? URL.createObjectURL(file) : null)
  }

  const enviar = async () => {
    setError(null)

    if (!unidadId) return setError('Seleccione la unidad.')
    const m = Number(monto)
    if (!m || m <= 0) return setError('Indique el monto pagado.')
    if (!cuentaId) return setError('Seleccione la cuenta donde ingresó el dinero.')
    if (moneda === 'VES' && !tasaEfectiva) {
      return setError('No hay tasa disponible para esa fecha. Regístrela en Ajustes.')
    }

    setEnviando(true)
    try {
      let rutaComprobante = null
      if (comprobante) {
        const { subirComprobante } = await import('../lib/imagenes')
        const res = await subirComprobante(comprobante, unidadId)
        rutaComprobante = res.ruta
      }

      const { data: idPago, error: e1 } = await supabase.rpc('report_payment', {
        p_unit_id: unidadId,
        p_amount: m,
        p_currency: moneda,
        p_payment_date: fecha,
        p_reference: referencia.trim() || null,
        p_receipt_url: rutaComprobante,
        p_notes: nota.trim() || null,
        p_rate: usarTasaManual && tasaManual ? Number(tasaManual) : null,
        p_rate_note: usarTasaManual ? 'Tasa ajustada para cuadrar el depósito' : null,
      })
      if (e1) throw e1

      const { data: res, error: e2 } = await supabase.rpc('confirm_payment_targeted', {
        p_payment_id: idPago,
        p_account_id: cuentaId,
        p_invoice_ids: seleccionados.length ? seleccionados : null,
      })
      if (e2) throw e2

      onCompletado(
        `Pago de ${fmtUSD(montoUSD)} registrado y aplicado a ${res.aplicado_a} aviso(s).` +
          (Number(res.saldo_a_favor) > 0
            ? ` Quedan ${fmtUSD(res.saldo_a_favor)} como saldo a favor.`
            : '')
      )
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  // ------------------------------------------------------------------ vista

  return (
    <div className="form-pago">
      <div className="pasos">
        <span className={paso >= 1 ? 'activo' : ''}>1 · Deuda</span>
        <span className={paso >= 2 ? 'activo' : ''}>2 · Pago</span>
      </div>

      {error && <Aviso tipo="error" onCerrar={() => setError(null)}>{error}</Aviso>}

      {/* ------------------------------------------------ paso 1: la deuda */}
      {paso === 1 && (
        <>
          <div className="form-group">
            <label>Unidad *</label>
            <select
              className="form-control"
              value={unidadId}
              onChange={(e) => setUnidadId(e.target.value)}
            >
              <option value="">Seleccione…</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code}
                </option>
              ))}
            </select>
          </div>

          {cargandoDeuda ? (
            <Cargador texto="Consultando deuda…" />
          ) : unidadId ? (
            <>
              <div className="resumen-deuda">
                <div>
                  <small>Deuda total</small>
                  <strong className={saldo > 0 ? 'texto-danger' : ''}>
                    {saldo > 0 ? fmtUSD(saldo) : saldo < 0 ? `A favor ${fmtUSD(-saldo)}` : 'Solvente'}
                  </strong>
                </div>
                <div>
                  <small>Meses pendientes</small>
                  <strong>{pendientes.length}</strong>
                </div>
                {tasaInfo?.tasa && saldo > 0 && (
                  <div>
                    <small>Equivalente en bolívares</small>
                    <strong>{fmtVES(saldo * tasaInfo.tasa)}</strong>
                  </div>
                )}
              </div>

              {pendientes.length === 0 ? (
                <Aviso tipo="exito">
                  Esta unidad no tiene avisos pendientes. Un pago quedará como saldo a favor.
                </Aviso>
              ) : (
                <>
                  <h4 className="subtitulo">Qué meses se van a pagar</h4>
                  <div className="lista-avisos">
                    {pendientes.map((p) => (
                      <label
                        key={p.id}
                        className={`aviso-fila ${seleccionados.includes(p.id) ? 'marcado' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={seleccionados.includes(p.id)}
                          onChange={() => alternarAviso(p.id)}
                        />
                        <div className="aviso-datos">
                          <strong>{p.periodo}</strong>
                          <small>
                            Aviso N° {p.invoice_number} · Vence {fmtFecha(p.due_date)}
                            {p.dias_mora > 0 && (
                              <span className="texto-danger"> · {p.dias_mora} días de mora</span>
                            )}
                          </small>
                        </div>
                        <div className="aviso-monto">
                          <strong>{fmtUSD(p.pendiente)}</strong>
                          {Number(p.pagado) > 0 && (
                            <small>Abonado {fmtUSD(p.pagado)}</small>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="total-seleccion">
                    <span>{seleccionados.length} mes(es) seleccionado(s)</span>
                    <strong>{fmtUSD(totalSeleccionado)}</strong>
                  </div>
                </>
              )}
            </>
          ) : null}

          <div className="panel-acciones">
            <button type="button" className="btn btn-secundario" onClick={onCancelar}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!unidadId}
              onClick={() => setPaso(2)}
            >
              Continuar
            </button>
          </div>
        </>
      )}

      {/* -------------------------------------------------- paso 2: el pago */}
      {paso === 2 && (
        <>
          <div className="grid-form">
            <div className="form-group">
              <label>Moneda del pago *</label>
              <select
                className="form-control"
                value={moneda}
                onChange={(e) => setMoneda(e.target.value)}
              >
                <option value="USD">Dólares (USD)</option>
                <option value="VES">Bolívares (Bs.)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Fecha del pago *</label>
              <input
                type="date"
                className="form-control"
                max={hoy()}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
          </div>

          {moneda === 'VES' && (
            <div className="bloque-tasa">
              {!tasaInfo?.tasa ? (
                <Aviso tipo="error">
                  No hay tasa registrada para el {fmtFecha(fecha)} ni fechas anteriores.
                  Regístrela en Ajustes antes de continuar.
                </Aviso>
              ) : (
                <>
                  <div className="tasa-info">
                    <div>
                      <small>Tasa aplicada</small>
                      <strong>Bs. {fmtNumero(tasaEfectiva, 4)}</strong>
                    </div>
                    <div>
                      <small>Origen</small>
                      <strong>
                        {usarTasaManual
                          ? 'Ajustada manualmente'
                          : tasaInfo.exacta
                          ? `Tasa del ${fmtFecha(tasaInfo.fecha)}`
                          : `Tasa del ${fmtFecha(tasaInfo.fecha)}`}
                      </strong>
                    </div>
                  </div>

                  {!tasaInfo.exacta && !usarTasaManual && (
                    <Aviso tipo="aviso">
                      No hay tasa registrada para el {fmtFecha(fecha)}. Se está usando la del{' '}
                      {fmtFecha(tasaInfo.fecha)}, que puede no coincidir con la del depósito.
                    </Aviso>
                  )}

                  <label className="checkbox-linea">
                    <input
                      type="checkbox"
                      checked={usarTasaManual}
                      onChange={(e) => setUsarTasaManual(e.target.checked)}
                    />
                    Ajustar la tasa manualmente
                  </label>

                  {usarTasaManual && (
                    <div className="form-group">
                      <label>Tasa a aplicar</label>
                      <input
                        type="number"
                        step="0.000001"
                        className="form-control"
                        value={tasaManual}
                        onChange={(e) => setTasaManual(e.target.value)}
                      />
                      <small className="texto-ayuda">
                        Útil cuando el depósito no coincide al céntimo con el cálculo exacto y
                        quedarían residuos en el estado de cuenta.
                      </small>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="form-group">
            <label>Monto pagado ({moneda === 'USD' ? 'USD' : 'Bs.'}) *</label>
            <div className="input-con-boton">
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
              />
              {totalSeleccionado > 0 && (
                <button
                  type="button"
                  className="btn-sufijo"
                  onClick={usarMontoSugerido}
                  title="Usar el monto exacto de lo seleccionado"
                >
                  Exacto
                </button>
              )}
            </div>
          </div>

          {monto && totalSeleccionado > 0 && (
            <div className={`comparativa ${Math.abs(diferencia) < 0.01 ? 'cuadra' : ''}`}>
              <div>
                <small>Se está pagando</small>
                <strong>{fmtUSD(montoUSD)}</strong>
                {moneda === 'VES' && <em>{fmtVES(Number(monto))}</em>}
              </div>
              <div>
                <small>Seleccionado</small>
                <strong>{fmtUSD(totalSeleccionado)}</strong>
              </div>
              <div>
                <small>{diferencia >= 0 ? 'Sobra' : 'Falta'}</small>
                <strong className={Math.abs(diferencia) < 0.01 ? 'texto-exito' : 'texto-aviso'}>
                  {Math.abs(diferencia) < 0.01 ? 'Cuadra' : fmtUSD(Math.abs(diferencia))}
                </strong>
              </div>
            </div>
          )}

          {moneda === 'VES' &&
            monto &&
            totalSeleccionado > 0 &&
            Math.abs(diferencia) >= 0.01 &&
            Math.abs(diferencia) < 1 && (
              <div className="sugerencia-cuadre">
                <span>
                  Hay una diferencia de {fmtUSD(Math.abs(diferencia))} por redondeo del depósito.
                </span>
                <button type="button" className="btn-mini btn-primary" onClick={ajustarTasaParaCuadrar}>
                  Ajustar tasa para cuadrar
                </button>
              </div>
            )}

          <div className="grid-form">
            <div className="form-group">
              <label>Cuenta de destino *</label>
              <select
                className="form-control"
                value={cuentaId}
                onChange={(e) => setCuentaId(e.target.value)}
              >
                <option value="">Seleccione…</option>
                {cuentas
                  .filter((c) => c.currency === moneda || true)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.currency}
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-group">
              <label>Referencia</label>
              <input
                className="form-control"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="N° de transferencia"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Comprobante</label>
            <div className="zona-archivo">
              {vistaComprobante ? (
                <img src={vistaComprobante} alt="" className="comprobante-img" />
              ) : comprobante ? (
                <div className="archivo-pdf">
                  <span aria-hidden="true">📄</span>
                  <strong>{comprobante.name}</strong>
                </div>
              ) : (
                <div className="zona-archivo-vacia">
                  <span aria-hidden="true">📎</span>
                  <small>Captura o PDF del pago</small>
                </div>
              )}

              <div className="grupo-botones" style={{ marginTop: 10 }}>
                <label className="btn-mini btn-primary" style={{ cursor: 'pointer' }}>
                  {comprobante ? 'Cambiar' : 'Seleccionar'}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={elegirComprobante}
                    style={{ display: 'none' }}
                  />
                </label>
                {comprobante && (
                  <button
                    type="button"
                    className="btn-mini btn-secundario"
                    onClick={() => {
                      setComprobante(null)
                      setVistaComprobante(null)
                    }}
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>
            <small className="texto-ayuda">
              Las imágenes se comprimen a WebP automáticamente.
            </small>
          </div>

          <div className="form-group">
            <label>Nota</label>
            <textarea
              className="form-control"
              rows={2}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </div>

          <div className="panel-acciones">
            <button type="button" className="btn btn-secundario" onClick={() => setPaso(1)}>
              Atrás
            </button>
            <button type="button" className="btn btn-primary" onClick={enviar} disabled={enviando}>
              {enviando ? 'Registrando…' : 'Registrar y aplicar'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

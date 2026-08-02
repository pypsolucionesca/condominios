import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { subirComprobante, formatearTamano } from '../lib/imagenes'
import { fmtUSD, fmtMoneda, fmtNumero, fmtFecha, etiqueta, hoy } from '../lib/formato'
import { Aviso, Vacio, Cargador } from '../components/UI'
import CampoFecha from '../components/CampoFecha'

export default function ReportarPago() {
  const { unidades } = useAuth()
  const navigate = useNavigate()
  const inputArchivo = useRef(null)

  const [form, setForm] = useState({
    unit_id: '',
    amount: '',
    currency: 'USD',
    method: 'transferencia',
    payment_date: hoy(),
    reference: '',
    notes: '',
  })

  const [archivo, setArchivo] = useState(null)
  const [vistaPrevia, setVistaPrevia] = useState(null)
  const [tasa, setTasa] = useState(null)
  const [tasaSinDato, setTasaSinDato] = useState(false)
  const [saldo, setSaldo] = useState(null)
  const [pendientes, setPendientes] = useState([])
  const [recientes, setRecientes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [exito, setExito] = useState(null)

  useEffect(() => {
    if (unidades.length && !form.unit_id) {
      setForm((f) => ({ ...f, unit_id: unidades[0].id }))
    }
  }, [unidades, form.unit_id])

  // La tasa se trae SEGÚN LA FECHA del pago, no la de hoy. Así un pago
  // con fecha pasada se calcula con la tasa vigente de ese día. La función
  // rate_for_date devuelve la tasa más reciente anterior o igual a la
  // fecha (cubre fines de semana y feriados). Si no hay ninguna tasa
  // para esa fecha, se marca tasaSinDato: el residente reporta igual y
  // el administrador resuelve la tasa al verificar.
  useEffect(() => {
    if (!form.payment_date) {
      setCargando(false)
      return
    }
    let activo = true
    setCargando(true)

    supabase
      .rpc('rate_for_date', { p_date: form.payment_date })
      .then(({ data, error }) => {
        if (!activo) return
        // Si la consulta de tasa falla, NO se bloquea el formulario: se
        // trata como "sin tasa" y el residente reporta igual; la
        // administración fija la tasa correcta al verificar el pago.
        if (error || data == null) {
          setTasa(null)
          setTasaSinDato(true)
        } else {
          setTasa({ rate_date: form.payment_date, rate_bcv: Number(data) })
          setTasaSinDato(false)
        }
      })
      .catch(() => {
        if (!activo) return
        setTasa(null)
        setTasaSinDato(true)
      })
      .finally(() => activo && setCargando(false))

    return () => {
      activo = false
    }
  }, [form.payment_date])

  useEffect(() => {
    if (!form.unit_id) return

    supabase.rpc('unit_balance', { p_unit_id: form.unit_id }).then(({ data }) => {
      const s = Number(data) || 0
      setSaldo(s)
      // Sugerir como monto lo que debe (si debe). Editable: el residente
      // puede pagar de más o de menos. Solo se pre-rellena si el campo
      // está vacío, para no pisar lo que el usuario ya escribió.
      if (s > 0) {
        setForm((f) => (f.amount ? f : { ...f, amount: s.toFixed(2), currency: 'USD' }))
      }
    })

    supabase
      .from('payments')
      .select('id, payment_date, amount, currency, amount_usd, reference, status, rejection_reason')
      .eq('unit_id', form.unit_id)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => setRecientes(data || []))

    // Avisos pendientes de la unidad, del más antiguo al más nuevo. Con
    // esto se muestra al residente cómo se repartirá su pago: siempre
    // cubre primero la deuda más vieja (no se puede pagar un mes nuevo
    // dejando meses anteriores sin pagar).
    supabase
      .rpc('unit_pending_invoices', { p_unit_id: form.unit_id })
      .then(({ data }) => setPendientes(data || []))
  }, [form.unit_id, exito])

  const elegirArchivo = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)

    const esImagen = file.type.startsWith('image/')
    const esPdf = file.type === 'application/pdf'

    if (!esImagen && !esPdf) {
      return setError('El comprobante debe ser una imagen o un PDF.')
    }
    if (file.size > 10 * 1024 * 1024) {
      return setError('El archivo es demasiado grande. Máximo 10 MB.')
    }

    setArchivo(file)
    setVistaPrevia(esImagen ? URL.createObjectURL(file) : null)
  }

  const enviar = async (e) => {
    e.preventDefault()
    setError(null)

    if (!form.unit_id) return setError('Seleccione la unidad.')

    const monto = Number(form.amount)
    if (!monto || monto <= 0) return setError('Indique el monto pagado.')

    // Si paga en bolívares y no hay tasa para esa fecha, NO se bloquea:
    // se reporta igual y el administrador fija la tasa al verificar.
    // (Antes se bloqueaba; tu decisión fue que el usuario no se trabe.)

    // La transferencia y el pago móvil tienen número de operación: es
    // obligatorio para poder verificar el pago. El efectivo no lo tiene.
    const requiereOperacion = form.method === 'transferencia' || form.method === 'pago_movil'
    if (requiereOperacion && !form.reference.trim()) {
      return setError('Indique el número de operación de la transferencia o pago móvil.')
    }

    if (!form.reference.trim() && !archivo) {
      return setError('Indique la referencia del pago o adjunte el comprobante.')
    }

    setEnviando(true)
    try {
      let rutaComprobante = null

      if (archivo) {
        const res = await subirComprobante(archivo, form.unit_id)
        rutaComprobante = res.ruta
      }

      const metodoTexto = {
        transferencia: 'Transferencia',
        pago_movil: 'Pago móvil',
        efectivo: 'Efectivo',
      }[form.method]
      const notaConMetodo = [`Método: ${metodoTexto}`, form.notes.trim()]
        .filter(Boolean)
        .join('. ')

      const { error: err } = await supabase.rpc('report_payment', {
        p_unit_id: form.unit_id,
        p_amount: monto,
        p_currency: form.currency,
        p_payment_date: form.payment_date,
        p_reference: form.reference.trim() || null,
        p_receipt_url: rutaComprobante,
        p_notes: notaConMetodo || null,
      })
      if (err) throw err

      setExito(
        'Pago reportado. La administración lo verificará y quedará reflejado en su estado de cuenta.'
      )
      setForm({
        unit_id: form.unit_id,
        amount: '',
        currency: 'USD',
        method: 'transferencia',
        payment_date: hoy(),
        reference: '',
        notes: '',
      })
      setArchivo(null)
      setVistaPrevia(null)
      if (inputArchivo.current) inputArchivo.current.value = ''
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  if (cargando) return <Cargador />

  if (!unidades.length) {
    return (
      <div className="card">
        <Vacio
          icono="🏢"
          titulo="Sin unidad asignada"
          mensaje="Su usuario aún no está vinculado a ningún apartamento o local. Comuníquese con la administración."
        />
      </div>
    )
  }

  const equivalente =
    form.currency === 'VES' && tasa && form.amount
      ? Number(form.amount) / Number(tasa.rate_bcv)
      : null

  // Monto del pago expresado en USD, para comparar con la deuda.
  const montoPagoUSD =
    form.currency === 'USD'
      ? Number(form.amount) || 0
      : equivalente || 0

  // Diferencia respecto al saldo pendiente: positiva = paga de más,
  // negativa = paga de menos. Solo tiene sentido si hay saldo y monto.
  const diferencia =
    saldo !== null && montoPagoUSD > 0 ? montoPagoUSD - saldo : null

  // Distribución del pago: se recorre la deuda del mes más antiguo al más
  // nuevo y se va cubriendo con el monto disponible. Así el residente ve,
  // antes de reportar, exactamente qué avisos quedan cubiertos, cuál queda
  // a medias y cuánto sobra o falta. Es la misma regla que aplica el
  // administrador al confirmar (antiguo → nuevo).
  const distribucion = (() => {
    if (!(montoPagoUSD > 0) || pendientes.length === 0) return null
    let restante = montoPagoUSD
    const filas = pendientes.map((p) => {
      const deuda = Number(p.pendiente) || 0
      const aplicado = Math.min(restante, deuda)
      restante = Math.max(0, restante - aplicado)
      return {
        id: p.id,
        numero: p.invoice_number,
        periodo: p.periodo,
        deuda,
        aplicado,
        cubierto: aplicado >= deuda - 0.001,
        parcial: aplicado > 0.001 && aplicado < deuda - 0.001,
      }
    })
    const cubiertos = filas.filter((f) => f.cubierto).length
    const sobra = restante // excedente que quedará a favor
    return { filas, cubiertos, sobra }
  })()

  return (
    <>
      <div className="pagina-cabecera">
        <div>
          <h1>Reportar Pago</h1>
          <p className="texto-ayuda">
            Informe un pago realizado para que la administración lo verifique
          </p>
        </div>
      </div>

      {error && <Aviso tipo="error" onCerrar={() => setError(null)}>{error}</Aviso>}
      {exito && <Aviso tipo="exito" onCerrar={() => setExito(null)}>{exito}</Aviso>}

      {saldo !== null && saldo > 0 && (
        <div className="card">
          <div className="fila-resumen">
            <div>
              <small>Saldo pendiente</small>
              <strong className="texto-danger">{fmtUSD(saldo)}</strong>
            </div>
            {tasa && (
              <div>
                <small>Equivalente en bolívares</small>
                <strong>{fmtMoneda(saldo * Number(tasa.rate_bcv), 'VES')}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <form onSubmit={enviar}>
          {unidades.length > 1 && (
            <div className="form-group">
              <label>Unidad *</label>
              <select
                className="form-control"
                value={form.unit_id}
                onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
              >
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid-form">
            <div className="form-group">
              <label>Monto pagado *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
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

            <div className="form-group">
              <label>Fecha del pago *</label>
              <CampoFecha
                className="form-control"
                max={hoy()}
                value={form.payment_date}
                onChange={(v) => setForm({ ...form, payment_date: v })}
              />
            </div>

            <div className="form-group">
              <label>Método de pago *</label>
              <select
                className="form-control"
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value })}
              >
                <option value="transferencia">Transferencia</option>
                <option value="pago_movil">Pago móvil</option>
                <option value="efectivo">Efectivo</option>
              </select>
            </div>

            <div className="form-group">
              <label>
                {form.method === 'efectivo'
                  ? 'Referencia'
                  : 'Número de operación *'}
              </label>
              <input
                className="form-control"
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                placeholder={
                  form.method === 'efectivo'
                    ? 'Opcional'
                    : 'N° de la transferencia o pago móvil'
                }
              />
            </div>
          </div>

          {equivalente !== null && (
            <Aviso tipo="aviso">
              Equivale a {fmtUSD(equivalente)} según la tasa de Bs.{' '}
              {fmtNumero(tasa.rate_bcv)} vigente el {fmtFecha(form.payment_date)}.
            </Aviso>
          )}

          {distribucion && (
            <div className="form-group">
              <label>
                Avisos que cubre su pago{' '}
                <small className="texto-ayuda">(se aplican del mes más antiguo al más nuevo)</small>
              </label>
              <div className="lista-avisos">
                {distribucion.filas.map((f) => {
                  // La casilla está marcada si el pago cubre (total o parcialmente)
                  // este aviso. Es FIJA: refleja la regla antiguo→nuevo y no se
                  // puede desmarcar (el residente no elige saltar meses).
                  const marcado = f.cubierto || f.parcial
                  return (
                    <div
                      key={f.id}
                      className={`aviso-fila ${marcado ? 'marcado' : ''}`}
                      style={{ opacity: marcado ? 1 : 0.55 }}
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        readOnly
                        disabled
                        title="Los pagos se aplican automáticamente del mes más antiguo al más nuevo"
                      />
                      <div style={{ flex: 1 }}>
                        <strong>{f.periodo}</strong>
                        <div className="texto-ayuda">Aviso N° {f.numero}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {f.cubierto ? (
                          <span className="chip chip-exito">Se cubre · {fmtUSD(f.deuda)}</span>
                        ) : f.parcial ? (
                          <span className="chip chip-aviso">
                            Abona {fmtUSD(f.aplicado)} de {fmtUSD(f.deuda)}
                          </span>
                        ) : (
                          <span className="chip">Queda pendiente · {fmtUSD(f.deuda)}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="distribucion-resumen">
                {distribucion.cubiertos > 0 && (
                  <span>Cubre {distribucion.cubiertos} aviso(s) completo(s). </span>
                )}
                {distribucion.sobra >= 0.01 && (
                  <span className="texto-exito">
                    Sobran {fmtUSD(distribucion.sobra)} que quedarán a su favor.
                  </span>
                )}
              </div>
            </div>
          )}

          {form.currency === 'VES' && tasaSinDato && form.amount && (
            <Aviso tipo="aviso">
              No hay tasa registrada para la fecha del pago. Puede reportarlo igual:
              la administración fijará la tasa correcta al verificarlo.
            </Aviso>
          )}

          <div className="form-group">
            <label>Comprobante</label>
            <div className="zona-archivo">
              {vistaPrevia ? (
                <img src={vistaPrevia} alt="Comprobante" className="comprobante-img" />
              ) : archivo ? (
                <div className="archivo-pdf">
                  <span aria-hidden="true">📄</span>
                  <div>
                    <strong>{archivo.name}</strong>
                    <small>{formatearTamano(archivo.size)}</small>
                  </div>
                </div>
              ) : (
                <div className="zona-archivo-vacia">
                  <span aria-hidden="true">📎</span>
                  <small>Adjunte captura o PDF del pago</small>
                </div>
              )}

              <div className="grupo-botones" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn-mini btn-primary"
                  onClick={() => inputArchivo.current?.click()}
                >
                  {archivo ? 'Cambiar' : 'Seleccionar archivo'}
                </button>
                {archivo && (
                  <button
                    type="button"
                    className="btn-mini btn-secundario"
                    onClick={() => {
                      setArchivo(null)
                      setVistaPrevia(null)
                      if (inputArchivo.current) inputArchivo.current.value = ''
                    }}
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>
            <input
              ref={inputArchivo}
              type="file"
              accept="image/*,application/pdf"
              onChange={elegirArchivo}
              style={{ display: 'none' }}
            />
            <small className="texto-ayuda">
              Las imágenes se comprimen automáticamente antes de enviarse.
            </small>
          </div>

          <div className="form-group">
            <label>Nota para la administración</label>
            <textarea
              className="form-control"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Abono parcial, pago de dos meses…"
            />
          </div>

          <button className="btn btn-primary" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Reportar pago'}
          </button>
        </form>
      </div>

      {recientes.length > 0 && (
        <div className="card">
          <h2 className="card-header">Mis últimos reportes</h2>
          <ul className="list-group">
            {recientes.map((p) => (
              <li key={p.id} className="list-item">
                <div>
                  <strong>{fmtFecha(p.payment_date)}</strong>
                  <small>
                    {fmtMoneda(p.amount, p.currency)}
                    {p.currency === 'VES' && ` · ${fmtUSD(p.amount_usd)}`}
                    {p.reference ? ` · Ref. ${p.reference}` : ''}
                  </small>
                  {p.status === 'rechazado' && p.rejection_reason && (
                    <small className="texto-error">Motivo: {p.rejection_reason}</small>
                  )}
                </div>
                <span className={`badge badge-${p.status}`}>{etiqueta(p.status)}</span>
              </li>
            ))}
          </ul>
          <button
            className="btn btn-secundario btn-auto"
            style={{ marginTop: 16 }}
            onClick={() => navigate('/mi-cuenta')}
          >
            Ver estado de cuenta completo
          </button>
        </div>
      )}
    </>
  )
}

import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { subirComprobante, formatearTamano } from '../lib/imagenes'
import { fmtUSD, fmtMoneda, fmtNumero, fmtFecha, etiqueta, hoy } from '../lib/formato'
import { Aviso, Vacio, Cargador } from '../components/UI'

export default function ReportarPago() {
  const { unidades } = useAuth()
  const navigate = useNavigate()
  const inputArchivo = useRef(null)

  const [form, setForm] = useState({
    unit_id: '',
    amount: '',
    currency: 'USD',
    payment_date: hoy(),
    reference: '',
    notes: '',
  })

  const [archivo, setArchivo] = useState(null)
  const [vistaPrevia, setVistaPrevia] = useState(null)
  const [tasa, setTasa] = useState(null)
  const [saldo, setSaldo] = useState(null)
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

  useEffect(() => {
    supabase
      .from('exchange_rates')
      .select('rate_date, rate_bcv')
      .order('rate_date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setTasa(data))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => {
    if (!form.unit_id) return

    supabase
      .rpc('unit_balance', { p_unit_id: form.unit_id })
      .then(({ data }) => setSaldo(Number(data) || 0))

    supabase
      .from('payments')
      .select('id, payment_date, amount, currency, amount_usd, reference, status, rejection_reason')
      .eq('unit_id', form.unit_id)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => setRecientes(data || []))
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

    if (form.currency === 'VES' && !tasa) {
      return setError('No hay tasa de cambio registrada. Reporte el pago en dólares o avise a la administración.')
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

      const { error: err } = await supabase.rpc('report_payment', {
        p_unit_id: form.unit_id,
        p_amount: monto,
        p_currency: form.currency,
        p_payment_date: form.payment_date,
        p_reference: form.reference.trim() || null,
        p_receipt_url: rutaComprobante,
        p_notes: form.notes.trim() || null,
      })
      if (err) throw err

      setExito(
        'Pago reportado. La administración lo verificará y quedará reflejado en su estado de cuenta.'
      )
      setForm({
        unit_id: form.unit_id,
        amount: '',
        currency: 'USD',
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

  return (
    <>
      <div className="pagina-cabecera">
        <div>
          <h1>Reportar pago</h1>
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
              <input
                type="date"
                className="form-control"
                max={hoy()}
                value={form.payment_date}
                onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Referencia</label>
              <input
                className="form-control"
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                placeholder="N° de transferencia o pago móvil"
              />
            </div>
          </div>

          {equivalente !== null && (
            <Aviso tipo="aviso">
              Equivale a {fmtUSD(equivalente)} con la tasa de Bs.{' '}
              {fmtNumero(tasa.rate_bcv)} del {fmtFecha(tasa.rate_date)}. La administración aplicará
              la tasa vigente en la fecha del pago.
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

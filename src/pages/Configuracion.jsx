import { useEffect, useState } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmtUSD, fmtNumero, fmtFecha, hoy } from '../lib/formato'
import { Aviso, Cargador } from '../components/UI'

export default function Configuracion() {
  const { perfil, condominio, recargarPerfil } = useAuth()

  const [form, setForm] = useState(null)
  const [tasa, setTasa] = useState({ rate_date: hoy(), rate_bcv: '' })
  const [tasaActual, setTasaActual] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

  useEffect(() => {
    if (!condominio) return
    setForm({
      name: condominio.name || '',
      default_billing_mode: condominio.default_billing_mode || 'fija',
      default_fee: condominio.default_fee ?? '',
      due_day: condominio.due_day ?? 5,
      late_fee_mode: condominio.late_fee_mode || 'ninguno',
      late_fee_value: condominio.late_fee_value ?? '',
      late_fee_grace_days: condominio.late_fee_grace_days ?? 0,
      show_finances_to_all: Boolean(condominio.show_finances_to_all),
      delinquency_visibility: condominio.delinquency_visibility || 'oculto',
      invoice_notes: condominio.invoice_notes || '',
    })
  }, [condominio])

  useEffect(() => {
    supabase
      .from('exchange_rates')
      .select('rate_date, rate_bcv')
      .order('rate_date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setTasaActual(data))
  }, [])

  const guardar = async (e) => {
    e.preventDefault()
    setError(null)

    const dia = Number(form.due_day)
    if (!dia || dia < 1 || dia > 28) {
      return setError('El día de vencimiento debe estar entre 1 y 28.')
    }
    if (form.late_fee_mode !== 'ninguno' && Number(form.late_fee_value) <= 0) {
      return setError('Indique el valor del recargo por mora.')
    }

    setGuardando(true)
    try {
      const { error: err } = await supabase
        .from('condominiums')
        .update({
          name: form.name.trim(),
          default_billing_mode: form.default_billing_mode,
          default_fee: form.default_fee === '' ? 0 : Number(form.default_fee),
          due_day: dia,
          late_fee_mode: form.late_fee_mode,
          late_fee_value: form.late_fee_value === '' ? 0 : Number(form.late_fee_value),
          late_fee_grace_days: Number(form.late_fee_grace_days) || 0,
          show_finances_to_all: form.show_finances_to_all,
          delinquency_visibility: form.delinquency_visibility,
          invoice_notes: form.invoice_notes.trim() || null,
        })
        .eq('id', perfil.condominium_id)

      if (err) throw err

      setAviso('Configuración guardada.')
      recargarPerfil()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  const guardarTasa = async (e) => {
    e.preventDefault()
    setError(null)

    const valor = Number(tasa.rate_bcv)
    if (!valor || valor <= 0) return setError('Ingrese una tasa válida.')

    setGuardando(true)
    try {
      const { error: err } = await supabase
        .from('exchange_rates')
        .upsert(
          { rate_date: tasa.rate_date, rate_bcv: valor, source: 'manual' },
          { onConflict: 'rate_date' }
        )
      if (err) throw err

      setAviso(`Tasa registrada: Bs. ${fmtNumero(valor)} para el ${fmtFecha(tasa.rate_date)}.`)
      setTasaActual({ rate_date: tasa.rate_date, rate_bcv: valor })
      setTasa({ ...tasa, rate_bcv: '' })
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  if (!form) return <Cargador texto="Cargando configuración…" />

  return (
    <>
      <div className="pagina-cabecera">
        <div>
          <h1>Configuración</h1>
          <p className="texto-ayuda">Parámetros de cobro y transparencia del condominio</p>
        </div>
      </div>

      {error && <Aviso tipo="error" onCerrar={() => setError(null)}>{error}</Aviso>}
      {aviso && <Aviso tipo="exito" onCerrar={() => setAviso(null)}>{aviso}</Aviso>}

      {/* ------------------------------------------------------ tasa BCV */}
      <div className="card">
        <h2 className="card-header">Tasa de cambio</h2>
        <p className="texto-ayuda">
          Cada aviso, pago y gasto guarda la tasa del día en que se registró, de modo que los
          documentos históricos siempre pueden reconstruirse.
        </p>

        {tasaActual && (
          <div className="fila-resumen" style={{ marginBottom: 18 }}>
            <div>
              <small>Tasa vigente</small>
              <strong>Bs. {fmtNumero(tasaActual.rate_bcv)}</strong>
            </div>
            <div>
              <small>Registrada el</small>
              <strong>{fmtFecha(tasaActual.rate_date)}</strong>
            </div>
          </div>
        )}

        <form onSubmit={guardarTasa}>
          <div className="grid-form">
            <div className="form-group">
              <label>Fecha</label>
              <input
                type="date"
                className="form-control"
                value={tasa.rate_date}
                onChange={(e) => setTasa({ ...tasa, rate_date: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Tasa (Bs. por USD)</label>
              <input
                type="number"
                step="0.000001"
                min="0"
                className="form-control"
                value={tasa.rate_bcv}
                onChange={(e) => setTasa({ ...tasa, rate_bcv: e.target.value })}
                placeholder="737.230000"
              />
            </div>
          </div>
          <button className="btn btn-primary btn-auto" disabled={guardando}>
            Registrar tasa
          </button>
        </form>
      </div>

      <form onSubmit={guardar}>
        {/* -------------------------------------------------- facturación */}
        <div className="card">
          <h2 className="card-header">Cobro de cuotas</h2>

          <div className="form-group">
            <label>Nombre del condominio</label>
            <input
              className="form-control"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="grid-form">
            <div className="form-group">
              <label>Modo predeterminado</label>
              <select
                className="form-control"
                value={form.default_billing_mode}
                onChange={(e) => setForm({ ...form, default_billing_mode: e.target.value })}
              >
                <option value="fija">Cuota fija por unidad</option>
                <option value="alicuota">Repartir por alícuota</option>
                <option value="mixto">Cuota fija + derrama</option>
              </select>
            </div>

            <div className="form-group">
              <label>Cuota mensual (USD)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                value={form.default_fee}
                onChange={(e) => setForm({ ...form, default_fee: e.target.value })}
              />
              <small className="texto-ayuda">
                Aplica a todas las unidades, salvo las que tengan monto propio.
              </small>
            </div>

            <div className="form-group">
              <label>Día de vencimiento</label>
              <input
                type="number"
                min="1"
                max="28"
                className="form-control"
                value={form.due_day}
                onChange={(e) => setForm({ ...form, due_day: e.target.value })}
              />
              <small className="texto-ayuda">
                Entre 1 y 28, para que exista en todos los meses.
              </small>
            </div>
          </div>

          <div className="form-group">
            <label>Nota al pie de los avisos</label>
            <textarea
              className="form-control"
              rows={2}
              value={form.invoice_notes}
              onChange={(e) => setForm({ ...form, invoice_notes: e.target.value })}
              placeholder="Datos bancarios, instrucciones de pago…"
            />
          </div>
        </div>

        {/* --------------------------------------------------------- mora */}
        <div className="card">
          <h2 className="card-header">Recargo por mora</h2>
          <p className="texto-ayuda">
            Desactivado por defecto. Al activarlo, el recargo se aplica manualmente desde
            Cobranza, nunca de forma automática.
          </p>

          <div className="grid-form">
            <div className="form-group">
              <label>Tipo de recargo</label>
              <select
                className="form-control"
                value={form.late_fee_mode}
                onChange={(e) => setForm({ ...form, late_fee_mode: e.target.value })}
              >
                <option value="ninguno">Sin recargo</option>
                <option value="porcentaje">Porcentaje sobre el saldo</option>
                <option value="monto_fijo">Monto fijo por aviso</option>
              </select>
            </div>

            {form.late_fee_mode !== 'ninguno' && (
              <>
                <div className="form-group">
                  <label>
                    {form.late_fee_mode === 'porcentaje' ? 'Porcentaje mensual (%)' : 'Monto (USD)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control"
                    value={form.late_fee_value}
                    onChange={(e) => setForm({ ...form, late_fee_value: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Días de gracia</label>
                  <input
                    type="number"
                    min="0"
                    className="form-control"
                    value={form.late_fee_grace_days}
                    onChange={(e) => setForm({ ...form, late_fee_grace_days: e.target.value })}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* ------------------------------------------------- transparencia */}
        <div className="card">
          <h2 className="card-header">Transparencia</h2>

          <label className="opcion-bloque">
            <input
              type="checkbox"
              checked={form.show_finances_to_all}
              onChange={(e) => setForm({ ...form, show_finances_to_all: e.target.checked })}
            />
            <div>
              <strong>Cuentas abiertas a todos</strong>
              <small>
                Todos los residentes pueden ver los gastos del condominio, los saldos de banco y
                caja, y los pagos al personal. La escritura sigue siendo exclusiva del
                administrador.
              </small>
            </div>
          </label>

          <div className="form-group" style={{ marginTop: 22 }}>
            <label>Visibilidad de la morosidad</label>
            <select
              className="form-control"
              value={form.delinquency_visibility}
              onChange={(e) => setForm({ ...form, delinquency_visibility: e.target.value })}
            >
              <option value="oculto">Oculta · solo el administrador</option>
              <option value="agregado">Agregada · totales sin identificar unidades</option>
              <option value="detallado">Detallada · todos ven quién debe y cuánto</option>
            </select>
            <small className="texto-ayuda">
              La opción detallada expone datos individuales. Conviene que sea una decisión de
              asamblea, no del administrador por su cuenta.
            </small>
          </div>
        </div>

        <button className="btn btn-primary" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar configuración'}
        </button>
      </form>
    </>
  )
}

import { useState, useEffect } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { Panel } from './UI'
import { fmtUSD, hoy } from '../lib/formato'

export default function ModalAdelanto({ abierto, empleado, onCerrar, onCompletado }) {
  const [cuentas, setCuentas] = useState([])
  const [tasaFecha, setTasaFecha] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  const [cuentaId, setCuentaId] = useState('')
  const [montoIngresado, setMontoIngresado] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(hoy())

  const modo = empleado?.modo || 'otorgar'
  const esAbono = modo === 'abonar'

  useEffect(() => {
    if (!abierto) return
    const cargarCuentas = async () => {
      const { data } = await supabase.from('accounts').select('id, name, currency').eq('is_active', true)
      if (data) setCuentas(data)
    }
    cargarCuentas()
    setCuentaId('')
    setMontoIngresado('')
    setFecha(hoy())
    setDescripcion(esAbono ? 'Abono a préstamo' : 'Préstamo / Adelanto de nómina')
    setError(null)
  }, [abierto, esAbono])

  // La tasa se resuelve según la FECHA elegida (no la de hoy), para que un
  // préstamo con fecha pasada use la tasa correcta de ese día.
  useEffect(() => {
    if (!abierto || !fecha) return
    let cancelado = false
    supabase.rpc('rate_detail', { p_date: fecha }).then(({ data }) => {
      if (!cancelado) setTasaFecha(data || null)
    })
    return () => { cancelado = true }
  }, [abierto, fecha])

  const cuenta = cuentas.find(c => c.id === cuentaId)
  const isVES = cuenta?.currency === 'VES'

  let montoUSD = 0
  let montoVES = 0
  let tasa = tasaFecha?.tasa || 1

  if (montoIngresado && !isNaN(montoIngresado)) {
    if (isVES) {
      montoVES = Number(montoIngresado)
      montoUSD = Number((montoVES / tasa).toFixed(2))
    } else {
      montoUSD = Number(montoIngresado)
      montoVES = Number((montoUSD * tasa).toFixed(2))
    }
  }

  const procesar = async (e) => {
    e.preventDefault()
    if (!cuentaId) return setError('Seleccione la cuenta de origen/destino.')
    if (!fecha) return setError('Seleccione la fecha de la operación.')
    if (!montoUSD || montoUSD <= 0) return setError('Ingrese un monto válido.')
    if (isVES && !tasaFecha?.tasa) return setError('No hay tasa registrada para esa fecha. Elija otra fecha o cárguela en ajustes para operar con bolívares.')

    if (esAbono && montoUSD > Number(empleado.advance_balance)) {
        return setError(`El abono no puede superar la deuda actual de ${fmtUSD(empleado.advance_balance)}.`)
    }

    setCargando(true)
    setError(null)

    try {
      const rpcName = esAbono ? 'registrar_abono_adelanto' : 'otorgar_adelanto_nomina'

      const { error: err } = await supabase.rpc(rpcName, {
        p_payee_id: empleado.id,
        p_account_id: cuentaId,
        p_amount: isVES ? montoVES : montoUSD,
        p_amount_usd: montoUSD,
        p_currency: cuenta.currency,
        p_exchange_rate: isVES ? tasa : 1,
        p_description: descripcion.trim(),
        p_fecha: fecha
      })

      if (err) throw err

      onCompletado(esAbono ? `Abono registrado a ${empleado.full_name}` : `Préstamo otorgado a ${empleado.full_name}`)
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setCargando(false)
    }
  }

  if (!empleado) return null

  return (
    <Panel abierto={abierto} titulo={esAbono ? `Recibir abono de ${empleado.full_name}` : `Préstamo a ${empleado.full_name}`} onCerrar={onCerrar}>
      {error && <div className="alerta alerta-error">{error}</div>}

      <p className="texto-ayuda" style={{ marginBottom: 16 }}>
        {esAbono
          ? 'Registre el dinero (efectivo o transferencia) que el trabajador entregó para reducir su deuda. Esto sumará los fondos a la cuenta seleccionada.'
          : 'El monto se sumará a la deuda del trabajador y se registrará automáticamente como un egreso de la cuenta para no descuadrar el balance.'
        }
      </p>

      {esAbono && (
         <div className="alerta alerta-advertencia">
            Deuda actual pendiente: <strong>{fmtUSD(empleado.advance_balance)}</strong>
         </div>
      )}

      <form onSubmit={procesar}>
        <div className="form-group">
          <label>Fecha de la operación *</label>
          <input
            type="date"
            className="form-control"
            value={fecha}
            max={hoy()}
            onChange={(e) => setFecha(e.target.value)}
          />
          <small className="texto-ayuda">
            Puede registrar un préstamo o abono con fecha pasada; se usará la tasa oficial de ese día.
          </small>
        </div>

        <div className="form-group">
          <label>{esAbono ? 'Cuenta donde ingresó el dinero *' : 'Cuenta de origen *'}</label>
          <select
            className="form-control"
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
          >
            <option value="">Seleccione cuenta...</option>
            {cuentas.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.currency})</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>
            {isVES ? 'Monto a procesar en Bolívares *' : 'Monto a procesar en Dólares *'}
          </label>
          <input
            type="number"
            step="any"
            min="0.1"
            className="form-control"
            value={montoIngresado}
            onChange={(e) => setMontoIngresado(e.target.value)}
            placeholder="Ej: 50.00"
            disabled={!cuentaId}
          />
          {!cuentaId && <small className="texto-ayuda">Seleccione la cuenta primero.</small>}
        </div>

        {isVES && tasaFecha?.tasa && (
          <div className="conversion-linea destacada" style={{ marginBottom: 16 }}>
            <span>Equivalente contable (USD):</span>
            <strong>{fmtUSD(montoUSD)}</strong>
          </div>
        )}

        <div className="form-group">
          <label>Motivo / Descripción</label>
          <input
            type="text"
            className="form-control"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>

        <div className="panel-acciones">
          <button type="button" className="btn btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={cargando}>
            {cargando ? 'Procesando...' : (esAbono ? 'Registrar abono' : 'Otorgar préstamo')}
          </button>
        </div>
      </form>
    </Panel>
  )
}
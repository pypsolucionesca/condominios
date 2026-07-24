import { useState, useEffect, useCallback } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { fmtMoneda, fmtFecha, etiqueta } from '../lib/formato'
import { Panel, Aviso, Cargador, Vacio } from './UI'
import CampoFecha from './CampoFecha'

const ORIGEN_ICONO = {
  payments: '💵',
  expenses: '🧾',
  movimiento: '⚙️',
  reversion: '↩️',
  ajuste: '⚙️',
}

const ORIGEN_TEXTO = {
  payments: 'Pago recibido',
  expenses: 'Gasto',
  movimiento: 'Ajuste',
  reversion: 'Anulación',
  ajuste: 'Ajuste',
}

/**
 * Libro de movimientos de una cuenta.
 *
 * Muestra el saldo corrido línea a línea, que es lo que permite
 * conciliar contra el estado de cuenta del banco: si en algún punto
 * las cifras dejan de coincidir, se ve exactamente en qué movimiento.
 */
export default function LibroCuenta({ cuentaId, abierto, onCerrar }) {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const cargar = useCallback(async () => {
    if (!cuentaId) return
    setCargando(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.rpc('account_ledger', {
        p_account_id: cuentaId,
        p_desde: desde || null,
        p_hasta: hasta || null,
      })
      if (err) throw err
      setDatos(data)
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setCargando(false)
    }
  }, [cuentaId, desde, hasta])

  useEffect(() => {
    if (abierto) cargar()
  }, [abierto, cargar])

  const cuenta = datos?.cuenta
  const moneda = cuenta?.moneda || 'USD'
  const movimientos = datos?.movimientos || []
  const resumen = datos?.resumen || {}

  return (
    <Panel
      abierto={abierto}
      titulo={cuenta ? `Movimientos · ${cuenta.nombre}` : 'Movimientos'}
      onCerrar={onCerrar}
      ancho={760}
    >
      {error && <Aviso tipo="error" onCerrar={() => setError(null)}>{error}</Aviso>}

      {cargando && !datos ? (
        <Cargador />
      ) : cuenta ? (
        <>
          <div className="detalle-cabecera">
            <div>
              <span className="chip">{etiqueta(cuenta.tipo)}</span>
              <h3>{cuenta.nombre}</h3>
              <small>
                {cuenta.banco ? `${cuenta.banco} · ` : ''}
                {cuenta.numero || (moneda === 'USD' ? 'Dólares' : 'Bolívares')}
              </small>
            </div>
            <div className="detalle-monto">
              <small>Saldo actual</small>
              <strong>{fmtMoneda(cuenta.saldo_actual, moneda)}</strong>
            </div>
          </div>

          <div className="filtro-fechas">
            <div className="form-group">
              <label>Desde</label>
              <CampoFecha value={desde} onChange={setDesde} />
            </div>
            <div className="form-group">
              <label>Hasta</label>
              <CampoFecha value={hasta} onChange={setHasta} />
            </div>
            {(desde || hasta) && (
              <button
                className="btn-enlace-mini"
                onClick={() => {
                  setDesde('')
                  setHasta('')
                }}
              >
                Ver todo
              </button>
            )}
          </div>

          <div className="resumen-libro">
            <div>
              <small>Saldo anterior</small>
              <strong>{fmtMoneda(datos.saldo_anterior, moneda)}</strong>
            </div>
            <div>
              <small>Entradas</small>
              <strong className="texto-exito">
                + {fmtMoneda(resumen.entradas, moneda)}
              </strong>
            </div>
            <div>
              <small>Salidas</small>
              <strong className="texto-danger">
                − {fmtMoneda(resumen.salidas, moneda)}
              </strong>
            </div>
            <div>
              <small>Saldo final</small>
              <strong>{fmtMoneda(cuenta.saldo_actual, moneda)}</strong>
            </div>
          </div>

          {movimientos.length === 0 ? (
            <Vacio
              icono="📖"
              titulo="Sin movimientos"
              mensaje={
                desde || hasta
                  ? 'No hay movimientos en el rango seleccionado.'
                  : 'Los ingresos y egresos de esta cuenta aparecerán aquí.'
              }
            />
          ) : (
            <>
              {Number(cuenta.apertura) !== 0 && !desde && (
                <div className="mov-apertura">
                  <span>Saldo de apertura de la cuenta</span>
                  <strong>{fmtMoneda(cuenta.apertura, moneda)}</strong>
                </div>
              )}

              <div className="tabla-scroll">
                <table className="tabla tabla-libro">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Concepto</th>
                      <th className="der">Entrada</th>
                      <th className="der">Salida</th>
                      <th className="der">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map((m) => (
                      <tr key={m.id}>
                        <td className="col-fecha">{fmtFecha(m.fecha)}</td>
                        <td>
                          <span className="mov-icono" aria-hidden="true">
                            {ORIGEN_ICONO[m.origen] || '•'}
                          </span>
                          {m.concepto}
                          <small className="bloque">
                            {ORIGEN_TEXTO[m.origen] || 'Movimiento'}
                            {m.unidad && ` · ${m.unidad}`}
                            {m.beneficiario && ` · ${m.beneficiario}`}
                          </small>
                        </td>
                        <td className="der texto-exito">
                          {Number(m.entrada) > 0 ? fmtMoneda(m.entrada, moneda) : ''}
                        </td>
                        <td className="der texto-danger">
                          {Number(m.salida) > 0 ? fmtMoneda(m.salida, moneda) : ''}
                        </td>
                        <td className="der">
                          <strong>{fmtMoneda(m.saldo, moneda)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="texto-ayuda" style={{ marginTop: 12 }}>
                El saldo de cada línea permite conciliar contra el estado de cuenta del banco:
                si las cifras dejan de coincidir, se identifica el movimiento exacto.
              </p>
            </>
          )}
        </>
      ) : null}
    </Panel>
  )
}

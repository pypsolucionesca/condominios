import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmtUSD, fmtMoneda, fmtNumero, fmtFecha, etiqueta } from '../lib/formato'
import { Indicador, Aviso, Vacio, Cargador } from '../components/UI'
import GastosPorCategoria from '../components/GastosPorCategoria'

export default function PanelControl() {
  const { perfil, esAdmin, condominio } = useAuth()

  const [datos, setDatos] = useState(null)
  const [morosidad, setMorosidad] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    if (!perfil?.condominium_id) {
      setCargando(false)
      return
    }

    setCargando(true)
    try {
      const [rD, rM] = await Promise.all([
        supabase.rpc('dashboard_summary', { p_condominium_id: perfil.condominium_id }),
        supabase.rpc('delinquency_view', { p_condominium_id: perfil.condominium_id }),
      ])

      if (rD.error) throw rD.error
      setDatos(rD.data)
      setMorosidad(rM.error ? null : rM.data)
      setError(null)
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setCargando(false)
    }
  }, [perfil?.condominium_id])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Recarga al volver a la pestaña y cada cinco minutos: el usuario no
  // debería tener que pulsar un botón para ver datos actualizados.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible') cargar()
    }
    document.addEventListener('visibilitychange', alVolver)
    const intervalo = setInterval(cargar, 300000)

    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      clearInterval(intervalo)
    }
  }, [cargar])

  const descargarInforme = async () => {
    try {
      const desde = new Date()
      desde.setMonth(desde.getMonth() - 2)
      const desdeStr = desde.toISOString().slice(0, 10)
      const hastaStr = new Date().toISOString().slice(0, 10)

      const [rG, rC] = await Promise.all([
        supabase
          .from('expenses')
          .select(
            'expense_date, description, amount, currency, amount_usd, supplier, accounts:account_id (name), expense_categories:category_id (name), payees:payee_id (full_name)'
          )
          .gte('expense_date', desdeStr)
          .lte('expense_date', hastaStr)
          .order('expense_date', { ascending: false }),
        supabase.from('accounts_with_balance').select('*').eq('is_active', true).order('name'),
      ])

      if (rG.error) throw rG.error

      const { pdfInformeGastos, logoParaPdf, descargarPdf } = await import('../lib/pdf')
      const logo = await logoParaPdf(condominio?.logo_url)

      const doc = pdfInformeGastos({
        condominio,
        gastos: rG.data || [],
        cuentas: rC.data || [],
        desde: desdeStr,
        hasta: hastaStr,
        logoDataUrl: logo,
      })

      descargarPdf(doc, `Informe-gastos-${hastaStr}.pdf`)
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  if (cargando) return <Cargador texto="Cargando panel…" />

  if (error) {
    return <Aviso tipo="error">{error}</Aviso>
  }

  if (!datos?.autorizado) {
    return (
      <div className="card">
        <Vacio
          icono="🔒"
          titulo="Información no disponible"
          mensaje="La administración no ha habilitado la consulta de finanzas para los residentes."
        />
      </div>
    )
  }

  const ingresos = Number(datos.ingresos_mes_usd) || 0
  const gastos = Number(datos.gastos_mes_usd) || 0
  const balance = ingresos - gastos

  return (
    <>
      <div className="pagina-cabecera">
        <div>
          <h1>Panel de Control</h1>
          <p className="texto-ayuda">
            Tasa del día: {datos.tasa_actual ? `Bs. ${fmtNumero(datos.tasa_actual)}` : 'sin registrar'}
            {datos.tasa_fecha && ` (${fmtFecha(datos.tasa_fecha)})`}
          </p>
        </div>
      </div>

      {!datos.tasa_actual && (
        <Aviso tipo="aviso">
          No hay tasa de cambio registrada. Sin ella no se pueden emitir avisos ni registrar
          pagos en bolívares.
        </Aviso>
      )}

      {esAdmin && Number(datos.pagos_por_confirmar) > 0 && (
        <Aviso tipo="aviso">
          Hay {datos.pagos_por_confirmar} pago(s) reportado(s) esperando confirmación.{' '}
          <Link to="/pagos">Revisar ahora</Link>
        </Aviso>
      )}

      {esAdmin && Number(datos.compromisos_pendientes) > 0 && (
        <Aviso tipo="aviso">
          Hay {datos.compromisos_pendientes} compromiso(s) por pagar esta semana.{' '}
          <Link to="/tesoreria">Ver tesorería</Link>
        </Aviso>
      )}

      <div className="grid-indicadores">
        <Indicador
          etiqueta="Disponible total"
          valor={fmtUSD(datos.total_disponible_usd)}
          detalle="Suma de todas las cuentas"
          color="positivo"
          icono="🏦"
        />
        <Indicador
          etiqueta="Ingresos del mes"
          valor={fmtUSD(ingresos)}
          detalle="Pagos confirmados"
          color="neutro"
          icono="📥"
        />
        <Indicador
          etiqueta="Gastos del mes"
          valor={fmtUSD(gastos)}
          detalle="Egresos registrados"
          color="neutro"
          icono="📤"
        />
        <Indicador
          etiqueta="Balance del mes"
          valor={fmtUSD(balance)}
          detalle={balance >= 0 ? 'Superávit' : 'Déficit'}
          color={balance >= 0 ? 'positivo' : 'negativo'}
          icono={balance >= 0 ? '📈' : '📉'}
        />
      </div>

      <div className="card">
        <h2 className="card-header">Cuentas</h2>
        {(datos.cuentas || []).length === 0 ? (
          <Vacio
            icono="🏦"
            titulo="Sin cuentas registradas"
            mensaje="Registre las cuentas de caja y banco para llevar el control de fondos."
          />
        ) : (
          <div className="grid-cuentas">
            {datos.cuentas.map((c) => (
              <div key={c.id} className="tarjeta-cuenta">
                <div className="cuenta-cabecera">
                  <strong>{c.nombre}</strong>
                  <span className="chip">{etiqueta(c.tipo)}</span>
                </div>
                <div className="cuenta-saldo">{fmtMoneda(c.saldo, c.moneda)}</div>
                <small className="texto-ayuda">
                  {c.moneda === 'USD' ? 'Dólares' : 'Bolívares'}
                </small>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="card-header">Cartera por cobrar</h2>
        <div className="fila-resumen">
          <div>
            <small>Total adeudado</small>
            <strong className={Number(datos.total_por_cobrar_usd) > 0 ? 'texto-danger' : ''}>
              {fmtUSD(datos.total_por_cobrar_usd)}
            </strong>
          </div>
          <div>
            <small>Unidades morosas</small>
            <strong>
              {datos.unidades_morosas} de {datos.unidades_totales}
            </strong>
          </div>
        </div>

        {morosidad?.modo === 'detallado' && (morosidad.detalle || []).length > 0 && (
          <div className="tabla-scroll" style={{ marginTop: 18 }}>
            <table className="tabla tabla-morosidad">
              <thead>
                <tr>
                  <th className="col-unidad">Unidad</th>
                  <th className="col-responsable">Responsable</th>
                  <th className="der col-dias">Días</th>
                  <th className="der">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {morosidad.detalle.map((d) => (
                  <tr key={d.unit_id}>
                    <td className="col-unidad">
                      <strong>{d.codigo}</strong>
                    </td>
                    <td className="col-responsable">{d.contacto || '—'}</td>
                    <td className="der col-dias">
                      {d.dias_mora > 0 ? (
                        <span className={d.dias_mora > 30 ? 'texto-danger' : 'texto-aviso'}>
                          {d.dias_mora}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="der">
                      <strong>{fmtUSD(d.saldo_usd)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {morosidad?.modo === 'agregado' && (
          <p className="texto-ayuda" style={{ marginTop: 14 }}>
            El detalle por unidad no está visible según la configuración del condominio.
          </p>
        )}
      </div>

      <GastosPorCategoria condominiumId={perfil?.condominium_id} />

      <div className="card">
        <div className="card-header-flex">
          <h2>Gastos recientes</h2>
          {(datos.gastos_recientes || []).length > 0 && (
            <button className="btn btn-secundario btn-auto" onClick={descargarInforme}>
              Informe PDF
            </button>
          )}
        </div>
        {(datos.gastos_recientes || []).length === 0 ? (
          <Vacio
            icono="🧾"
            titulo="Sin gastos registrados"
            mensaje="Los gastos del condominio aparecerán aquí para consulta de todos."
          />
        ) : (
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Beneficiario</th>
                  <th className="der">Monto</th>
                </tr>
              </thead>
              <tbody>
                {datos.gastos_recientes.map((g) => (
                  <tr key={g.id}>
                    <td>{fmtFecha(g.fecha)}</td>
                    <td>
                      {g.descripcion}
                      {g.categoria && <small className="bloque">{g.categoria}</small>}
                    </td>
                    <td>{g.proveedor || '—'}</td>
                    <td className="der">
                      <strong>{fmtUSD(g.monto_usd)}</strong>
                      {g.moneda === 'VES' && (
                        <small className="bloque">{fmtMoneda(g.monto, 'VES')}</small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

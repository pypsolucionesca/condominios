import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmtUSD, fmtMoneda, fmtNumero, fmtFecha, etiqueta } from '../lib/formato'
import { Indicador, Aviso, Vacio, Cargador, Panel } from '../components/UI'
import CampoFecha from '../components/CampoFecha'
import GastosPorCategoria from '../components/GastosPorCategoria'
import { DetalleGasto } from '../components/Detalles'

export default function PanelControl() {
  const { perfil, esAdmin, puedeOperar, condominio } = useAuth()
  const navigate = useNavigate()

  const [datos, setDatos] = useState(null)
  const [morosidad, setMorosidad] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [panelInforme, setPanelInforme] = useState(false)
  const [gastoDetalle, setGastoDetalle] = useState(null)
  
  const [rango, setRango] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 2)
    return { desde: d.toISOString().slice(0, 10), hasta: new Date().toISOString().slice(0, 10) }
  })

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

  const descargarInforme = async (desdeStr, hastaStr) => {
    try {
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

      descargarPdf(doc, `Informe-gastos-${desdeStr}_a_${hastaStr}.pdf`)
      setPanelInforme(false)
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

  // Extraer listas y aplicar límites del "Top 10" para no reventar la portada
  const detalleMorosidad = morosidad?.detalle || []
  const topMorosos = detalleMorosidad.slice(0, 10)
  const excedenteMorosos = detalleMorosidad.length - 10

  const detalleGastos = datos.gastos_recientes || []
  const topGastos = detalleGastos.slice(0, 10)

  // Variable de control del Asistente
  const esPlataformaNueva = esAdmin && Number(datos.unidades_totales) === 0

  return (
    <>
      <style>{`
        .tabla-morosidad .col-comercio { display: table-cell; }
        .tabla-morosidad .info-movil { display: none; }
        
        .tabla-scroll-limitada {
          max-height: 420px;
          overflow-y: auto;
        }
        
        .pie-tabla-enlace {
          text-align: center;
          padding: 12px;
          background: #f9fafb;
          border-top: 1px solid #e5e7eb;
          border-bottom-left-radius: 8px;
          border-bottom-right-radius: 8px;
        }
        .pie-tabla-enlace button,
        .pie-tabla-enlace a {
          font-weight: 500;
          color: var(--primary-color, #2563eb);
          text-decoration: none;
          font-size: 0.9rem;
          background: none;
          border: none;
          cursor: pointer;
          display: inline-block;
          width: 100%;
        }
        .pie-tabla-enlace button:hover,
        .pie-tabla-enlace a:hover {
          text-decoration: underline;
        }

        .asistente-card {
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
          border: 1px solid #bfdbfe;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 24px;
        }
        .asistente-card h3 {
          color: #1e3a8a;
          margin: 0 0 8px 0;
          font-size: 1.25rem;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .asistente-pasos {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          margin-top: 16px;
        }
        .asistente-paso {
          background: white;
          padding: 16px;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          align-items: center;
          text-decoration: none;
          color: var(--text-main);
          transition: all 0.2s ease;
        }
        .asistente-paso:hover {
          border-color: var(--primary-color);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .asistente-paso strong {
          display: block;
          font-size: 1.05rem;
        }
        .asistente-paso small {
          color: #6b7280;
        }

        @media (min-width: 768px) {
          .asistente-pasos {
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 768px) {
          .tabla-morosidad .col-comercio,
          .tabla-morosidad .col-responsable { display: none !important; }
          .tabla-morosidad .info-movil { 
            display: block; 
            margin-top: 2px; 
            line-height: 1.15; 
          }
          .card-header-flex {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
          }
          .card-header-flex h2 { margin: 0 !important; }
          .card-header-flex .btn, .card-header-flex .btn-auto {
            width: 100% !important;
            margin: 0 !important;
            text-align: center;
          }
          .panel-acciones {
            flex-direction: column-reverse !important;
            gap: 10px !important;
          }
          .panel-acciones .btn {
            width: 100% !important;
            margin: 0 !important;
          }
        }
      `}</style>

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

      {puedeOperar && Number(datos.pagos_por_confirmar) > 0 && (
        <Aviso tipo="aviso">
          Hay {datos.pagos_por_confirmar} pago(s) reportado(s) esperando confirmación.{' '}
          <Link to="/pagos">Revisar ahora</Link>
        </Aviso>
      )}

      {puedeOperar && Number(datos.compromisos_pendientes) > 0 && (
        <Aviso tipo="aviso">
          Hay {datos.compromisos_pendientes} compromiso(s) por pagar esta semana.{' '}
          <Link to="/tesoreria">Ver tesorería</Link>
        </Aviso>
      )}

      {/* ASISTENTE DE BIENVENIDA PARA EMPRESAS NUEVAS */}
      {esPlataformaNueva && (
        <div className="asistente-card">
          <h3><span aria-hidden="true">🚀</span> ¡Bienvenido a su nueva plataforma!</h3>
          <p style={{ margin: 0, color: '#3b82f6' }}>
            Su base de datos ha sido provisionada con éxito. Para comenzar a registrar movimientos, complete estos dos pasos iniciales:
          </p>
          <div className="asistente-pasos">
            <Link to="/configuracion" className="asistente-paso">
              <div>
                <strong>1. Establecer Cuota Base</strong>
                <small>Defina la forma de cobro (fija o alícuota) y el día de vencimiento.</small>
              </div>
              <span aria-hidden="true" style={{ fontSize: '1.5rem', color: 'var(--primary-color)' }}>⚙️</span>
            </Link>
            <Link to="/unidades" className="asistente-paso">
              <div>
                <strong>2. Registrar Inmuebles</strong>
                <small>Cargue los apartamentos o locales para generarles sus avisos de cobro.</small>
              </div>
              <span aria-hidden="true" style={{ fontSize: '1.5rem', color: 'var(--primary-color)' }}>🏢</span>
            </Link>
          </div>
        </div>
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

      <div className="card" style={{ paddingBottom: 0 }}>
        <h2 className="card-header">Cuentas por Cobrar (Top 10)</h2>
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

        {morosidad?.modo === 'detallado' && topMorosos.length > 0 && (
          <>
            <div className="tabla-scroll tabla-scroll-limitada" style={{ marginTop: 18, marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
              <table className="tabla tabla-morosidad">
                <thead>
                  <tr>
                    <th className="col-unidad">Unidad</th>
                    <th className="col-comercio">Comercio</th>
                    <th className="col-responsable">Responsable</th>
                    <th className="der col-dias">Días</th>
                    <th className="der">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {topMorosos.map((d) => (
                    <tr
                      key={d.unit_id}
                      className="fila-clicable"
                      onClick={() => navigate(`/unidad/${d.unit_id}`)}
                    >
                      <td className="col-unidad">
                        <strong>{d.codigo}</strong>
                        <div className="info-movil">
                          {d.business_name && (
                            <small style={{ display: 'block', color: 'var(--text-main)', fontWeight: 500, marginBottom: '1px' }}>
                              {d.business_name}
                            </small>
                          )}
                          <small style={{ display: 'block', color: '#6b7280' }}>
                            {d.contacto || 'Sin responsable'}
                          </small>
                        </div>
                      </td>
                      <td className="col-comercio">{d.business_name || '—'}</td>
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
            {excedenteMorosos > 0 && puedeOperar && (
              <div className="pie-tabla-enlace">
                <Link to="/cobranza">Ver los {excedenteMorosos} morosos restantes en Cobranza →</Link>
              </div>
            )}
          </>
        )}

        {morosidad?.modo === 'agregado' && (
          <p className="texto-ayuda" style={{ marginTop: 14, paddingBottom: 16 }}>
            El detalle por unidad no está visible según la configuración del condominio.
          </p>
        )}
      </div>

      <GastosPorCategoria condominiumId={perfil?.condominium_id} />

      <div className="card" style={{ paddingBottom: 0 }}>
        <div className="card-header-flex">
          <h2>Últimos Gastos</h2>
          {topGastos.length > 0 && (
            <button className="btn btn-secundario btn-auto" onClick={() => setPanelInforme(true)}>
              Informe PDF
            </button>
          )}
        </div>
        {topGastos.length === 0 ? (
          <Vacio
            icono="🧾"
            titulo="Sin gastos registrados"
            mensaje="Los gastos del condominio aparecerán aquí para consulta de todos."
          />
        ) : (
          <>
            <div className="tabla-scroll tabla-scroll-limitada" style={{ marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
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
                  {topGastos.map((g) => (
                    <tr 
                      key={g.id}
                      className="fila-clicable"
                      onClick={() => setGastoDetalle(g.id)}
                    >
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
            {puedeOperar && (
              <div className="pie-tabla-enlace">
                <button type="button" onClick={() => navigate('/tesoreria')}>
                  Ver historial completo en Tesorería →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <Panel
        abierto={panelInforme}
        titulo="Informe de gastos en PDF"
        onCerrar={() => setPanelInforme(false)}
        ancho={420}
      >
        <p className="texto-ayuda" style={{ marginBottom: 16 }}>
          Elija el rango de fechas del informe.
        </p>
        <div className="grid-form">
          <div className="form-group">
            <label>Desde</label>
            <CampoFecha
              value={rango.desde}
              onChange={(v) => setRango({ ...rango, desde: v })}
            />
          </div>
          <div className="form-group">
            <label>Hasta</label>
            <CampoFecha
              value={rango.hasta}
              onChange={(v) => setRango({ ...rango, hasta: v })}
            />
          </div>
        </div>
        <div className="panel-acciones">
          <button
            type="button"
            className="btn btn-secundario"
            onClick={() => setPanelInforme(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => descargarInforme(rango.desde, rango.hasta)}
          >
            Generar PDF
          </button>
        </div>
      </Panel>

      <DetalleGasto
        expenseId={gastoDetalle}
        abierto={Boolean(gastoDetalle)}
        onCerrar={() => setGastoDetalle(null)}
        onCambio={cargar}
      />
    </>
  )
}
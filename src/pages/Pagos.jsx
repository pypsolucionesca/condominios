import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { urlComprobante } from '../lib/imagenes'
import { fmtUSD, fmtMoneda, fmtNumero, fmtFecha, etiqueta, hoy } from '../lib/formato'
import { Panel, MenuAcciones, Confirmar, Aviso, Vacio, Cargador } from '../components/UI'
import FormularioPago from '../components/FormularioPago'

export default function Pagos() {
  const { perfil } = useAuth()

  const [pagos, setPagos] = useState([])
  const [cuentas, setCuentas] = useState([])
  const [unidades, setUnidades] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [filtro, setFiltro] = useState('reportado')
  const [busqueda, setBusqueda] = useState('')

  const [panelConfirmar, setPanelConfirmar] = useState(false)
  const [panelRegistrar, setPanelRegistrar] = useState(false)
  const [pagoActivo, setPagoActivo] = useState(null)
  const [cuentaDestino, setCuentaDestino] = useState('')
  const [urlRecibo, setUrlRecibo] = useState(null)
  const [confirmacion, setConfirmacion] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [rP, rC, rU] = await Promise.all([
        supabase
          .from('payments')
          .select(
            'id, payment_date, currency, amount, exchange_rate, amount_usd, reference, receipt_url, status, rejection_reason, notes, unit_id, account_id, confirmed_at, units:unit_id (code)'
          )
          .order('payment_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('accounts')
          .select('id, name, kind, currency')
          .eq('is_active', true)
          .order('name'),
        supabase.from('units').select('id, code').eq('is_active', true).order('code'),
      ])

      if (rP.error) throw rP.error
      if (rC.error) throw rC.error

      setPagos(rP.data || [])
      setCuentas(rC.data || [])
      setUnidades(rU.data || [])
      setError(null)
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return pagos.filter((p) => {
      if (filtro && p.status !== filtro) return false
      if (!q) return true
      return (
        p.units?.code?.toLowerCase().includes(q) ||
        p.reference?.toLowerCase().includes(q)
      )
    })
  }, [pagos, filtro, busqueda])

  const porConfirmar = pagos.filter((p) => p.status === 'reportado')
  const totalPorConfirmar = porConfirmar.reduce((s, p) => s + Number(p.amount_usd || 0), 0)

  // ------------------------------------------------------------- acciones

  const abrirConfirmar = async (p) => {
    setPagoActivo(p)
    setCuentaDestino(
      cuentas.find((c) => c.currency === p.currency)?.id || cuentas[0]?.id || ''
    )
    setUrlRecibo(null)
    setPanelConfirmar(true)

    if (p.receipt_url) {
      const url = await urlComprobante(p.receipt_url)
      setUrlRecibo(url)
    }
  }

  const confirmarPago = async () => {
    if (!cuentaDestino) return setError('Seleccione la cuenta donde ingresó el dinero.')

    setEnviando(true)
    setError(null)
    try {
      const { error: err } = await supabase.rpc('confirm_payment', {
        p_payment_id: pagoActivo.id,
        p_account_id: cuentaDestino,
      })
      if (err) throw err

      setAviso(
        `Pago de ${fmtUSD(pagoActivo.amount_usd)} confirmado y aplicado a los avisos pendientes de ${pagoActivo.units?.code}.`
      )
      setPanelConfirmar(false)
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  const rechazar = (p) => {
    setConfirmacion({
      titulo: 'Rechazar pago',
      mensaje: `El residente de ${p.units?.code} verá el motivo del rechazo. Indique por qué no procede.`,
      peligro: true,
      textoConfirmar: 'Rechazar',
      pedirMotivo: true,
      accion: async (motivo) => {
        if (!motivo?.trim()) {
          setError('Indique el motivo del rechazo.')
          return
        }
        setEnviando(true)
        const { error: err } = await supabase.rpc('reject_payment', {
          p_payment_id: p.id,
          p_reason: motivo.trim(),
        })
        setEnviando(false)
        setConfirmacion(null)
        if (err) setError(mensajeError(err))
        else {
          setAviso('Pago rechazado.')
          setPanelConfirmar(false)
          cargar()
        }
      },
    })
  }

  // ------------------------------------------------------------------ vista

  if (cargando) return <Cargador texto="Cargando pagos…" />

  return (
    <>
      <div className="pagina-cabecera">
        <div>
          <h1>Pagos</h1>
          <p className="texto-ayuda">
            {porConfirmar.length > 0
              ? `${porConfirmar.length} por verificar · ${fmtUSD(totalPorConfirmar)}`
              : 'Sin pagos pendientes de verificación'}
          </p>
        </div>
        <button className="btn btn-primary btn-accion flotante" onClick={() => setPanelRegistrar(true)}>
          <span className="texto-boton">Registrar pago</span>
          <span className="icono-boton" aria-hidden="true">+</span>
        </button>
      </div>

      {error && <Aviso tipo="error" onCerrar={() => setError(null)}>{error}</Aviso>}
      {aviso && <Aviso tipo="exito" onCerrar={() => setAviso(null)}>{aviso}</Aviso>}

      {cuentas.length === 0 && (
        <Aviso tipo="aviso">
          No hay cuentas registradas. Cree al menos una en Tesorería para poder confirmar pagos.
        </Aviso>
      )}

      <div className="barra-filtros">
        <input
          className="form-control"
          placeholder="Buscar por unidad o referencia…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select
          className="form-control"
          style={{ maxWidth: 190 }}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        >
          <option value="reportado">Por verificar</option>
          <option value="confirmado">Confirmados</option>
          <option value="rechazado">Rechazados</option>
          <option value="">Todos</option>
        </select>
      </div>

      {visibles.length === 0 ? (
        <div className="card">
          <Vacio
            icono="💵"
            titulo={
              filtro === 'reportado' ? 'No hay pagos por verificar' : 'Sin pagos en este filtro'
            }
            mensaje={
              filtro === 'reportado'
                ? 'Cuando un residente reporte un pago, aparecerá aquí para su confirmación.'
                : 'Pruebe con otro estado.'
            }
          />
        </div>
      ) : (
        <div className="card">
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Unidad</th>
                  <th>Referencia</th>
                  <th className="der">Monto</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <tr key={p.id}>
                    <td>{fmtFecha(p.payment_date)}</td>
                    <td>
                      <strong>{p.units?.code || '—'}</strong>
                    </td>
                    <td>
                      {p.reference || '—'}
                      {p.receipt_url && <small className="bloque">📎 Con comprobante</small>}
                      {p.status === 'rechazado' && p.rejection_reason && (
                        <small className="bloque texto-error">{p.rejection_reason}</small>
                      )}
                    </td>
                    <td className="der">
                      <strong>{fmtUSD(p.amount_usd)}</strong>
                      {p.currency === 'VES' && (
                        <small className="bloque">{fmtMoneda(p.amount, 'VES')}</small>
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-${p.status}`}>{etiqueta(p.status)}</span>
                    </td>
                    <td className="der">
                      <MenuAcciones
                        acciones={[
                          {
                            icono: '✅',
                            texto: 'Revisar y confirmar',
                            oculto: p.status !== 'reportado',
                            onClick: () => abrirConfirmar(p),
                          },
                          {
                            icono: '🚫',
                            texto: 'Rechazar',
                            peligro: true,
                            oculto: p.status !== 'reportado',
                            onClick: () => rechazar(p),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ confirmar un pago */}
      <Panel
        abierto={panelConfirmar}
        titulo="Verificar pago"
        onCerrar={() => setPanelConfirmar(false)}
        ancho={560}
      >
        {pagoActivo && (
          <>
            <div className="detalle-pago">
              <div>
                <small>Unidad</small>
                <strong>{pagoActivo.units?.code}</strong>
              </div>
              <div>
                <small>Fecha</small>
                <strong>{fmtFecha(pagoActivo.payment_date)}</strong>
              </div>
              <div>
                <small>Monto reportado</small>
                <strong>{fmtMoneda(pagoActivo.amount, pagoActivo.currency)}</strong>
              </div>
              <div>
                <small>Equivalente</small>
                <strong>{fmtUSD(pagoActivo.amount_usd)}</strong>
              </div>
              {pagoActivo.currency === 'VES' && (
                <div>
                  <small>Tasa aplicada</small>
                  <strong>Bs. {fmtNumero(pagoActivo.exchange_rate)}</strong>
                </div>
              )}
              <div>
                <small>Referencia</small>
                <strong>{pagoActivo.reference || '—'}</strong>
              </div>
            </div>

            {pagoActivo.notes && (
              <p className="texto-ayuda">Nota del residente: {pagoActivo.notes}</p>
            )}

            {pagoActivo.receipt_url && (
              <div className="form-group">
                <label>Comprobante</label>
                {urlRecibo ? (
                  urlRecibo.includes('.pdf') ? (
                    <a
                      href={urlRecibo}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secundario btn-auto"
                    >
                      Abrir comprobante PDF
                    </a>
                  ) : (
                    <a href={urlRecibo} target="_blank" rel="noreferrer">
                      <img src={urlRecibo} alt="Comprobante" className="comprobante-img" />
                    </a>
                  )
                ) : (
                  <small className="texto-ayuda">Cargando comprobante…</small>
                )}
              </div>
            )}

            <div className="separador" />

            <div className="form-group">
              <label>Cuenta donde ingresó el dinero *</label>
              <select
                className="form-control"
                value={cuentaDestino}
                onChange={(e) => setCuentaDestino(e.target.value)}
              >
                <option value="">Seleccione…</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.currency}
                  </option>
                ))}
              </select>
              <small className="texto-ayuda">
                Al confirmar, el monto se abona al estado de cuenta de la unidad, se aplica a los
                avisos más antiguos y se registra el ingreso en esta cuenta.
              </small>
            </div>

            <div className="panel-acciones">
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => rechazar(pagoActivo)}
                disabled={enviando}
              >
                Rechazar
              </button>
              <button
                className="btn btn-success"
                onClick={confirmarPago}
                disabled={enviando || !cuentaDestino}
              >
                {enviando ? 'Confirmando…' : 'Confirmar pago'}
              </button>
            </div>
          </>
        )}
      </Panel>

      {/* -------------------------------------------- registro directo admin */}
      <Panel
        abierto={panelRegistrar}
        titulo="Registrar pago recibido"
        onCerrar={() => setPanelRegistrar(false)}
        ancho={620}
      >
        <FormularioPago
          unidades={unidades}
          cuentas={cuentas}
          onCancelar={() => setPanelRegistrar(false)}
          onCompletado={(mensaje) => {
            setPanelRegistrar(false)
            setAviso(mensaje)
            cargar()
          }}
        />
      </Panel>

      <ConfirmarConMotivo
        datos={confirmacion}
        onCancelar={() => setConfirmacion(null)}
        enviando={enviando}
      />
    </>
  )
}

/** Diálogo de confirmación que además pide un motivo escrito. */
function ConfirmarConMotivo({ datos, onCancelar, enviando }) {
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    if (datos) setMotivo('')
  }, [datos])

  if (!datos) return null

  if (!datos.pedirMotivo) {
    return (
      <Confirmar
        abierto
        titulo={datos.titulo}
        mensaje={datos.mensaje}
        peligro={datos.peligro}
        textoConfirmar={datos.textoConfirmar}
        onConfirmar={() => datos.accion()}
        onCancelar={onCancelar}
      />
    )
  }

  return (
    <div className="panel-fondo" onClick={onCancelar}>
      <div className="dialogo" onClick={(e) => e.stopPropagation()} role="alertdialog">
        <h3>{datos.titulo}</h3>
        <p>{datos.mensaje}</p>
        <div className="form-group">
          <label>Motivo *</label>
          <textarea
            className="form-control"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="La referencia no aparece en el estado de cuenta bancario"
            autoFocus
          />
        </div>
        <div className="dialogo-botones">
          <button className="btn btn-secundario" onClick={onCancelar}>
            Cancelar
          </button>
          <button
            className="btn btn-danger"
            onClick={() => datos.accion(motivo)}
            disabled={enviando || !motivo.trim()}
          >
            {enviando ? 'Procesando…' : datos.textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}

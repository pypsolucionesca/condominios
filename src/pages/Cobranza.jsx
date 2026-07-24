import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmtUSD, fmtFecha, fmtMesAno, etiqueta, hoy } from '../lib/formato'
import { Panel, MenuAcciones, Confirmar, Aviso, Vacio, Cargador } from '../components/UI'
import CampoFecha from '../components/CampoFecha'
import { DetalleAviso } from '../components/Detalles'

const MODOS = [
  {
    valor: 'fija',
    etiqueta: 'Cuota fija',
    ayuda: 'Cada unidad paga su cuota configurada.',
  },
  {
    valor: 'alicuota',
    etiqueta: 'Repartir por alícuota',
    ayuda: 'Se distribuye un monto total según los metros cuadrados de cada unidad.',
  },
  {
    valor: 'mixto',
    etiqueta: 'Cuota fija + derrama',
    ayuda: 'Cuota habitual más un gasto extraordinario prorrateado por alícuota.',
  },
]

const TIPOS_CARGO = [
  { valor: 'extraordinaria', etiqueta: 'Cuota extraordinaria' },
  { valor: 'multa', etiqueta: 'Multa' },
  { valor: 'consumo', etiqueta: 'Consumo' },
  { valor: 'otro', etiqueta: 'Otro' },
]

const mesActual = () => new Date().toISOString().slice(0, 7)

export default function Cobranza() {
  const { perfil, condominio } = useAuth()

  const [avisos, setAvisos] = useState([])
  const [unidades, setUnidades] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [busqueda, setBusqueda] = useState('')

  const [panelEmitir, setPanelEmitir] = useState(false)
  const [panelCargo, setPanelCargo] = useState(false)
  const [confirmacion, setConfirmacion] = useState(null)
  const [avisoDetalle, setAvisoDetalle] = useState(null)

  const [formEmision, setFormEmision] = useState({
    periodo: mesActual(),
    modo: 'fija',
    presupuesto: '',
    descripcion: '',
    etiquetaExtra: 'Cuota extraordinaria',
  })
  const [vistaPrevia, setVistaPrevia] = useState(null)
  const [calculando, setCalculando] = useState(false)

  const [formCargo, setFormCargo] = useState({
    unit_id: '',
    kind: 'extraordinaria',
    description: '',
    amount: '',
    due_date: '',
  })

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [rA, rU] = await Promise.all([
        supabase
          .from('invoices')
          .select(
            'id, invoice_number, issue_date, due_date, subtotal, total, status, unit_id, period_id, units:unit_id (code, unit_type)'
          )
          .order('issue_date', { ascending: false })
          .order('invoice_number', { ascending: false })
          .limit(300),
        supabase
          .from('units')
          .select('id, code, unit_type, fixed_fee, is_active')
          .eq('is_active', true)
          .order('code'),
      ])

      if (rA.error) throw rA.error
      if (rU.error) throw rU.error

      setAvisos(rA.data || [])
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

  useEffect(() => {
    if (condominio?.default_billing_mode) {
      setFormEmision((f) => ({ ...f, modo: condominio.default_billing_mode }))
    }
  }, [condominio?.default_billing_mode])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return avisos.filter((a) => {
      if (filtroEstado && a.status !== filtroEstado) return false
      if (!q) return true
      return (
        a.units?.code?.toLowerCase().includes(q) || String(a.invoice_number).includes(q)
      )
    })
  }, [avisos, filtroEstado, busqueda])

  const pendientes = avisos.filter((a) => ['emitido', 'parcial'].includes(a.status))
  const totalPendiente = pendientes.reduce((s, a) => s + Number(a.total || 0), 0)

  // ------------------------------------------------------------- acciones

  const calcularPrevia = useCallback(async () => {
    if (!perfil?.condominium_id) return

    setCalculando(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.rpc('preview_period_invoices', {
        p_condominium_id: perfil.condominium_id,
        p_period: `${formEmision.periodo}-01`,
        p_mode: formEmision.modo,
        p_budget: formEmision.presupuesto ? Number(formEmision.presupuesto) : null,
      })
      if (err) throw err
      setVistaPrevia(data)
    } catch (err) {
      setError(mensajeError(err))
      setVistaPrevia(null)
    } finally {
      setCalculando(false)
    }
  }, [perfil?.condominium_id, formEmision.periodo, formEmision.modo, formEmision.presupuesto])

  useEffect(() => {
    if (panelEmitir) calcularPrevia()
  }, [panelEmitir, calcularPrevia])

  const emitir = async () => {
    if (formEmision.modo !== 'fija') {
      const p = Number(formEmision.presupuesto)
      if (!p || p <= 0) {
        setError('Indique el monto a repartir entre las unidades.')
        return
      }
    }

    setEnviando(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.rpc('issue_period_invoices', {
        p_condominium_id: perfil.condominium_id,
        p_period: `${formEmision.periodo}-01`,
        p_mode: formEmision.modo,
        p_budget: formEmision.presupuesto ? Number(formEmision.presupuesto) : null,
        p_description: formEmision.descripcion.trim() || null,
        p_extra_label: formEmision.etiquetaExtra.trim() || 'Cuota extraordinaria',
        p_due_date: null,
      })
      if (err) throw err

      setAviso(
        `${data.emitidos} aviso(s) emitido(s) por ${fmtUSD(data.total_facturado)}. ` +
          `Vencen el ${fmtFecha(data.vencimiento)}.` +
          (data.omitidos > 0 ? ` ${data.omitidos} omitido(s) por ya tener aviso.` : '')
      )
      setPanelEmitir(false)
      setVistaPrevia(null)
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
      setConfirmacion(null)
    }
  }

  const crearCargo = async (e) => {
    e.preventDefault()
    setError(null)

    if (!formCargo.unit_id) return setError('Seleccione la unidad.')
    if (!formCargo.description.trim()) return setError('Describa el concepto del cargo.')
    const monto = Number(formCargo.amount)
    if (!monto || monto <= 0) return setError('El monto debe ser mayor que cero.')

    setEnviando(true)
    try {
      const { error: err } = await supabase.rpc('issue_single_charge', {
        p_unit_id: formCargo.unit_id,
        p_kind: formCargo.kind,
        p_description: formCargo.description.trim(),
        p_amount: monto,
        p_due_date: formCargo.due_date || null,
      })
      if (err) throw err

      setAviso('Cargo registrado.')
      setPanelCargo(false)
      setFormCargo({ unit_id: '', kind: 'extraordinaria', description: '', amount: '', due_date: '' })
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  const anular = (a) => {
    setConfirmacion({
      titulo: `Anular aviso N° ${a.invoice_number}`,
      mensaje: `Se revertirá el cargo de ${fmtUSD(a.subtotal)} en el estado de cuenta de ${a.units?.code}. El movimiento queda registrado en el historial.`,
      peligro: true,
      textoConfirmar: 'Anular',
      accion: async () => {
        setEnviando(true)
        const { error: err } = await supabase.rpc('void_invoice', {
          p_invoice_id: a.id,
          p_reason: 'Anulado desde cobranza',
        })
        setEnviando(false)
        setConfirmacion(null)
        if (err) setError(mensajeError(err))
        else {
          setAviso(`Aviso N° ${a.invoice_number} anulado.`)
          cargar()
        }
      },
    })
  }

  const descargarAviso = async (a) => {
    setError(null)
    try {
      const [rItems, rUnidad, rMiembros] = await Promise.all([
        supabase
          .from('invoice_items')
          .select('description, kind, quantity, unit_price, amount')
          .eq('invoice_id', a.id),
        supabase
          .from('units')
          .select('id, code, unit_type, location_name, logo_url')
          .eq('id', a.unit_id)
          .maybeSingle(),
        supabase
          .from('unit_members')
          .select('is_primary, profiles:user_id (full_name)')
          .eq('unit_id', a.unit_id)
          .order('is_primary', { ascending: false }),
      ])

      if (rItems.error) throw rItems.error

      // jsPDF pesa ~400 KB: se carga solo cuando se genera un PDF
      const { pdfAviso, logoParaPdf, descargarPdf } = await import('../lib/pdf')
      const logo = await logoParaPdf(condominio?.logo_url)

      const doc = pdfAviso({
        aviso: a,
        renglones: rItems.data || [],
        unidad: rUnidad.data,
        condominio,
        residentes: (rMiembros.data || []).map((m) => m.profiles).filter(Boolean),
        logoDataUrl: logo,
      })

      descargarPdf(doc, `Aviso-${a.invoice_number}-${rUnidad.data?.code || ''}.pdf`)
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  // ------------------------------------------------------------------ vista

  if (cargando) return <Cargador texto="Cargando avisos…" />

  const modoActual = MODOS.find((m) => m.valor === formEmision.modo)
  const totalPrevia = (vistaPrevia?.detalle || []).reduce((s, d) => s + Number(d.total || 0), 0)
  const nuevos = (vistaPrevia?.detalle || []).filter((d) => !d.ya_tiene_aviso).length

  return (
    <>
      <div className="pagina-cabecera">
        <div>
          <h1>Cobranza</h1>
          <p className="texto-ayuda">
            {pendientes.length} aviso(s) pendiente(s) · {fmtUSD(totalPendiente)} por cobrar
          </p>
        </div>
        <div className="grupo-botones">
          <button className="btn btn-secundario btn-accion" onClick={() => setPanelCargo(true)}>
            Cargo individual
          </button>
          <button className="btn btn-primary btn-accion" onClick={() => setPanelEmitir(true)}>
            Emitir período
          </button>
        </div>
      </div>

      {error && <Aviso tipo="error" onCerrar={() => setError(null)}>{error}</Aviso>}
      {aviso && <Aviso tipo="exito" onCerrar={() => setAviso(null)}>{aviso}</Aviso>}

      {!condominio?.default_fee && condominio?.default_billing_mode === 'fija' && (
        <Aviso tipo="aviso">
          No hay una cuota mensual configurada. Defínala en Configuración antes de emitir.
        </Aviso>
      )}

      <div className="barra-filtros">
        <input
          className="form-control"
          placeholder="Buscar por unidad o número de aviso…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select
          className="form-control"
          style={{ maxWidth: 190 }}
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
        >
          <option value="">Todos los estados</option>
          <option value="emitido">Pendientes</option>
          <option value="parcial">Abonados</option>
          <option value="pagado">Pagados</option>
          <option value="anulado">Anulados</option>
        </select>
      </div>

      {visibles.length === 0 ? (
        <div className="card">
          <Vacio
            icono="📄"
            titulo={avisos.length === 0 ? 'Aún no hay avisos emitidos' : 'Sin resultados'}
            mensaje={
              avisos.length === 0
                ? 'Emita el primer período para comenzar a cobrar las cuotas del condominio.'
                : 'Pruebe con otros filtros.'
            }
            accion={
              avisos.length === 0 ? (
                <button className="btn btn-primary btn-auto" onClick={() => setPanelEmitir(true)}>
                  Emitir período
                </button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="card">
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Unidad</th>
                  <th>Emitido</th>
                  <th>Vence</th>
                  <th>Estado</th>
                  <th className="der">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibles.map((a) => {
                  const vencido =
                    ['emitido', 'parcial'].includes(a.status) &&
                    new Date(a.due_date) < new Date(hoy())

                  return (
                    <tr
                      key={a.id}
                      className="fila-clicable"
                      onClick={() => setAvisoDetalle(a.id)}
                    >
                      <td>
                        <strong>{a.invoice_number}</strong>
                      </td>
                      <td>{a.units?.code || '—'}</td>
                      <td>{fmtFecha(a.issue_date)}</td>
                      <td className={vencido ? 'texto-danger' : ''}>
                        {fmtFecha(a.due_date)}
                        {vencido && <small className="bloque">Vencido</small>}
                      </td>
                      <td>
                        <span className={`badge badge-${a.status}`}>{etiqueta(a.status)}</span>
                      </td>
                      <td className="der">
                        <strong>{fmtUSD(a.total)}</strong>
                      </td>
                      <td className="der" onClick={(e) => e.stopPropagation()}>
                        <MenuAcciones
                          acciones={[
                            {
                              icono: '🔍',
                              texto: 'Ver detalle',
                              onClick: () => setAvisoDetalle(a.id),
                            },
                            {
                              icono: '📄',
                              texto: 'Descargar PDF',
                              onClick: () => descargarAviso(a),
                            },
                            {
                              icono: '🚫',
                              texto: 'Anular',
                              peligro: true,
                              oculto: a.status === 'anulado' || a.status === 'pagado',
                              onClick: () => anular(a),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --------------------------------------------------- emitir período */}
      <Panel
        abierto={panelEmitir}
        titulo="Emitir avisos del período"
        onCerrar={() => {
          setPanelEmitir(false)
          setVistaPrevia(null)
        }}
        ancho={600}
      >
        <div className="grid-form">
          <div className="form-group">
            <label>Período *</label>
            <input
              type="month"
              className="form-control"
              value={formEmision.periodo}
              onChange={(e) => setFormEmision({ ...formEmision, periodo: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Modo de cobro *</label>
            <select
              className="form-control"
              value={formEmision.modo}
              onChange={(e) => setFormEmision({ ...formEmision, modo: e.target.value })}
            >
              {MODOS.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.etiqueta}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="texto-ayuda">{modoActual?.ayuda}</p>

        {formEmision.modo !== 'fija' && (
          <div className="form-group">
            <label>
              {formEmision.modo === 'alicuota' ? 'Monto total a repartir *' : 'Derrama a repartir *'}
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="form-control"
              value={formEmision.presupuesto}
              onChange={(e) => setFormEmision({ ...formEmision, presupuesto: e.target.value })}
              placeholder="0.00"
            />
            <small className="texto-ayuda">
              Se distribuye entre las unidades activas según su alícuota.
            </small>
          </div>
        )}

        <div className="form-group">
          <label>Descripción del cargo</label>
          <input
            className="form-control"
            value={formEmision.descripcion}
            onChange={(e) => setFormEmision({ ...formEmision, descripcion: e.target.value })}
            placeholder={`Cuota de condominio ${fmtMesAno(formEmision.periodo + '-01')}`}
          />
        </div>

        {formEmision.modo === 'mixto' && (
          <div className="form-group">
            <label>Concepto de la derrama</label>
            <input
              className="form-control"
              value={formEmision.etiquetaExtra}
              onChange={(e) => setFormEmision({ ...formEmision, etiquetaExtra: e.target.value })}
              placeholder="Reparación de portón"
            />
          </div>
        )}

        <div className="separador" />

        <h4 className="subtitulo">Vista previa</h4>

        {calculando ? (
          <Cargador texto="Calculando…" />
        ) : !vistaPrevia ? (
          <p className="texto-ayuda">Ajuste los datos para ver el detalle.</p>
        ) : (
          <>
            {vistaPrevia.ya_emitido && (
              <Aviso tipo="aviso">
                Ya existen avisos para este período. Las unidades que ya lo tengan serán omitidas.
              </Aviso>
            )}

            <div className="fila-resumen" style={{ marginBottom: 14 }}>
              <div>
                <small>Se emitirán</small>
                <strong>{nuevos} aviso(s)</strong>
              </div>
              <div>
                <small>Total a facturar</small>
                <strong>{fmtUSD(totalPrevia)}</strong>
              </div>
              <div>
                <small>Vencimiento</small>
                <strong>{fmtFecha(vistaPrevia.vencimiento)}</strong>
              </div>
            </div>

            <div className="tabla-scroll" style={{ maxHeight: 260 }}>
              <table className="tabla tabla-compacta">
                <thead>
                  <tr>
                    <th>Unidad</th>
                    {formEmision.modo !== 'alicuota' && <th className="der">Cuota</th>}
                    {formEmision.modo !== 'fija' && <th className="der">Prorrateo</th>}
                    <th className="der">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {vistaPrevia.detalle.map((d) => (
                    <tr key={d.unit_id} className={d.ya_tiene_aviso ? 'fila-omitida' : ''}>
                      <td>
                        {d.codigo}
                        {d.ya_tiene_aviso && <small className="bloque">Ya emitido</small>}
                      </td>
                      {formEmision.modo !== 'alicuota' && (
                        <td className="der">{fmtUSD(d.cuota_fija)}</td>
                      )}
                      {formEmision.modo !== 'fija' && (
                        <td className="der">{fmtUSD(d.prorrateo)}</td>
                      )}
                      <td className="der">
                        <strong>{fmtUSD(d.total)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="panel-acciones">
          <button
            type="button"
            className="btn btn-secundario"
            onClick={() => {
              setPanelEmitir(false)
              setVistaPrevia(null)
            }}
          >
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={enviando || calculando || nuevos === 0}
            onClick={() =>
              setConfirmacion({
                titulo: 'Confirmar emisión',
                mensaje: `Se emitirán ${nuevos} aviso(s) por un total de ${fmtUSD(totalPrevia)}. Los avisos emitidos solo pueden anularse, no borrarse.`,
                textoConfirmar: 'Emitir',
                accion: emitir,
              })
            }
          >
            {enviando ? 'Emitiendo…' : `Emitir ${nuevos} aviso(s)`}
          </button>
        </div>
      </Panel>

      {/* -------------------------------------------------- cargo individual */}
      <Panel
        abierto={panelCargo}
        titulo="Cargo individual"
        onCerrar={() => setPanelCargo(false)}
      >
        <p className="texto-ayuda">
          Para multas, consumos o cuotas extraordinarias que aplican a una sola unidad.
        </p>

        <form onSubmit={crearCargo}>
          <div className="form-group">
            <label>Unidad *</label>
            <select
              className="form-control"
              value={formCargo.unit_id}
              onChange={(e) => setFormCargo({ ...formCargo, unit_id: e.target.value })}
            >
              <option value="">Seleccione…</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Tipo de cargo *</label>
            <select
              className="form-control"
              value={formCargo.kind}
              onChange={(e) => setFormCargo({ ...formCargo, kind: e.target.value })}
            >
              {TIPOS_CARGO.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Concepto *</label>
            <input
              className="form-control"
              value={formCargo.description}
              onChange={(e) => setFormCargo({ ...formCargo, description: e.target.value })}
              placeholder="Reposición de vidrio del portón"
            />
          </div>

          <div className="grid-form">
            <div className="form-group">
              <label>Monto (USD) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                value={formCargo.amount}
                onChange={(e) => setFormCargo({ ...formCargo, amount: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Vencimiento</label>
              <CampoFecha
                className="form-control"
                value={formCargo.due_date}
                onChange={(v) => setFormCargo({ ...formCargo, due_date: v })}
              />
            </div>
          </div>

          <div className="panel-acciones">
            <button
              type="button"
              className="btn btn-secundario"
              onClick={() => setPanelCargo(false)}
            >
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Registrando…' : 'Registrar cargo'}
            </button>
          </div>
        </form>
      </Panel>

      <DetalleAviso
        invoiceId={avisoDetalle}
        abierto={Boolean(avisoDetalle)}
        onCerrar={() => setAvisoDetalle(null)}
        onCambio={cargar}
      />

      <Confirmar
        abierto={Boolean(confirmacion)}
        titulo={confirmacion?.titulo}
        mensaje={confirmacion?.mensaje}
        peligro={confirmacion?.peligro}
        textoConfirmar={confirmacion?.textoConfirmar}
        onConfirmar={() => confirmacion?.accion()}
        onCancelar={() => setConfirmacion(null)}
      />
    </>
  )
}

import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmtUSD, fmtFecha, fmtMesAno, etiqueta, hoy, normalizar } from '../lib/formato'
import { Panel, MenuAcciones, Confirmar, Aviso, Vacio, Cargador, IconoAyuda } from '../components/UI'
import CampoFecha from '../components/CampoFecha'
import { DetalleAviso } from '../components/Detalles'

const MODOS = [
  {
    valor: 'fija',
    etiqueta: 'Cuota fija',
  },
  {
    valor: 'alicuota',
    etiqueta: 'Repartir por alícuota',
  },
  {
    valor: 'mixto',
    etiqueta: 'Cuota fija + derrama',
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
  const { perfil, condominio, esAdmin } = useAuth()

  const [avisos, setAvisos] = useState([])
  const [unidades, setUnidades] = useState([])
  const [miembros, setMiembros] = useState([])
  const [saldosGlobales, setSaldosGlobales] = useState({}) // Fuente de verdad absoluta
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [notificando, setNotificando] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [busqueda, setBusqueda] = useState('')

  const [panelEmitir, setPanelEmitir] = useState(false)
  const [panelCargo, setPanelCargo] = useState(false)
  const [panelNotificar, setPanelNotificar] = useState(false)
  const [confirmacion, setConfirmacion] = useState(null)
  const [avisoDetalle, setAvisoDetalle] = useState(null)
  
  // Estados para el modal de notificaciones
  const [seleccionados, setSeleccionados] = useState([])
  const [filtroTextoModal, setFiltroTextoModal] = useState('')
  const [filtroTipoModal, setFiltroTipoModal] = useState('')
  const [filtroTiempoModal, setFiltroTiempoModal] = useState('vencidos')

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
      const [rA, rU, rM] = await Promise.all([
        supabase
          .from('invoices')
          .select(
            'id, invoice_number, issue_date, due_date, subtotal, previous_balance, total, notes, status, unit_id, period_id, units:unit_id (code, unit_type, business_name), billing_periods:period_id (period)'
          )
          .order('issue_date', { ascending: false })
          .order('invoice_number', { ascending: false })
          .limit(300),
        supabase
          .from('units')
          .select('id, code, unit_type, business_name, fixed_fee, is_active')
          .eq('is_active', true)
          .order('code'),
        supabase
          .from('unit_members')
          .select('unit_id, profiles:user_id (full_name)'),
      ])

      if (rA.error) throw rA.error
      if (rU.error) throw rU.error
      if (rM.error) throw rM.error

      const unidadesData = rU.data || []
      
      // EXTRACCIÓN DE SALDOS REALES: Obligamos a consultar el saldo exacto de cada unidad
      // Esto emula el mismo cálculo que hace MiCuenta.jsx para evitar discrepancias
      const balancesFetch = await Promise.all(
        unidadesData.map(u => 
          supabase.rpc('unit_balance', { p_unit_id: u.id })
            .then(res => ({ id: u.id, saldo: Number(res.data) || 0 }))
            .catch(() => ({ id: u.id, saldo: 0 }))
        )
      )
      
      const mapaSaldos = {}
      balancesFetch.forEach(b => { mapaSaldos[b.id] = b.saldo })

      setAvisos(rA.data || [])
      setUnidades(unidadesData)
      setMiembros(rM.data || [])
      setSaldosGlobales(mapaSaldos)
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

  const responsablesPorUnidad = useMemo(() => {
    const mapa = {}
    for (const m of miembros) {
      if (!m.profiles?.full_name) continue
      ;(mapa[m.unit_id] = mapa[m.unit_id] || []).push(m.profiles.full_name)
    }
    return mapa
  }, [miembros])

  const tiposUnidad = useMemo(() => {
    const tipos = [...new Set(unidades.map((u) => u.unit_type))].filter(Boolean)
    return tipos.map((t) => ({
      valor: t,
      etiqueta: t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' '),
    }))
  }, [unidades])

  const visibles = useMemo(() => {
    const q = normalizar(busqueda)
    return avisos.filter((a) => {
      if (filtroEstado && a.status !== filtroEstado) return false
      if (!q) return true
      const responsables = (responsablesPorUnidad[a.unit_id] || []).join(' ')
      return (
        normalizar(a.units?.code).includes(q) ||
        normalizar(a.units?.business_name).includes(q) ||
        normalizar(responsables).includes(q) ||
        String(a.invoice_number).includes(q)
      )
    })
  }, [avisos, filtroEstado, busqueda, responsablesPorUnidad])

  const pendientes = avisos.filter((a) => ['emitido', 'parcial'].includes(a.status))
  const totalPendiente = pendientes.reduce((s, a) => s + Number(a.subtotal || 0), 0)

  // AGRUPACIÓN DE DEUDORES 100% FIABLE
  const deudores = useMemo(() => {
    const mapa = {}
    const fHoy = new Date(hoy() + 'T00:00:00')
    
    for (const a of pendientes) {
      const saldoReal = saldosGlobales[a.unit_id] || 0
      
      // FILTRO MAESTRO: Si la unidad tiene saldo a favor o está en cero, se ignora completamente.
      if (saldoReal <= 0.01) continue

      if (!mapa[a.unit_id]) {
        mapa[a.unit_id] = {
          id: a.unit_id,
          code: a.units?.code || '—',
          comercio: a.units?.business_name,
          tipo: a.units?.unit_type,
          responsables: (responsablesPorUnidad[a.unit_id] || []).join(', '),
          deuda: saldoReal, // Asignamos el saldo exacto que arroja la base de datos
          avisos: 0,
          diasVencidoMax: -9999
        }
      }

      mapa[a.unit_id].avisos += 1
      
      let diasVencido = 0
      if (a.due_date) {
        const fVence = new Date(a.due_date + 'T00:00:00')
        diasVencido = Math.floor((fHoy - fVence) / (1000 * 60 * 60 * 24))
      }
      
      if (diasVencido > mapa[a.unit_id].diasVencidoMax) {
        mapa[a.unit_id].diasVencidoMax = diasVencido
      }
    }
    return Object.values(mapa).sort((a, b) => b.deuda - a.deuda)
  }, [pendientes, responsablesPorUnidad, saldosGlobales])

  // Filtrado de deudores dentro del modal
  const deudoresFiltrados = useMemo(() => {
    return deudores.filter((d) => {
      if (filtroTipoModal && d.tipo !== filtroTipoModal) return false
      
      if (filtroTiempoModal) {
        if (filtroTiempoModal === 'vencidos' && d.diasVencidoMax <= 0) return false
        if (filtroTiempoModal === '30' && d.diasVencidoMax <= 30) return false
        if (filtroTiempoModal === '60' && d.diasVencidoMax <= 60) return false
        if (filtroTiempoModal === '90' && d.diasVencidoMax <= 90) return false
      }
      
      if (filtroTextoModal) {
        const q = normalizar(filtroTextoModal)
        if (
          !normalizar(d.code).includes(q) &&
          !normalizar(d.comercio || '').includes(q) &&
          !normalizar(d.responsables).includes(q)
        ) {
          return false
        }
      }
      return true
    })
  }, [deudores, filtroTipoModal, filtroTiempoModal, filtroTextoModal])

  const abrirPanelNotificar = () => {
    setFiltroTextoModal('')
    setFiltroTipoModal('')
    setFiltroTiempoModal('vencidos') 
    
    const inicialesVencidos = deudores.filter(d => d.diasVencidoMax > 0).map(d => d.id)
    setSeleccionados(inicialesVencidos) 
    
    setPanelNotificar(true)
  }

  const toggleSeleccion = (id) => {
    setSeleccionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const todosSeleccionados = deudoresFiltrados.length > 0 && deudoresFiltrados.every((d) => seleccionados.includes(d.id))

  const toggleTodos = (e) => {
    if (e.target.checked) {
      const nuevos = new Set(seleccionados)
      deudoresFiltrados.forEach((d) => nuevos.add(d.id))
      setSeleccionados([...nuevos])
    } else {
      const filtradosIds = deudoresFiltrados.map((d) => d.id)
      setSeleccionados(seleccionados.filter((id) => !filtradosIds.includes(id)))
    }
  }

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

  const ejecutarNotificacionMasiva = async () => {
    if (seleccionados.length === 0) return setError('Debe seleccionar al menos un residente.')

    setError(null)
    setAviso(null)
    setNotificando(true)
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      const res = await supabase.functions.invoke('notify-debtors', {
        body: { 
          condominium_id: perfil.condominium_id,
          unit_ids: seleccionados 
        },
        headers: { Authorization: `Bearer ${session.access_token}` }
      })

      if (res.error) throw new Error(res.error.message || 'Error al ejecutar la función de notificación')
      if (res.data?.error) throw new Error(res.data.error)
      
      setAviso(`Se han enviado notificaciones y correos a ${res.data.usuariosNotificados || 0} residente(s) de forma exitosa.`)
      setPanelNotificar(false)
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setNotificando(false)
    }
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

  if (cargando) return <Cargador texto="Cargando avisos…" />

  const totalPrevia = (vistaPrevia?.detalle || []).reduce((s, d) => s + Number(d.total || 0), 0)
  const nuevos = (vistaPrevia?.detalle || []).filter((d) => !d.ya_tiene_aviso).length

  return (
    <>
      <style>{`
        .tabla-cobranza .col-comercio { display: table-cell; }
        .tabla-cobranza .celda-unidad { width: 200px; min-width: 200px; }
        .tabla-cobranza .info-movil { display: none; }
        @media (max-width: 768px) {
          .tabla-cobranza .col-comercio { display: none !important; }
          .tabla-cobranza .celda-unidad { width: 180px; min-width: 180px; }
          .tabla-cobranza .info-movil { 
            display: block; 
            margin-top: 2px; 
            line-height: 1.15; 
          }
          .pagina-cabecera {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
          }
          .pagina-cabecera .grupo-botones {
            width: 100% !important;
            display: flex;
            flex-direction: column !important;
            gap: 8px !important;
          }
          .pagina-cabecera .grupo-botones .btn {
            width: 100% !important;
            margin: 0 !important;
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
          <h1>Cobranza</h1>
          <p className="texto-ayuda">
            {pendientes.length} aviso(s) pendiente(s) · {fmtUSD(totalPendiente)} por cobrar
          </p>
        </div>
        <div className="grupo-botones">
          {esAdmin && (
            <button 
              className="btn btn-secundario btn-accion" 
              onClick={abrirPanelNotificar}
              disabled={notificando || pendientes.length === 0}
              style={{ backgroundColor: '#fef2f2', color: '#b91c1c', borderColor: '#fca5a5' }}
            >
              🔔 Notificar morosos
            </button>
          )}
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
          placeholder="Buscar por unidad, empresa, propietario o número de aviso…"
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
          <option value="parcial">Pagados</option>
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
            <table className="tabla tabla-cobranza">
              <thead>
                <tr>
                  <th>N°</th>
                  <th className="celda-unidad">Unidad</th>
                  <th className="col-comercio">Comercio</th>
                  <th>Concepto</th>
                  <th>Emitido</th>
                  <th>Vence</th>
                  <th>Estado</th>
                  <th className="der">Monto</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibles.map((a) => {
                  const vencido =
                    ['emitido', 'parcial'].includes(a.status) &&
                    new Date(a.due_date) < new Date(hoy())

                  const estadoVisual = a.status === 'parcial' ? 'pagado' : a.status
                  const etiquetaVisual = a.status === 'parcial' ? 'Pagado' : etiqueta(a.status)

                  const esComercial = a.units?.unit_type === 'local_comercial' && a.units?.business_name
                  const responsablesList = responsablesPorUnidad[a.unit_id] || []

                  return (
                    <tr
                      key={a.id}
                      className="fila-clicable"
                      onClick={() => setAvisoDetalle(a.id)}
                    >
                      <td>
                        <strong>{a.invoice_number}</strong>
                      </td>
                      <td className="celda-unidad">
                        <strong>
                          {esComercial ? a.units.business_name : (a.units?.code || '—')}
                        </strong>
                        <div className="info-movil">
                          {esComercial && (
                            <small style={{ display: 'block', color: 'var(--text-main)', fontWeight: 500, marginBottom: '1px' }}>
                              {a.units.code}
                            </small>
                          )}
                          {responsablesList.length > 0 && (
                            <small style={{ display: 'block', color: '#6b7280' }}>
                              {responsablesList.join(', ')}
                            </small>
                          )}
                        </div>
                        {!esComercial && responsablesList.length > 0 && (
                          <small className="bloque" style={{ color: 'var(--text-muted)' }}>
                            {responsablesList.join(', ')}
                          </small>
                        )}
                      </td>
                      <td className="col-comercio">{a.units?.business_name || '—'}</td>
                      <td>
                        {a.billing_periods?.period
                          ? fmtMesAno(a.billing_periods.period)
                          : a.notes
                          ? a.notes
                          : 'Cargo puntual'}
                      </td>
                      <td>{fmtFecha(a.issue_date)}</td>
                      <td className={vencido ? 'texto-danger' : ''}>
                        {fmtFecha(a.due_date)}
                        {vencido && <small className="bloque">Vencido</small>}
                      </td>
                      <td>
                        <span className={`badge badge-${estadoVisual}`}>{etiquetaVisual}</span>
                      </td>
                      <td className="der">
                        <strong>{fmtUSD(a.subtotal)}</strong>
                        {Number(a.previous_balance) > 0 && (
                          <small className="bloque" style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                            Acum. {fmtUSD(a.total)}
                          </small>
                        )}
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
            <label>
              Modo de cobro *
              <IconoAyuda texto="'Fija': cada unidad paga su cuota preestablecida. 'Alícuota': distribuye un gasto total según el tamaño de cada unidad. 'Mixto': suma ambos modos." />
            </label>
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

        {formEmision.modo !== 'fija' && (
          <div className="form-group">
            <label>
              {formEmision.modo === 'alicuota' ? 'Monto total a repartir *' : 'Derrama a repartir *'}
              <IconoAyuda texto="Presupuesto total que se dividirá automáticamente entre todas las unidades basándose en su porcentaje de alícuota." />
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
        titulo={
          <>
            Cargo individual
            <IconoAyuda texto="Se utiliza para aplicar deudas extraordinarias a una sola unidad en particular (como multas o consumos) sin afectar al resto del edificio." />
          </>
        }
        onCerrar={() => setPanelCargo(false)}
      >
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

      {/* -------------------------------------------------- SELECCIÓN DE MOROSOS */}
      <Panel abierto={panelNotificar} titulo="Seleccionar residentes a notificar" onCerrar={() => setPanelNotificar(false)} ancho={900}>
        <p className="texto-ayuda">Revise y desmarque a los residentes que no desea notificar en este momento.</p>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <input
            className="form-control"
            style={{ flex: '1 1 200px' }}
            placeholder="Buscar residente o unidad..."
            value={filtroTextoModal}
            onChange={(e) => setFiltroTextoModal(e.target.value)}
          />
          <select
            className="form-control"
            style={{ flex: '0 0 180px' }}
            value={filtroTipoModal}
            onChange={(e) => setFiltroTipoModal(e.target.value)}
          >
            <option value="">Cualquier tipo</option>
            {tiposUnidad.map(t => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
          </select>
          <select
            className="form-control"
            style={{ flex: '0 0 180px' }}
            value={filtroTiempoModal}
            onChange={(e) => setFiltroTiempoModal(e.target.value)}
          >
            <option value="">Mostrar todos (Incluye al día)</option>
            <option value="vencidos">Solo avisos vencidos</option>
            <option value="30">Vencidos por más de 1 mes</option>
            <option value="60">Vencidos por más de 2 meses</option>
            <option value="90">Vencidos por más de 3 meses</option>
          </select>
        </div>

        <div style={{ marginBottom: '12px', paddingLeft: '8px' }}>
          <label className="checkbox-linea" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={todosSeleccionados}
              onChange={toggleTodos}
            />
            <strong>Seleccionar resultados filtrados ({deudoresFiltrados.length})</strong>
          </label>
        </div>

        <div className="tabla-scroll" style={{ maxHeight: '60vh', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          <table className="tabla tabla-compacta">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>✓</th>
                <th>Unidad</th>
                <th>Responsable</th>
                <th className="der">Deuda Real</th>
              </tr>
            </thead>
            <tbody>
              {deudoresFiltrados.map(d => (
                <tr key={d.id} className="fila-clicable" onClick={() => toggleSeleccion(d.id)}>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={seleccionados.includes(d.id)}
                      readOnly
                    />
                  </td>
                  <td>
                    <strong>{d.comercio ? d.comercio : d.code}</strong>
                    <small className="bloque" style={{color: 'var(--text-muted)'}}>{d.comercio ? d.code : d.tipo?.replace(/_/g, ' ')}</small>
                  </td>
                  <td>{d.responsables || '—'}</td>
                  <td className="der">
                    <strong>{fmtUSD(d.deuda)}</strong>
                    <small className="bloque">{d.avisos} aviso(s)</small>
                    {d.diasVencidoMax > 0 && <span className="badge badge-danger" style={{fontSize: '0.65rem', marginTop: '2px', padding: '2px 4px'}}>Vencido</span>}
                  </td>
                </tr>
              ))}
              {deudoresFiltrados.length === 0 && (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                    No se encontraron residentes con los filtros actuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="panel-acciones" style={{ marginTop: '20px' }}>
          <button type="button" className="btn btn-secundario" onClick={() => setPanelNotificar(false)}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={notificando || seleccionados.length === 0}
            onClick={ejecutarNotificacionMasiva}
          >
            {notificando ? 'Enviando...' : `Enviar recordatorios (${seleccionados.length})`}
          </button>
        </div>
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
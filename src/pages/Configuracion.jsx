import { useEffect, useState, useCallback } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmtUSD, fmtNumero, fmtFecha, fmtHoraLocal, hoy } from '../lib/formato'
import { Aviso, Cargador, SelectorImagen, Panel, IconoAyuda } from '../components/UI'
import CampoFecha from '../components/CampoFecha'
import { subirLogoCondominio } from '../lib/imagenes'

const ORIGEN = {
  'dolarapi-oficial': 'BCV automático',
  'dolarapi-lista': 'BCV automático (respaldo)',
  arrastre: 'Heredada del día anterior',
  manual: 'Manual',
  semilla_inicial: 'Manual',
  semilla_migracion: 'Manual',
}

export default function Configuracion() {
  const { perfil, condominio, recargarPerfil, esAdmin } = useAuth()

  const [form, setForm] = useState(null)
  const [tasa, setTasa] = useState({ rate_date: hoy(), rate_bcv: '' })
  const [tasaActual, setTasaActual] = useState(null)
  const [salud, setSalud] = useState(null)
  const [actualizando, setActualizando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  
  // Cambiamos null por undefined para detectar cuando el usuario presiona "Quitar" explícitamente
  const [logoArchivo, setLogoArchivo] = useState(undefined)
  
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [unidadesDirector, setUnidadesDirector] = useState([])
  
  // Estado para el almacenamiento
  const [usoStorage, setUsoStorage] = useState({ usado: 0, limite: 52428800 })

  // Estados para exportar
  const [panelExportar, setPanelExportar] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [errorExportar, setErrorExportar] = useState(null)
  const [formExportar, setFormExportar] = useState({
    modulo: 'todos',
    desde: '',
    hasta: hoy(),
    unidad: '',
    estado: 'todos'
  })

  // Estados para Reinicio del Sistema (Zona de Peligro)
  const [panelReset, setPanelReset] = useState(false)
  const [nivelReset, setNivelReset] = useState('financiero')
  const [textoConfirmacion, setTextoConfirmacion] = useState('')
  const [checkResponsabilidad, setCheckResponsabilidad] = useState(false)
  const [reseteando, setReseteando] = useState(false)

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
      auto_billing: Boolean(condominio.auto_billing),
      auto_billing_day: condominio.auto_billing_day ?? 1,
    })
  }, [condominio])

  const cargarGlobales = useCallback(async () => {
    if (!perfil?.condominium_id) return

    const [rT, rS, rU, rCondo] = await Promise.all([
      supabase
        .from('exchange_rates')
        .select('rate_date, rate_bcv, source, status')
        .order('rate_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.rpc('rate_health'),
      supabase.from('units').select('id, code').order('code'),
      supabase.from('condominiums').select('storage_used_bytes, storage_limit_bytes, subscription_status').eq('id', perfil.condominium_id).single()
    ])
    setTasaActual(rT.data)
    setSalud(rS.data)
    setUnidadesDirector(rU.data || [])
    
    if (rCondo.data) {
      setUsoStorage({
        usado: Number(rCondo.data.storage_used_bytes) || 0,
        limite: Number(rCondo.data.storage_limit_bytes) || 52428800,
        estado: rCondo.data.subscription_status
      })
    }
  }, [perfil?.condominium_id])

  useEffect(() => {
    cargarGlobales()
  }, [cargarGlobales])

  const actualizarDesdeBCV = async () => {
    setActualizando(true)
    setError(null)
    try {
      const resp = await supabase.functions.invoke('actualizar-tasa', {
        body: { origen: 'manual' },
      })

      if (resp.error) {
        let detalle = resp.error.message
        try {
          const cuerpo = await resp.error.context?.json?.()
          if (cuerpo?.error) {
            detalle = cuerpo.mensaje || cuerpo.error
          }
        } catch {
        }
        throw new Error(detalle)
      }
      if (resp.data?.error) throw new Error(resp.data.mensaje || resp.data.error)

      setAviso(`Tasa actualizada: ${resp.data.mensaje}`)
      cargarGlobales()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setActualizando(false)
    }
  }

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
      let logoUrl = condominio?.logo_url || null
      
      // Lógica actualizada para permitir el borrado explícito del logo
      if (logoArchivo !== undefined) {
        if (logoArchivo) {
          const res = await subirLogoCondominio(logoArchivo, perfil.condominium_id)
          logoUrl = res.url
        } else {
          logoUrl = null // El usuario presionó Quitar
        }
      }

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
          auto_billing: form.auto_billing,
          auto_billing_day: Number(form.auto_billing_day) || 1,
          logo_url: logoUrl,
        })
        .eq('id', perfil.condominium_id)

      if (err) throw err

      setAviso('Configuración guardada.')
      setLogoArchivo(undefined)
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

  const exportarExcel = async (e) => {
    e.preventDefault()
    setErrorExportar(null)
    setExportando(true)

    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()

      let queryPagos = supabase.from('payments').select('payment_date, amount, currency, amount_usd, reference, status, units(code)')
      let queryAvisos = supabase.from('invoices').select('invoice_number, issue_date, due_date, subtotal, status, notes, billing_periods(period), units(code)')
      let queryGastos = supabase.from('expenses').select('expense_date, description, amount, currency, amount_usd, supplier, expense_categories(name)')

      if (formExportar.desde) {
        queryPagos = queryPagos.gte('payment_date', formExportar.desde)
        queryAvisos = queryAvisos.gte('issue_date', formExportar.desde)
        queryGastos = queryGastos.gte('expense_date', formExportar.desde)
      }
      if (formExportar.hasta) {
        queryPagos = queryPagos.lte('payment_date', formExportar.hasta)
        queryAvisos = queryAvisos.lte('issue_date', formExportar.hasta)
        queryGastos = queryGastos.lte('expense_date', formExportar.hasta)
      }
      if (formExportar.unidad) {
        queryPagos = queryPagos.eq('unit_id', formExportar.unidad)
        queryAvisos = queryAvisos.eq('unit_id', formExportar.unidad)
      }

      if (formExportar.estado === 'procesados') {
        queryPagos = queryPagos.eq('status', 'confirmado')
        queryAvisos = queryAvisos.eq('status', 'pagado')
      } else if (formExportar.estado === 'pendientes') {
        queryPagos = queryPagos.eq('status', 'reportado')
        queryAvisos = queryAvisos.in('status', ['emitido', 'parcial'])
      }

      if (['todos', 'pagos'].includes(formExportar.modulo)) {
        const { data, error } = await queryPagos
        if (error) throw error
        const filas = data.map(p => ({
          'Fecha': p.payment_date,
          'Unidad': p.units?.code || '',
          'Referencia': p.reference || '',
          'Moneda': p.currency,
          'Monto Original': p.amount,
          'Monto (USD)': p.amount_usd,
          'Estado': p.status.toUpperCase()
        }))
        const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ Mensaje: "Sin datos registrados en este rango" }])
        XLSX.utils.book_append_sheet(wb, ws, 'Pagos')
      }

      if (['todos', 'cobranza'].includes(formExportar.modulo)) {
        const { data, error } = await queryAvisos
        if (error) throw error
        const filas = data.map(a => ({
          'Aviso N°': a.invoice_number,
          'Emisión': a.issue_date,
          'Vencimiento': a.due_date,
          'Unidad': a.units?.code || '',
          'Concepto': a.billing_periods?.period || a.notes || 'Cargo',
          'Monto (USD)': a.subtotal,
          'Estado': a.status.toUpperCase()
        }))
        const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ Mensaje: "Sin datos registrados en este rango" }])
        XLSX.utils.book_append_sheet(wb, ws, 'Cobranza')
      }

      if (['todos', 'gastos'].includes(formExportar.modulo) && !formExportar.unidad) {
        const { data, error } = await queryGastos
        if (error) throw error
        const filas = data.map(g => ({
          'Fecha': g.expense_date,
          'Concepto': g.description,
          'Categoría': g.expense_categories?.name || 'Sin categoría',
          'Proveedor': g.supplier || '—',
          'Moneda': g.currency,
          'Monto Original': g.amount,
          'Monto (USD)': g.amount_usd
        }))
        const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ Mensaje: "Sin datos registrados en este rango" }])
        XLSX.utils.book_append_sheet(wb, ws, 'Gastos')
      }

      XLSX.writeFile(wb, `Reporte_Condominio_${new Date().toISOString().slice(0,10)}.xlsx`)
      setAviso('Reporte Excel generado y descargado con éxito.')
      setPanelExportar(false)
    } catch (err) {
      setErrorExportar(mensajeError(err))
    } finally {
      setExportando(false)
    }
  }

  const ejecutarReinicio = async (e) => {
    e.preventDefault()
    setError(null)
    setReseteando(true)

    try {
      if (nivelReset === 'total' && condominio?.logo_url) {
        try {
          const urlParts = condominio.logo_url.split('/storage/v1/object/public/')
          if (urlParts.length === 2) {
            const pathCompleto = urlParts[1]
            const slashIndex = pathCompleto.indexOf('/')
            const bucket = pathCompleto.substring(0, slashIndex)
            const filePath = pathCompleto.substring(slashIndex + 1)
            await supabase.storage.from(bucket).remove([filePath])
          }
        } catch (e) {
          console.warn('Fallo silencioso: No se pudo localizar el archivo físico del logo.', e)
        }
      }

      const funcionBase = nivelReset === 'total' ? 'wipe_all_data' : 'wipe_financial_data'
      const { error: errSql } = await supabase.rpc(funcionBase, { p_condominium_id: perfil.condominium_id })
      
      if (errSql) throw errSql

      try {
        const { data: { session } } = await supabase.auth.getSession()
        await supabase.functions.invoke('auditoria-reset', {
          body: { 
            condominio: condominio.name, 
            admin: perfil.full_name,
            email: session.user.email,
            nivel: nivelReset,
            fecha: new Date().toISOString()
          },
          headers: { Authorization: `Bearer ${session.access_token}` }
        })
      } catch (emailErr) {
        console.warn('Auditoría falló, pero el reinicio local procedió.', emailErr)
      }

      setPanelReset(false)
      setTextoConfirmacion('')
      setCheckResponsabilidad(false)
      
      alert(nivelReset === 'total' ? 'Reinicio de Fábrica completado exitosamente.' : 'Reinicio Financiero completado exitosamente.')
      window.location.reload()

    } catch (err) {
      setError(mensajeError(err))
      setReseteando(false)
    }
  }

  const porcentajeUso = Math.min((usoStorage.usado / usoStorage.limite) * 100, 100)
  const colorBarra = porcentajeUso > 90 ? '#ef4444' : porcentajeUso > 75 ? '#f59e0b' : '#3b82f6'

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

      {/* ------------------------------------------------------ ESTADO DEL PLAN */}
      <div className="card" style={{ backgroundColor: '#f8fafc' }}>
        <h2 className="card-header" style={{ marginBottom: '10px' }}>
          Suscripción y Almacenamiento
          <IconoAyuda texto="Espacio en la nube utilizado por sus recibos, facturas y comprobantes de pago." />
        </h2>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 500 }}>
            Plan actual: <span style={{ color: 'var(--primary-color)' }}>{usoStorage.estado === 'prueba' ? 'Prueba Gratuita' : 'P&P Admin Pro'}</span>
          </span>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
            {((usoStorage.usado / 1024) / 1024).toFixed(2)} MB de {((usoStorage.limite / 1024) / 1024).toFixed(0)} MB
          </span>
        </div>

        <div style={{ width: '100%', height: '10px', backgroundColor: '#e2e8f0', borderRadius: '5px', overflow: 'hidden' }}>
          <div 
            style={{ 
              width: `${porcentajeUso}%`, 
              height: '100%', 
              backgroundColor: colorBarra, 
              transition: 'width 0.5s ease-in-out' 
            }} 
          />
        </div>

        {porcentajeUso > 85 && (
          <p style={{ marginTop: '12px', fontSize: '0.85rem', color: '#b91c1c', margin: '12px 0 0 0' }}>
            ⚠️ Su almacenamiento está casi lleno. Contacte a soporte técnico para ampliar la capacidad de su cuenta.
          </p>
        )}
      </div>

      {/* ------------------------------------------------------ tasa BCV */}
      <div className="card">
        <div className="card-header-flex">
          <h2>
            Tasa de cambio
            <IconoAyuda texto="El sistema consulta la tasa oficial diariamente, pero usted puede registrar tasas manuales si necesita cobrar pagos de fechas anteriores." />
          </h2>
          <button
            className="btn btn-primary btn-accion"
            onClick={actualizarDesdeBCV}
            disabled={actualizando}
          >
            {actualizando ? 'Consultando…' : 'Actualizar desde BCV'}
          </button>
        </div>

        {salud?.obsoleta && salud?.tasa && (
          <Aviso tipo="aviso">
            La última tasa es del {fmtFecha(salud.fecha)}, hace {salud.dias_antiguedad} días.
            Los cobros en bolívares pueden calcularse con un valor desactualizado.
          </Aviso>
        )}

        {tasaActual && (
          <div className="fila-resumen" style={{ marginBottom: 18 }}>
            <div>
              <small>Tasa vigente</small>
              <strong>Bs. {fmtNumero(tasaActual.rate_bcv)}</strong>
            </div>
            <div>
              <small>Fecha</small>
              <strong className={salud?.es_de_hoy ? 'texto-exito' : ''}>
                {fmtFecha(tasaActual.rate_date)}
                {salud?.es_de_hoy && ' · hoy'}
              </strong>
            </div>
            <div>
              <small>Origen</small>
              <strong>{ORIGEN[tasaActual.source] || tasaActual.source || 'Manual'}</strong>
            </div>
            {salud?.actualizada && (
              <div>
                <small>Última consulta</small>
                <strong>{fmtHoraLocal(salud.actualizada)}</strong>
              </div>
            )}
          </div>
        )}

        <h4 className="subtitulo">Registrar tasa manualmente</h4>

        <form onSubmit={guardarTasa}>
          <div className="grid-form">
            <div className="form-group">
              <label>Fecha</label>
              <CampoFecha
                className="form-control"
                value={tasa.rate_date}
                onChange={(v) => setTasa({ ...tasa, rate_date: v })}
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
          <button className="btn btn-secundario btn-accion" disabled={guardando}>
            Registrar tasa
          </button>
        </form>
      </div>

      <form onSubmit={guardar}>
        {/* -------------------------------------------------- facturación */}
        <div className="card">
          <h2 className="card-header">Cobro de cuotas</h2>

          <div className="form-group">
            <label>Logo del condominio</label>
            <SelectorImagen
              valorActual={condominio?.logo_url}
              onSeleccion={setLogoArchivo}
              ayuda="Aparece en los avisos, recibos y reportes en PDF."
            />
          </div>

          <div className="form-group">
            <label>Nombre de la empresa o condominio</label>
            <input
              className="form-control"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="grid-form">
            <div className="form-group">
              <label>
                Modo predeterminado
                <IconoAyuda texto="Define cómo se calcula el recibo base. 'Fija' cobra un monto igual a todos. 'Alícuota' reparte un presupuesto mensual según el % de la unidad." />
              </label>
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
              <label>
                Cuota base (USD)
                <IconoAyuda texto="Monto que aplica a todas las unidades por igual. Puede personalizar el monto de cada unidad en la pestaña 'Unidades'." />
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                value={form.default_fee}
                onChange={(e) => setForm({ ...form, default_fee: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>
                Día de vencimiento
                <IconoAyuda texto="Día tope del mes para pagar. Después de esta fecha, el sistema considerará la deuda en mora." />
              </label>
              <input
                type="number"
                min="1"
                max="28"
                className="form-control"
                value={form.due_day}
                onChange={(e) => setForm({ ...form, due_day: e.target.value })}
              />
            </div>
          </div>

          <div className="separador" />

          <label className="opcion-bloque">
            <input
              type="checkbox"
              checked={form.auto_billing}
              onChange={(e) => setForm({ ...form, auto_billing: e.target.checked })}
            />
            <div>
              <strong>
                Emitir las cuotas automáticamente
                <IconoAyuda texto="El sistema generará todos los avisos del mes a las 00:00 del día configurado, sin necesidad de intervención manual." />
              </strong>
            </div>
          </label>

          {form.auto_billing && (
            <div className="form-group" style={{ marginTop: 16 }}>
              <label>
                Día de emisión
                <IconoAyuda texto="Día en el que se envían los recibos de cobro. Debe ser anterior al día de vencimiento (hoy configurado el día 5)." />
              </label>
              <input
                type="number"
                min="1"
                max="28"
                className="form-control"
                style={{ maxWidth: 160 }}
                value={form.auto_billing_day}
                onChange={(e) => setForm({ ...form, auto_billing_day: e.target.value })}
              />
            </div>
          )}

          <div className="separador" />

          <div className="form-group">
            <label>
              Nota al pie de los avisos
              <IconoAyuda texto="Úselo para colocar números de cuenta bancaria, datos de pago móvil u horarios de oficina." />
            </label>
            <textarea
              className="form-control"
              rows={2}
              value={form.invoice_notes}
              onChange={(e) => setForm({ ...form, invoice_notes: e.target.value })}
              placeholder="Datos bancarios, instrucciones de pago…"
            />
          </div>
        </div>

        {/* ------------------------------------------------------ exportar a excel */}
        <div className="card">
          <div className="card-header-flex">
            <h2>Respaldo y Reportes</h2>
            <button
              type="button"
              className="btn btn-secundario btn-accion"
              onClick={() => setPanelExportar(true)}
            >
              Descargar Excel
            </button>
          </div>
          <p className="texto-ayuda">
            Exporte la información de cobranza, pagos y gastos a Microsoft Excel para procesos contables externos o auditorías.
          </p>
        </div>

        {/* --------------------------------------------------------- mora */}
        <div className="card">
          <h2 className="card-header">
            Recargo por mora
            <IconoAyuda texto="Activar el recargo no suma la mora automáticamente. Le habilitará un botón al administrador en 'Cobranza' para aplicarla manualmente a los deudores cuando lo decida." />
          </h2>

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
                  <label>
                    Días de gracia
                    <IconoAyuda texto="Margen de tolerancia después de la fecha de vencimiento antes de permitir el recargo." />
                  </label>
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
              <strong>
                Cuentas abiertas a todos
                <IconoAyuda texto="Al activar esto, los residentes podrán ver las gráficas de Tesorería, cuentas bancarias y gastos. Los usuarios 'restringidos' no verán nada, independientemente de esta opción." />
              </strong>
            </div>
          </label>

          <div className="form-group" style={{ marginTop: 22 }}>
            <label>
              Visibilidad de la morosidad
              <IconoAyuda texto="Decide qué ven los vecinos. 'Agregada' solo muestra el monto total global que le deben al edificio. 'Detallada' publica la lista completa con código y monto individual." />
            </label>
            <select
              className="form-control"
              value={form.delinquency_visibility}
              onChange={(e) => setForm({ ...form, delinquency_visibility: e.target.value })}
            >
              <option value="oculto">Oculta · solo el administrador</option>
              <option value="agregado">Agregada · totales sin identificar unidades</option>
              <option value="detallado">Detallada · todos ven quién debe y cuánto</option>
            </select>
          </div>
        </div>

        <button className="btn btn-primary" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar configuración'}
        </button>
      </form>

      {/* ------------------------------------------------- ZONA DE PELIGRO */}
      {esAdmin && (
        <div className="card" style={{ marginTop: 40, border: '1px solid #ef4444' }}>
          <h2 className="card-header" style={{ color: '#ef4444' }}>Zona de Peligro</h2>
          <p className="texto-ayuda">
            Opciones avanzadas y destructivas del sistema. Las acciones realizadas aquí son irreversibles.
          </p>
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn"
              style={{ backgroundColor: '#ef4444', color: 'white', borderColor: '#ef4444' }}
              onClick={() => {
                setNivelReset('financiero')
                setTextoConfirmacion('')
                setCheckResponsabilidad(false)
                setPanelReset(true)
              }}
            >
              Reinicio del Sistema
            </button>
          </div>
        </div>
      )}

      {/* Panel para Exportar */}
      <Panel
        abierto={panelExportar}
        titulo="Exportar a Excel"
        onCerrar={() => setPanelExportar(false)}
        ancho={500}
      >
        <form onSubmit={exportarExcel}>
          {errorExportar && (
            <Aviso tipo="error" onCerrar={() => setErrorExportar(null)}>
              {errorExportar}
            </Aviso>
          )}

          <div className="form-group">
            <label>Módulo a exportar</label>
            <select
              className="form-control"
              value={formExportar.modulo}
              onChange={(e) => setFormExportar({ ...formExportar, modulo: e.target.value })}
            >
              <option value="todos">Todo el sistema</option>
              <option value="pagos">Solo Pagos (Ingresos)</option>
              <option value="cobranza">Solo Cobranza (Avisos)</option>
              <option value="gastos">Solo Gastos (Egresos)</option>
            </select>
          </div>

          <div className="grid-form">
            <div className="form-group">
              <label>Desde (opcional)</label>
              <CampoFecha
                className="form-control"
                value={formExportar.desde}
                onChange={(v) => setFormExportar({ ...formExportar, desde: v })}
              />
            </div>
            <div className="form-group">
              <label>Hasta (opcional)</label>
              <CampoFecha
                className="form-control"
                value={formExportar.hasta}
                onChange={(v) => setFormExportar({ ...formExportar, hasta: v })}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Unidad (opcional)</label>
            <select
              className="form-control"
              value={formExportar.unidad}
              onChange={(e) => setFormExportar({ ...formExportar, unidad: e.target.value })}
              disabled={formExportar.modulo === 'gastos'}
            >
              <option value="">Todas las unidades</option>
              {unidadesDirector.map((u) => (
                <option key={u.id} value={u.id}>{u.code}</option>
              ))}
            </select>
            {formExportar.modulo === 'gastos' && <small className="texto-ayuda">Los gastos no se asocian a unidades específicas.</small>}
          </div>

          <div className="form-group">
            <label>Estado</label>
            <select
              className="form-control"
              value={formExportar.estado}
              onChange={(e) => setFormExportar({ ...formExportar, estado: e.target.value })}
              disabled={formExportar.modulo === 'gastos'}
            >
              <option value="todos">Todos los registros</option>
              <option value="procesados">Solo Procesados (Confirmados / Pagados)</option>
              <option value="pendientes">Solo Pendientes (Reportados / Por cobrar)</option>
            </select>
          </div>

          <div className="panel-acciones">
            <button
              type="button"
              className="btn btn-secundario"
              onClick={() => setPanelExportar(false)}
            >
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={exportando}>
              {exportando ? 'Generando archivo…' : 'Descargar Excel'}
            </button>
          </div>
        </form>
      </Panel>

      {/* Panel para Reinicio del Sistema */}
      <Panel abierto={panelReset} titulo="Reinicio del Sistema" onCerrar={() => setPanelReset(false)} ancho={550}>
        <form onSubmit={ejecutarReinicio}>
          
          <div className="form-group">
            <label>Nivel de borrado</label>
            <select 
              className="form-control" 
              value={nivelReset} 
              onChange={(e) => setNivelReset(e.target.value)}
              style={{ borderColor: '#ef4444', borderWidth: 2 }}
            >
              <option value="financiero">Nivel 1: Borrar solo información financiera (Recibos, pagos, gastos)</option>
              <option value="total">Nivel 2: Reinicio de Fábrica (Borrar finanzas, unidades y resetear configuración)</option>
            </select>
          </div>

          <div className="alerta" style={{ backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #f87171' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>⚠️ Acción irreversible</h4>
            {nivelReset === 'financiero' ? (
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                Esto eliminará <strong>todos los recibos, pagos, comprobantes y gastos</strong> del historial contable.<br/><br/>
                Tus apartamentos y perfiles de usuarios quedarán intactos. Ideal para limpiar pruebas y arrancar en producción.
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                Esto destruirá <strong>toda la información de la base de datos</strong> (Finanzas, apartamentos y relaciones de usuarios), eliminará el logo y devolverá la configuración a sus valores por defecto.<br/><br/>
                Solo mantendrá tu acceso como administrador principal.
              </p>
            )}
          </div>

          <label className="opcion-bloque" style={{ marginTop: 20 }}>
            <input
              type="checkbox"
              checked={checkResponsabilidad}
              onChange={(e) => setCheckResponsabilidad(e.target.checked)}
            />
            <div>
              <strong style={{ color: '#b91c1c' }}>Descargo de responsabilidad civil</strong>
              <small>Entiendo que P&P Soluciones no puede recuperar esta información y asumo la total responsabilidad de la pérdida de los registros actuales.</small>
            </div>
          </label>

          <div className="form-group" style={{ marginTop: 20 }}>
            <label>
              Para confirmar, escriba el nombre de la empresa: <strong>{condominio?.name}</strong>
            </label>
            <input
              type="text"
              className="form-control"
              value={textoConfirmacion}
              onChange={(e) => setTextoConfirmacion(e.target.value)}
              placeholder={condominio?.name}
              disabled={!checkResponsabilidad}
            />
          </div>

          <div className="panel-acciones">
            <button type="button" className="btn btn-secundario" onClick={() => setPanelReset(false)}>
              Cancelar
            </button>
            <button 
              className="btn" 
              style={{ backgroundColor: '#ef4444', color: 'white', borderColor: '#ef4444', opacity: (textoConfirmacion !== condominio?.name || !checkResponsabilidad) ? 0.5 : 1 }}
              disabled={textoConfirmacion !== condominio?.name || !checkResponsabilidad || reseteando}
            >
              {reseteando ? 'Eliminando datos...' : 'Confirmar y Reiniciar'}
            </button>
          </div>
        </form>
      </Panel>
    </>
  )
}
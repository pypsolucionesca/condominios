import { useEffect, useState, useCallback } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmtUSD, fmtNumero, fmtFecha, fmtHoraLocal, hoy } from '../lib/formato'
import { Aviso, Cargador, SelectorImagen, Panel } from '../components/UI'
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
  const { perfil, condominio, recargarPerfil } = useAuth()

  const [form, setForm] = useState(null)
  const [tasa, setTasa] = useState({ rate_date: hoy(), rate_bcv: '' })
  const [tasaActual, setTasaActual] = useState(null)
  const [salud, setSalud] = useState(null)
  const [actualizando, setActualizando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [logoArchivo, setLogoArchivo] = useState(null)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [unidadesDirector, setUnidadesDirector] = useState([])

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
    const [rT, rS, rU] = await Promise.all([
      supabase
        .from('exchange_rates')
        .select('rate_date, rate_bcv, source, status')
        .order('rate_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.rpc('rate_health'),
      supabase.from('units').select('id, code').order('code')
    ])
    setTasaActual(rT.data)
    setSalud(rS.data)
    setUnidadesDirector(rU.data || [])
  }, [])

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
      if (logoArchivo) {
        const res = await subirLogoCondominio(logoArchivo, perfil.condominium_id)
        logoUrl = res.url
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
      setLogoArchivo(null)
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

      {/* ------------------------------------------------------ exportar a excel */}
      <div className="card">
        <div className="card-header-flex">
          <h2>Respaldo y Reportes</h2>
          <button
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

      {/* ------------------------------------------------------ tasa BCV */}
      <div className="card">
        <div className="card-header-flex">
          <h2>Tasa de cambio</h2>
          <button
            className="btn btn-primary btn-accion"
            onClick={actualizarDesdeBCV}
            disabled={actualizando}
          >
            {actualizando ? 'Consultando…' : 'Actualizar desde BCV'}
          </button>
        </div>

        <p className="texto-ayuda">
          Cada aviso, pago y gasto guarda la tasa del día en que se registró, de modo que los
          documentos históricos siempre pueden reconstruirse.
        </p>

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
              ayuda="Logo para avisos y recibos"
            />
            <small className="texto-ayuda">
              Aparece en los avisos, recibos y reportes en PDF. Es el logo de su condominio
              (distinto de la marca de la aplicación).
            </small>
          </div>

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

          <div className="separador" />

          <label className="opcion-bloque">
            <input
              type="checkbox"
              checked={form.auto_billing}
              onChange={(e) => setForm({ ...form, auto_billing: e.target.checked })}
            />
            <div>
              <strong>Emitir las cuotas automáticamente</strong>
              <small>
                El sistema generará los avisos del mes sin intervención. Recibirá una
                notificación al hacerlo, y nunca duplica un período ya emitido.
              </small>
            </div>
          </label>

          {form.auto_billing && (
            <div className="form-group" style={{ marginTop: 16 }}>
              <label>Día de emisión</label>
              <input
                type="number"
                min="1"
                max="28"
                className="form-control"
                style={{ maxWidth: 160 }}
                value={form.auto_billing_day}
                onChange={(e) => setForm({ ...form, auto_billing_day: e.target.value })}
              />
              <small className="texto-ayuda">
                Día del mes en que se emiten los avisos. Debe ser anterior al vencimiento
                (hoy configurado el día {form.due_day}).
              </small>
            </div>
          )}

          <div className="separador" />

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
                Los residentes (no los restringidos) pueden ver los gastos del condominio, los
                saldos de banco y caja, y los pagos al personal. La escritura sigue siendo
                exclusiva del administrador.
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
              La opción detallada expone datos individuales (visibles para los residentes no
              restringidos). Conviene que sea una decisión de asamblea, no del administrador
              por su cuenta.
            </small>
          </div>
        </div>

        <button className="btn btn-primary" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar configuración'}
        </button>
      </form>

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
    </>
  )
}
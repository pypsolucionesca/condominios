import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Sidebar from './components/Sidebar'
import './styles/global.css'

// --- HOOK DE TASA BCV ---
function useExchangeRate() {
  const [rate, setRate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const loadRate = async () => {
    try {
      const { data, error } = await supabase
        .from('exchange_rates')
        .select('*')
        .order('rate_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      setRate(data || { rate_bcv: 36.50, rate_date: new Date().toISOString() })
      setError(null)
    } catch (err) {
      console.error('Error loading rate:', err)
      setError(err.message || 'Error al cargar tasa')
      setRate({ rate_bcv: 36.50, rate_date: new Date().toISOString() })
    }
    setLoading(false)
  }

  const saveManualRate = async (rateBcv) => {
    setRefreshing(true)
    try {
      const bcvNum = parseFloat(rateBcv)
      if (isNaN(bcvNum) || bcvNum <= 0) throw new Error('Tasa inválida')

      const { error } = await supabase.from('exchange_rates').insert([{
        rate_bcv: bcvNum,
        rate_date: new Date().toISOString()
      }])
      if (error) throw error
      await loadRate()
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => { loadRate() }, [])
  return { rate, loading, refreshing, error, saveManualRate, reloadRate: loadRate }
}

// --- UTILIDAD DE FECHA VENEZUELA ---
const formatearFechaVE = (fechaISO) => {
  if (!fechaISO) return '--/--/----';
  try {
    const d = new Date(fechaISO);
    return d.toLocaleString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).toUpperCase(); 
  } catch (error) {
    return fechaISO;
  }
};

function App() {
  const [vista, setVista] = useState('cuentas')
  const { rate, saveManualRate } = useExchangeRate()

  const [propietarios, setPropietarios] = useState([])
  const [formPropietario, setFormPropietario] = useState({ nombre_completo: '', identificacion: '', identificador_unidad: '' })
  
  const [cuentas, setCuentas] = useState([])
  const [formCuenta, setFormCuenta] = useState({ nombre_cuenta: '', tipo_cuenta: 'Caja', saldo_actual: 0, moneda: 'USD' })
  
  const [deudas, setDeudas] = useState([])
  const [formDeuda, setFormDeuda] = useState({ propietario_id: '', mes_facturacion: '', monto_cobrado: '' })
  
  const [pagos, setPagos] = useState([])
  const [formPago, setFormPago] = useState({ deuda_id: '', cuenta_ingreso_id: '', monto_pagado: '', referencia: '', fecha_pago: '' })
  
  const [gastos, setGastos] = useState([])
  const [formGasto, setFormGasto] = useState({ cuenta_origen_id: '', concepto: '', monto: '', fecha_gasto: '' })

  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [showModalTasa, setShowModalTasa] = useState(false)
  const [tasaInput, setTasaInput] = useState('')

  useEffect(() => {
    cargarPropietarios(); cargarCuentas(); cargarDeudas(); cargarPagos(); cargarGastos();
    
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
    setIsStandalone(standalone)
    const userAgent = window.navigator.userAgent.toLowerCase()
    setIsIOS(/iphone|ipad|ipod/.test(userAgent))

    const handleBeforeInstallPrompt = (e) => { e.preventDefault(); setDeferredPrompt(e); }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  const instalarApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') setDeferredPrompt(null)
    }
  }

  const cargarPropietarios = async () => { const { data } = await supabase.from('propietarios').select('*').order('created_at', { ascending: false }); if (data) setPropietarios(data); }
  const guardarPropietario = async (e) => {
    e.preventDefault(); const { error } = await supabase.from('propietarios').insert([formPropietario]);
    if (!error) { alert('Registrado.'); setFormPropietario({ nombre_completo: '', identificacion: '', identificador_unidad: '' }); cargarPropietarios(); }
  }
  
  const cargarCuentas = async () => { const { data } = await supabase.from('cuentas').select('*').order('created_at', { ascending: false }); if (data) setCuentas(data); }
  const guardarCuenta = async (e) => {
    e.preventDefault(); 
    const { error } = await supabase.from('cuentas').insert([{ 
      nombre_cuenta: formCuenta.nombre_cuenta, 
      tipo_cuenta: formCuenta.tipo_cuenta, 
      saldo_actual: parseFloat(formCuenta.saldo_actual),
      moneda: formCuenta.moneda 
    }]);
    if (!error) { alert('Cuenta Registrada.'); setFormCuenta({ nombre_cuenta: '', tipo_cuenta: 'Caja', saldo_actual: 0, moneda: 'USD' }); cargarCuentas(); }
    else alert('Error al registrar cuenta.');
  }
  
  const cargarDeudas = async () => { const { data } = await supabase.from('deudas_mensuales').select('*').order('created_at', { ascending: false }); if (data) setDeudas(data); }
  const guardarDeuda = async (e) => {
    e.preventDefault(); const { error } = await supabase.from('deudas_mensuales').insert([{ ...formDeuda, monto_cobrado: parseFloat(formDeuda.monto_cobrado), estado: 'Pendiente' }]);
    if (!error) { alert('Factura emitida.'); setFormDeuda({ ...formDeuda, monto_cobrado: '', propietario_id: '' }); cargarDeudas(); }
  }
  
  const cargarPagos = async () => { const { data } = await supabase.from('pagos_recibidos').select('*').order('created_at', { ascending: false }); if (data) setPagos(data); }
  const guardarPago = async (e) => {
    e.preventDefault();
    if (!formPago.deuda_id || !formPago.cuenta_ingreso_id) return alert('Faltan datos clave.');
    
    const cuentaDestino = cuentas.find(c => c.id === formPago.cuenta_ingreso_id); 
    const montoIngresado = parseFloat(formPago.monto_pagado);

    const { error: errPago } = await supabase.from('pagos_recibidos').insert([{ 
      deuda_id: formPago.deuda_id, 
      cuenta_ingreso_id: formPago.cuenta_ingreso_id, 
      monto_pagado: montoIngresado, 
      referencia: formPago.referencia, 
      fecha_pago: formPago.fecha_pago 
    }]);

    if (errPago) return alert('Error al registrar pago.');
    
    await supabase.from('deudas_mensuales').update({ estado: 'Pagada' }).eq('id', formPago.deuda_id);
    await supabase.from('cuentas').update({ saldo_actual: cuentaDestino.saldo_actual + montoIngresado }).eq('id', formPago.cuenta_ingreso_id);
    
    alert('Pago registrado y saldos actualizados con éxito.');
    setFormPago({ deuda_id: '', cuenta_ingreso_id: '', monto_pagado: '', referencia: '', fecha_pago: '' });
    cargarPagos(); cargarDeudas(); cargarCuentas();
  }
  
  const cargarGastos = async () => { const { data } = await supabase.from('gastos_operativos').select('*').order('created_at', { ascending: false }); if (data) setGastos(data); }
  const guardarGasto = async (e) => {
    e.preventDefault();
    if (!formGasto.cuenta_origen_id) return alert('Selecciona cuenta.');
    const cuentaOrigen = cuentas.find(c => c.id === formGasto.cuenta_origen_id); const montoGasto = parseFloat(formGasto.monto);
    if (cuentaOrigen.saldo_actual < montoGasto) return alert('Fondos insuficientes.');
    const { error: errGasto } = await supabase.from('gastos_operativos').insert([{ cuenta_origen_id: formGasto.cuenta_origen_id, concepto: formGasto.concepto, monto: montoGasto, fecha_gasto: formGasto.fecha_gasto }]);
    if (errGasto) return alert('Error.');
    await supabase.from('cuentas').update({ saldo_actual: cuentaOrigen.saldo_actual - montoGasto }).eq('id', formGasto.cuenta_origen_id);
    alert('Gasto registrado.'); setFormGasto({ cuenta_origen_id: '', concepto: '', monto: '', fecha_gasto: '' });
    cargarGastos(); cargarCuentas();
  }

  const buscarLocal = (id) => { const prop = propietarios.find(p => p.id === id); return prop ? `${prop.identificador_unidad} (${prop.nombre_completo})` : 'Desconocido'; }
  const buscarCuenta = (id) => { const cuenta = cuentas.find(c => c.id === id); return cuenta ? `${cuenta.nombre_cuenta} (${cuenta.moneda || 'USD'})` : 'Desconocida'; }
  const renderMoneda = (moneda) => moneda === 'Bs' ? 'Bs.' : '$';

  const actualizarTasaManual = async () => {
    const res = await saveManualRate(tasaInput)
    if (res.success) {
      alert('Tasa BCV actualizada exitosamente.')
      setShowModalTasa(false)
      setTasaInput('')
    } else {
      alert('Error al actualizar tasa: ' + res.error)
    }
  }

  return (
    <div className="app-container">
      <style>{`
        /* ========================================================
           APLASTAR ESTILOS DE VITE QUE ROMPEN LA RESPONSIVIDAD
           ======================================================== */
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: 100vw !important;
          overflow-x: hidden !important;
          background-color: var(--bg-main);
        }
        #root {
          max-width: 100% !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          text-align: left !important;
        }

        /* ========================================================
           CONTENEDORES PRINCIPALES
           ======================================================== */
        .app-container { 
          display: flex; 
          flex-direction: row; 
          min-height: 100vh; 
          width: 100%; 
        }
        
        .main-content { 
          flex: 1; 
          margin-left: 280px; 
          padding: 30px; 
          display: flex; 
          flex-direction: column; 
          align-items: center; 
          min-width: 0; 
          box-sizing: border-box;
        }
        
        .content-wrapper { 
          width: 100%; 
          /* ELIMINADO: max-width: 1100px; -> Ahora ocupa el 100% del espacio disponible */
          display: flex; 
          flex-direction: column; 
          min-width: 0;
        }

        /* ========================================================
           GRID PARA FORMULARIOS (APROVECHAR ESPACIO EN PC)
           ======================================================== */
        .grid-form {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
          width: 100%;
        }
        .grid-form .form-group {
          margin-bottom: 0;
        }
        .mt-4 { margin-top: 25px; }

        /* ========================================================
           COMPONENTES INTERNOS
           ======================================================== */
        .tasa-banner { 
          width: 100%; 
          background: #ffffff; 
          border: 1px solid #e2e8f0; 
          border-radius: 12px; 
          padding: 15px 20px; 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          margin-bottom: 25px; 
          box-shadow: 0 4px 6px rgba(0,0,0,0.02); 
          gap: 15px; 
          box-sizing: border-box;
        }
        .tasa-info { display: flex; gap: 30px; align-items: center; flex-wrap: wrap; }
        .tasa-item span { color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; display: block; font-weight: 700; }
        .tasa-item strong { color: var(--text-main); font-size: 1.1rem; }
        .btn-tasa { background: var(--primary); color: white; border: none; padding: 8px 16px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; font-weight: 600; white-space: nowrap; transition: opacity 0.2s; }
        .btn-tasa:hover { opacity: 0.9; }

        .install-banner { width: 100%; background: var(--primary); color: white; padding: 15px 20px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; gap: 10px; flex-wrap: wrap; box-sizing: border-box; }
        .install-banner button { background: white; color: var(--primary); border: none; padding: 8px 16px; border-radius: 5px; font-weight: bold; cursor: pointer; white-space: nowrap; }
        
        .card { background: var(--card-bg); padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); margin-bottom: 30px; border: 1px solid #e2e8f0; width: 100%; box-sizing: border-box; }
        .card-header { font-size: 1.4rem; color: var(--text-main); margin-bottom: 25px; border-bottom: 2px solid var(--bg-main); padding-bottom: 15px; word-wrap: break-word; }
        
        .form-group { margin-bottom: 22px; display: flex; flex-direction: column; gap: 8px; width: 100%; }
        .form-group label { font-size: 0.85rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; word-wrap: break-word; }
        .form-control { padding: 12px 15px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 1rem; transition: all 0.2s; background-color: #f8fafc; width: 100%; box-sizing: border-box; }
        .form-control:focus { outline: none; border-color: var(--sidebar-active); box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.15); background-color: var(--card-bg); }
        
        .btn { padding: 14px 20px; border: none; border-radius: 8px; color: white; font-size: 1rem; cursor: pointer; font-weight: 600; width: 100%; box-sizing: border-box; }
        .btn-primary { background: var(--primary); }
        .btn-success { background: var(--success); }
        .btn-danger { background: var(--danger); }
        .btn-warning { background: var(--warning); }
        
        .list-group { list-style: none; width: 100%; padding: 0; margin: 0; }
        .list-item { padding: 18px 0; border-bottom: 1px solid var(--bg-main); display: flex; justify-content: space-between; align-items: center; gap: 15px; flex-wrap: wrap; width: 100%; box-sizing: border-box; }
        .list-item:last-child { border-bottom: none; }
        .list-item div { min-width: 0; flex: 1; }
        .list-item strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        
        .badge { padding: 6px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; white-space: nowrap; display: inline-block; }
        .badge-pendiente { background: #fef08a; color: #854d0e; }
        .badge-pagada { background: #bbf7d0; color: #166534; }

        /* ========================================================
           MEDIA QUERIES - MODO TELÉFONO ESTRICTO
           ======================================================== */
        @media (max-width: 768px) {
          .app-container { flex-direction: column; }
          .main-content { 
            margin-left: 0; 
            padding: 15px; 
            width: 100%; 
          }
          .card { padding: 20px; }
          .tasa-banner { 
            flex-direction: column; 
            align-items: flex-start; 
            gap: 15px; 
          }
          .tasa-info { 
            flex-direction: column; 
            align-items: flex-start; 
            gap: 10px; 
            width: 100%; 
          }
          .btn-tasa { width: 100%; text-align: center; }
          .list-item { flex-direction: column; align-items: flex-start; gap: 5px; }
          .list-item > div:last-child { text-align: left !important; width: 100%; }
        }
      `}</style>

      <Sidebar vista={vista} setVista={setVista} />

      <main className="main-content">
        <div className="content-wrapper">
          
          {/* VISOR DE TASA OFICIAL - FECHA FORMATEADA */}
          <div className="tasa-banner">
            <div className="tasa-info">
              <div className="tasa-item">
                <span>Tasa BCV (Dólar)</span>
                <strong>{rate ? `Bs. ${Number(rate.rate_bcv).toFixed(2)}` : 'Cargando...'}</strong>
              </div>
              <div className="tasa-item">
                <span>Fecha Valor</span>
                <strong>{rate ? formatearFechaVE(rate.rate_date) : '--/--/----'}</strong>
              </div>
            </div>
            <button className="btn-tasa" onClick={() => setShowModalTasa(true)}>Actualizar Tasa</button>
          </div>

          {showModalTasa && (
            <div className="card" style={{ padding: '20px', marginBottom: '20px', backgroundColor: '#fffbeb' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '10px' }}>Ingresar Nueva Tasa BCV Oficial</h3>
              <div className="form-group" style={{ marginTop: '10px' }}>
                <input type="number" step="0.01" className="form-control" placeholder="Ej: 36.50" value={tasaInput} onChange={(e) => setTasaInput(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button className="btn btn-success" onClick={actualizarTasaManual} style={{ flex: 1, margin: 0 }}>Guardar Tasa</button>
                <button className="btn btn-danger" onClick={() => setShowModalTasa(false)} style={{ flex: 1, margin: 0 }}>Cancelar</button>
              </div>
            </div>
          )}

          {!isStandalone && (
            deferredPrompt ? (
              <div className="install-banner">
                <span>💻 Instala esta aplicación para acceso rápido.</span>
                <button onClick={instalarApp}>Instalar App</button>
              </div>
            ) : isIOS ? (
              <div className="install-banner" style={{ background: '#334155' }}>
                <span>🍏 En iPhone: Toca "Compartir" y luego "Agregar a inicio".</span>
              </div>
            ) : null
          )}

          {/* VISTA PROPIETARIOS CON GRID CSS */}
          {vista === 'propietarios' && (
            <div className="card">
              <h2 className="card-header">Registro de Nuevo Local</h2>
              <form onSubmit={guardarPropietario}>
                <div className="grid-form">
                  <div className="form-group"><label>Nombre Completo</label><input type="text" className="form-control" name="nombre_completo" value={formPropietario.nombre_completo} onChange={(e) => setFormPropietario({ ...formPropietario, [e.target.name]: e.target.value })} required /></div>
                  <div className="form-group"><label>Cédula o RIF</label><input type="text" className="form-control" name="identificacion" value={formPropietario.identificacion} onChange={(e) => setFormPropietario({ ...formPropietario, [e.target.name]: e.target.value })} required /></div>
                  <div className="form-group"><label>Identificador de Unidad</label><input type="text" className="form-control" name="identificador_unidad" value={formPropietario.identificador_unidad} onChange={(e) => setFormPropietario({ ...formPropietario, [e.target.name]: e.target.value })} required /></div>
                </div>
                <button type="submit" className="btn btn-primary mt-4">Guardar Propietario</button>
              </form>
              <h3 className="card-header" style={{ marginTop: '40px' }}>Directorio Activo</h3>
              <ul className="list-group">
                {propietarios.map(prop => (
                  <li key={prop.id} className="list-item"><div><strong>{prop.nombre_completo}</strong><span className="text-muted" style={{ display: 'block', marginTop: '4px' }}>ID: {prop.identificacion}</span></div><strong>{prop.identificador_unidad}</strong></li>
                ))}
              </ul>
            </div>
          )}

          {/* VISTA CUENTAS CON GRID CSS */}
          {vista === 'cuentas' && (
            <div className="card">
              <h2 className="card-header">Apertura de Cuenta Institucional</h2>
              <form onSubmit={guardarCuenta}>
                <div className="grid-form">
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Nombre de la Cuenta (Ej: Banesco Bs, Caja Chica Dólares)</label>
                    <input type="text" className="form-control" name="nombre_cuenta" value={formCuenta.nombre_cuenta} onChange={(e) => setFormCuenta({ ...formCuenta, [e.target.name]: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Tipo de Instrumento</label>
                    <select className="form-control" name="tipo_cuenta" value={formCuenta.tipo_cuenta} onChange={(e) => setFormCuenta({ ...formCuenta, [e.target.name]: e.target.value })}>
                      <option value="Caja">Caja Chica (Efectivo)</option>
                      <option value="Banco">Cuenta Bancaria</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Moneda Operativa</label>
                    <select className="form-control" name="moneda" value={formCuenta.moneda} onChange={(e) => setFormCuenta({ ...formCuenta, [e.target.name]: e.target.value })}>
                      <option value="USD">Dólares (USD)</option>
                      <option value="Bs">Bolívares (Bs)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Saldo Inicial</label>
                    <input type="number" className="form-control" name="saldo_actual" step="0.01" value={formCuenta.saldo_actual} onChange={(e) => setFormCuenta({ ...formCuenta, [e.target.name]: e.target.value })} required />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary mt-4">Registrar Cuenta</button>
              </form>
              <h3 className="card-header" style={{ marginTop: '40px' }}>Saldos Disponibles</h3>
              <ul className="list-group">
                {cuentas.map(c => (
                  <li key={c.id} className="list-item">
                    <div>
                      <strong>{c.nombre_cuenta}</strong>
                      <span className="text-muted" style={{ display: 'block', marginTop: '4px' }}>{c.tipo_cuenta} • Moneda: {c.moneda || 'USD'}</span>
                    </div>
                    <strong style={{ fontSize: '1.4rem', color: 'var(--success)' }}>
                      {renderMoneda(c.moneda)} {c.saldo_actual}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* VISTA FACTURACIÓN CON GRID CSS */}
          {vista === 'facturacion' && (
            <div className="card">
              <h2 className="card-header">Generación de Cargos Mensuales</h2>
              <form onSubmit={guardarDeuda}>
                <div className="grid-form">
                  <div className="form-group"><label>Local a Facturar</label><select className="form-control" name="propietario_id" value={formDeuda.propietario_id} onChange={(e) => setFormDeuda({ ...formDeuda, [e.target.name]: e.target.value })} required><option value="">-- Seleccione un Local --</option>{propietarios.map(p => <option key={p.id} value={p.id}>{p.identificador_unidad} - {p.nombre_completo}</option>)}</select></div>
                  <div className="form-group"><label>Concepto / Periodo</label><input type="text" className="form-control" name="mes_facturacion" value={formDeuda.mes_facturacion} onChange={(e) => setFormDeuda({ ...formDeuda, [e.target.name]: e.target.value })} required /></div>
                  <div className="form-group"><label>Monto Total a Cobrar (USD)</label><input type="number" className="form-control" name="monto_cobrado" step="0.01" value={formDeuda.monto_cobrado} onChange={(e) => setFormDeuda({ ...formDeuda, [e.target.name]: e.target.value })} required /></div>
                </div>
                <button type="submit" className="btn btn-danger mt-4">Emitir Deuda</button>
              </form>
              <h3 className="card-header" style={{ marginTop: '40px' }}>Historial de Cargos</h3>
              <ul className="list-group">
                {deudas.map(deuda => (
                  <li key={deuda.id} className="list-item"><div><strong>{buscarLocal(deuda.propietario_id)}</strong><span className="text-muted" style={{ display: 'block', marginTop: '4px' }}>{deuda.mes_facturacion}</span></div><div style={{ textAlign: 'left' }}><span className={`badge ${deuda.estado === 'Pendiente' ? 'badge-pendiente' : 'badge-pagada'}`}>{deuda.estado}</span><br/><strong style={{ marginTop: '8px', display: 'inline-block', fontSize: '1.1rem' }}>$ {deuda.monto_cobrado}</strong></div></li>
                ))}
              </ul>
            </div>
          )}

          {/* VISTA PAGOS CON GRID CSS */}
          {vista === 'pagos' && (
            <div className="card">
              <h2 className="card-header">Recepción y Conciliación de Pagos</h2>
              <form onSubmit={guardarPago}>
                <div className="grid-form">
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Factura a Pagar</label><select className="form-control" name="deuda_id" value={formPago.deuda_id} onChange={(e) => setFormPago({ ...formPago, [e.target.name]: e.target.value })} required><option value="">-- Seleccione la Deuda --</option>{deudas.filter(d => d.estado === 'Pendiente').map(d => <option key={d.id} value={d.id}>{buscarLocal(d.propietario_id)} - {d.mes_facturacion} ($ {d.monto_cobrado})</option>)}</select></div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Cuenta Destino (Ingreso a)</label><select className="form-control" name="cuenta_ingreso_id" value={formPago.cuenta_ingreso_id} onChange={(e) => setFormPago({ ...formPago, [e.target.name]: e.target.value })} required><option value="">-- Seleccione la Cuenta --</option>{cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre_cuenta} (Disp: {renderMoneda(c.moneda)} {c.saldo_actual})</option>)}</select></div>
                  <div className="form-group"><label>Monto Depositado</label><input type="number" className="form-control" name="monto_pagado" step="0.01" value={formPago.monto_pagado} onChange={(e) => setFormPago({ ...formPago, [e.target.name]: e.target.value })} required /></div>
                  <div className="form-group"><label>Nro. Referencia / Zelle</label><input type="text" className="form-control" name="referencia" value={formPago.referencia} onChange={(e) => setFormPago({ ...formPago, [e.target.name]: e.target.value })} required /></div>
                  <div className="form-group"><label>Fecha de Operación</label><input type="date" className="form-control" name="fecha_pago" value={formPago.fecha_pago} onChange={(e) => setFormPago({ ...formPago, [e.target.name]: e.target.value })} required /></div>
                </div>
                <button type="submit" className="btn btn-success mt-4">Procesar y Conciliar Pago</button>
              </form>
              <h3 className="card-header" style={{ marginTop: '40px' }}>Últimos Ingresos</h3>
              <ul className="list-group">
                {pagos.map(pago => {
                  const cuentaDestino = cuentas.find(c => c.id === pago.cuenta_ingreso_id);
                  const mon = cuentaDestino ? cuentaDestino.moneda : 'USD';
                  return (
                    <li key={pago.id} className="list-item"><div><strong>Ref: {pago.referencia}</strong><span className="text-muted" style={{ display: 'block', marginTop: '4px' }}>{pago.fecha_pago} | Ingresó a: {buscarCuenta(pago.cuenta_ingreso_id)}</span></div><strong style={{ color: 'var(--success)', fontSize: '1.2rem' }}>+ {renderMoneda(mon)} {pago.monto_pagado}</strong></li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* VISTA GASTOS CON GRID CSS */}
          {vista === 'gastos' && (
            <div className="card">
              <h2 className="card-header">Registro de Egresos Operativos</h2>
              <form onSubmit={guardarGasto}>
                <div className="grid-form">
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Cuenta de Origen (Pago desde)</label><select className="form-control" name="cuenta_origen_id" value={formGasto.cuenta_origen_id} onChange={(e) => setFormGasto({ ...formGasto, [e.target.name]: e.target.value })} required><option value="">-- Seleccione de dónde sale el dinero --</option>{cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre_cuenta} (Disp: {renderMoneda(c.moneda)} {c.saldo_actual})</option>)}</select></div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Concepto del Gasto</label><input type="text" className="form-control" name="concepto" placeholder="Ej: Pago de conserjería, Reparación de bomba" value={formGasto.concepto} onChange={(e) => setFormGasto({ ...formGasto, [e.target.name]: e.target.value })} required /></div>
                  <div className="form-group"><label>Monto a Descontar</label><input type="number" className="form-control" name="monto" step="0.01" value={formGasto.monto} onChange={(e) => setFormGasto({ ...formGasto, [e.target.name]: e.target.value })} required /></div>
                  <div className="form-group"><label>Fecha de Operación</label><input type="date" className="form-control" name="fecha_gasto" value={formGasto.fecha_gasto} onChange={(e) => setFormGasto({ ...formGasto, [e.target.name]: e.target.value })} required /></div>
                </div>
                <button type="submit" className="btn btn-warning mt-4">Registrar Egreso</button>
              </form>
              <h3 className="card-header" style={{ marginTop: '40px' }}>Historial de Salidas</h3>
              <ul className="list-group">
                {gastos.map(gasto => {
                  const cuentaOrigen = cuentas.find(c => c.id === gasto.cuenta_origen_id);
                  const mon = cuentaOrigen ? cuentaOrigen.moneda : 'USD';
                  return (
                    <li key={gasto.id} className="list-item"><div><strong>{gasto.concepto}</strong><span className="text-muted" style={{ display: 'block', marginTop: '4px' }}>{gasto.fecha_gasto} | Desde: {buscarCuenta(gasto.cuenta_origen_id)}</span></div><strong style={{ color: 'var(--danger)', fontSize: '1.2rem' }}>- {renderMoneda(mon)} {gasto.monto}</strong></li>
                  )
                })}
              </ul>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}

export default App
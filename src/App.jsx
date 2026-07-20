import { useState, useEffect } from 'react'
import { supabase } from './supabase'

function App() {
  // Navegación
  const [vista, setVista] = useState('propietarios') // 'propietarios' | 'cuentas'

  // Estados Propietarios
  const [propietarios, setPropietarios] = useState([])
  const [formPropietario, setFormPropietario] = useState({
    nombre_completo: '',
    identificacion: '',
    identificador_unidad: ''
  })

  // Estados Cuentas
  const [cuentas, setCuentas] = useState([])
  const [formCuenta, setFormCuenta] = useState({
    nombre_cuenta: '',
    tipo_cuenta: 'Caja',
    saldo_actual: 0
  })

  // Carga inicial
  useEffect(() => {
    cargarPropietarios()
    cargarCuentas()
  }, [])

  // --- LÓGICA DE PROPIETARIOS ---
  const cargarPropietarios = async () => {
    const { data, error } = await supabase.from('propietarios').select('*').order('created_at', { ascending: false })
    if (error) console.error('Error propietarios:', error)
    else setPropietarios(data)
  }

  const manejarCambioPropietario = (e) => {
    setFormPropietario({ ...formPropietario, [e.target.name]: e.target.value })
  }

  const guardarPropietario = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('propietarios').insert([formPropietario])
    if (error) {
      alert('Error al guardar propietario')
    } else {
      alert('Propietario registrado.')
      setFormPropietario({ nombre_completo: '', identificacion: '', identificador_unidad: '' })
      cargarPropietarios()
    }
  }

  // --- LÓGICA DE CUENTAS ---
  const cargarCuentas = async () => {
    const { data, error } = await supabase.from('cuentas').select('*').order('created_at', { ascending: false })
    if (error) console.error('Error cuentas:', error)
    else setCuentas(data)
  }

  const manejarCambioCuenta = (e) => {
    setFormCuenta({ ...formCuenta, [e.target.name]: e.target.value })
  }

  const guardarCuenta = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('cuentas').insert([{
      nombre_cuenta: formCuenta.nombre_cuenta,
      tipo_cuenta: formCuenta.tipo_cuenta,
      saldo_actual: parseFloat(formCuenta.saldo_actual)
    }])
    if (error) {
      alert('Error al guardar cuenta')
    } else {
      alert('Cuenta registrada.')
      setFormCuenta({ nombre_cuenta: '', tipo_cuenta: 'Caja', saldo_actual: 0 })
      cargarCuentas()
    }
  }

  // --- INTERFAZ ---
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center' }}>Condominio Juan Pablo II</h1>
      
      {/* Menú de Navegación */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', justifyContent: 'center' }}>
        <button 
          onClick={() => setVista('propietarios')}
          style={{ padding: '10px', backgroundColor: vista === 'propietarios' ? '#0056b3' : '#ccc', color: 'white', border: 'none', cursor: 'pointer' }}>
          Locales / Propietarios
        </button>
        <button 
          onClick={() => setVista('cuentas')}
          style={{ padding: '10px', backgroundColor: vista === 'cuentas' ? '#0056b3' : '#ccc', color: 'white', border: 'none', cursor: 'pointer' }}>
          Caja y Bancos
        </button>
      </div>

      {/* VISTA PROPIETARIOS */}
      {vista === 'propietarios' && (
        <div>
          <h2>Registro de Propietario</h2>
          <form onSubmit={guardarPropietario} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '30px' }}>
            <input type="text" name="nombre_completo" placeholder="Nombre Completo" value={formPropietario.nombre_completo} onChange={manejarCambioPropietario} required style={{ padding: '8px' }}/>
            <input type="text" name="identificacion" placeholder="Cédula o RIF" value={formPropietario.identificacion} onChange={manejarCambioPropietario} required style={{ padding: '8px' }}/>
            <input type="text" name="identificador_unidad" placeholder="Unidad (Ej: Local 1)" value={formPropietario.identificador_unidad} onChange={manejarCambioPropietario} required style={{ padding: '8px' }}/>
            <button type="submit" style={{ padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', cursor: 'pointer' }}>Guardar Propietario</button>
          </form>

          <h3>Lista de Locales</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {propietarios.map(prop => (
              <li key={prop.id} style={{ borderBottom: '1px solid #eee', padding: '10px 0' }}>
                <strong>{prop.nombre_completo}</strong> <br/>
                <small>ID: {prop.identificacion} | Unidad: {prop.identificador_unidad}</small>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* VISTA CUENTAS */}
      {vista === 'cuentas' && (
        <div>
          <h2>Apertura de Caja / Banco</h2>
          <form onSubmit={guardarCuenta} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '30px' }}>
            <input type="text" name="nombre_cuenta" placeholder="Nombre de la cuenta (Ej: Banesco, Caja Chica)" value={formCuenta.nombre_cuenta} onChange={manejarCambioCuenta} required style={{ padding: '8px' }}/>
            <select name="tipo_cuenta" value={formCuenta.tipo_cuenta} onChange={manejarCambioCuenta} style={{ padding: '8px' }}>
              <option value="Caja">Caja Fuerte / Efectivo</option>
              <option value="Banco">Cuenta Bancaria</option>
            </select>
            <input type="number" name="saldo_actual" placeholder="Saldo Inicial" step="0.01" value={formCuenta.saldo_actual} onChange={manejarCambioCuenta} required style={{ padding: '8px' }}/>
            <button type="submit" style={{ padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', cursor: 'pointer' }}>Guardar Cuenta</button>
          </form>

          <h3>Cuentas Activas</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {cuentas.map(cuenta => (
              <li key={cuenta.id} style={{ borderBottom: '1px solid #eee', padding: '10px 0' }}>
                <strong>{cuenta.nombre_cuenta}</strong> ({cuenta.tipo_cuenta})<br/>
                <small>Saldo actual: {cuenta.saldo_actual}</small>
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  )
}

export default App

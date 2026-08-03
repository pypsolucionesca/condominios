import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase, mensajeError } from '../lib/supabase'
import { Aviso, IconoAyuda } from '../components/UI'
import Turnstile from '../components/Turnstile'

export default function Registro() {
  const navigate = useNavigate()
  
  const [form, setForm] = useState({ condoName: '', adminName: '', email: '', password: '', aceptaTerminos: false })
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [exito, setExito] = useState(false)
  const [captchaToken, setCaptchaToken] = useState(null)
  const [captchaNoDisponible, setCaptchaNoDisponible] = useState(false)

  const registrar = async (e) => {
    e.preventDefault()
    setError(null)
    
    if (!form.condoName.trim()) return setError('El nombre de la empresa es obligatorio.')
    if (!form.adminName.trim()) return setError('El nombre del administrador es obligatorio.')
    if (form.password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.')
    if (!form.aceptaTerminos) return setError('Debe aceptar los Términos y Condiciones para registrarse.')
    if (!captchaToken && !captchaNoDisponible) return setError('Por favor complete la verificación de seguridad.')

    setCargando(true)
    try {
      // Inyectamos el payload oculto (options.data) para activar el Trigger SQL.
      // El captchaToken prueba que hay una persona real (protección anti-bots).
      const { data, error: err } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          captchaToken,
          data: {
            condo_name: form.condoName.trim(),
            admin_name: form.adminName.trim()
          }
        }
      })

      if (err) throw err

      if (data?.user && data.session === null) {
        setExito(true)
      } else {
        navigate('/panel')
      }
    } catch (err) {
      setError(mensajeError(err))
      // El token de Turnstile es de un solo uso: al fallar hay que rehacer
      // la verificación, así que se limpia para forzar un nuevo challenge.
      setCaptchaToken(null)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-box" style={{ maxWidth: 450 }}>
        
        {/* CABECERA ACTUALIZADA CON LOGO Y MARCA */}
        <div className="login-brand" style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div 
            className="login-logo" 
            style={{ 
              marginBottom: '8px', 
              height: 'auto', 
              minHeight: '100px', 
              overflow: 'visible',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}
          >
            <img
              src="/logo-login.png"
              alt="PyP Condominios"
              style={{
                height: '100px',
                width: 'auto',
                objectFit: 'contain',
                display: 'block'
              }}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
            PyP <span style={{ color: '#f97316' }}>Condominios</span>
          </h2>
        </div>
        
        <h3 style={{ textAlign: 'center', marginBottom: 20, color: 'var(--text-main)' }}>Registrar nueva empresa</h3>

        {exito ? (
          <div className="alerta alerta-exito" style={{ textAlign: 'center', padding: '20px' }}>
            <h4 style={{ margin: '0 0 10px 0' }}>¡Plataforma inicializada!</h4>
            <p style={{ margin: '0 0 10px 0' }}>Hemos construido el entorno seguro para <strong>{form.condoName}</strong>.</p>
            <p style={{ margin: 0 }}>Por favor, revisa la bandeja de entrada de tu correo electrónico para confirmar la cuenta y empezar a operar.</p>
            <div style={{ marginTop: 24 }}>
              <Link to="/login" className="btn btn-secundario" style={{ textDecoration: 'none', display: 'inline-block' }}>
                Ir al Inicio de Sesión
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={registrar}>
            {error && <Aviso tipo="error" onCerrar={() => setError(null)}>{error}</Aviso>}

            <div className="form-group">
              <label>
                Nombre del Edificio o Empresa *
                <IconoAyuda texto="Nombre oficial con el que se identificarán los recibos, reportes y la base de datos de su organización." />
              </label>
              <input
                className="form-control"
                value={form.condoName}
                onChange={e => setForm({...form, condoName: e.target.value})}
                placeholder="Ej. Centro Profesional El Sol"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>
                Tu nombre (Administrador) *
                <IconoAyuda texto="Persona responsable de la gestión principal, control de pagos y configuración inicial de la plataforma." />
              </label>
              <input
                className="form-control"
                value={form.adminName}
                onChange={e => setForm({...form, adminName: e.target.value})}
                placeholder="Ej. Juan Pérez"
              />
            </div>

            <div className="form-group">
              <label>
                Correo electrónico de acceso *
                <IconoAyuda texto="Credencial principal de inicio de sesión y medio por el cual recibirá las confirmaciones de seguridad del sistema." />
              </label>
              <input
                type="email"
                className="form-control"
                value={form.email}
                onChange={e => setForm({...form, email: e.target.value})}
                placeholder="admin@empresa.com"
              />
            </div>

            <div className="form-group">
              <label>
                Contraseña *
                <IconoAyuda texto="Debe tener una longitud mínima de 6 caracteres." />
              </label>
              <input
                type="password"
                className="form-control"
                value={form.password}
                onChange={e => setForm({...form, password: e.target.value})}
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '10px' }}>
              <input
                type="checkbox"
                id="terminos"
                checked={form.aceptaTerminos}
                onChange={e => setForm({...form, aceptaTerminos: e.target.checked})}
                style={{ marginTop: '4px' }}
              />
              <label htmlFor="terminos" style={{ fontSize: '0.85rem', lineHeight: '1.4', cursor: 'pointer', fontWeight: 'normal' }}>
                He leído y acepto los <Link to="/terminos" target="_blank" style={{ color: 'var(--primary-color)' }}>Términos y Condiciones</Link> y la <Link to="/privacidad" target="_blank" style={{ color: 'var(--primary-color)' }}>Política de Privacidad</Link>.
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
              <Turnstile
                accion="registro"
                requerido={true}
                onToken={setCaptchaToken}
                onExpire={() => setCaptchaToken(null)}
                onNoDisponible={() => setCaptchaNoDisponible(true)}
              />
            </div>

            <button 
              className="btn btn-primary" 
              style={{ width: '100%', padding: '12px', fontSize: '1.1rem', marginTop: 8 }} 
              disabled={cargando || (!captchaToken && !captchaNoDisponible)}
            >
              {cargando ? 'Configurando plataforma...' : 'Crear cuenta'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <small className="texto-ayuda">
                ¿Ya tienes una cuenta registrada? <Link to="/login" style={{ color: 'var(--primary-color)', fontWeight: 600 }}>Inicia sesión aquí</Link>
              </small>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
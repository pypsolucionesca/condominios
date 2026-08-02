import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Turnstile from '../components/Turnstile'

const FALLOS_PARA_CAPTCHA = 3

export default function Login() {
  const { iniciarSesion, recuperarContrasena } = useAuth()

  const [modo, setModo] = useState('login') // 'login' | 'recuperar'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  // Tras varios intentos fallidos exigimos verificación humana. No bloquea la
  // cuenta (eso podría usarse en contra del usuario); solo frena a los bots.
  const [fallos, setFallos] = useState(0)
  const [captchaToken, setCaptchaToken] = useState(null)
  // Supabase exige el token de captcha en CADA autenticación cuando la
  // protección está activa. Por eso el captcha se muestra siempre (no solo
  // tras fallos). Si no está disponible (clave no configurada o no carga),
  // captchaNoDisponible pasa a true y el login continúa sin él.
  const [captchaNoDisponible, setCaptchaNoDisponible] = useState(false)

  // El captcha se exige siempre que esté disponible.
  const requiereCaptcha = !captchaNoDisponible

  const validarEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

  const enviar = async (e) => {
    e.preventDefault()
    setError(null)
    setAviso(null)

    if (!validarEmail(email)) {
      setError('Ingrese un correo electrónico válido.')
      return
    }

    setEnviando(true)

    // Supabase exige el token de captcha en recuperación y login por igual.
    if (requiereCaptcha && !captchaToken) {
      setEnviando(false)
      setError('Por favor complete la verificación de seguridad para continuar.')
      return
    }

    if (modo === 'recuperar') {
      const res = await recuperarContrasena(email, captchaToken)
      setEnviando(false)
      setCaptchaToken(null)
      if (res.ok) {
        setAviso('Si el correo está registrado, recibirá un enlace para restablecer su contraseña.')
        setModo('login')
      } else {
        setError(res.error)
      }
      return
    }

    if (!password) {
      setEnviando(false)
      setError('Ingrese su contraseña.')
      return
    }

    const res = await iniciarSesion(email, password, captchaToken)
    setEnviando(false)
    if (!res.ok) {
      setError(res.error)
      setFallos((n) => n + 1)
      // El token de Turnstile es de un solo uso: se limpia para el próximo intento.
      setCaptchaToken(null)
    }
    // Si tiene éxito, AuthProvider redirige automáticamente.
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          
          {/* CONTENEDOR LIBERADO DE RESTRICCIONES CSS */}
          <div 
            className="login-logo" 
            style={{ 
              marginBottom: '2px', 
              height: 'auto', 
              minHeight: '130px', 
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
                height: '130px',
                width: 'auto',
                objectFit: 'contain',
                display: 'block'
              }}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          </div>

          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0, fontWeight: '500' }}>
            Sistema de Gestión y Finanzas
          </p>
        </div>

        <form onSubmit={enviar} noValidate style={{ marginTop: '24px' }}>
          <div className="form-group">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              autoFocus
              disabled={enviando}
              placeholder="usuario@correo.com"
            />
          </div>

          {modo === 'login' && (
            <div className="form-group">
              <label htmlFor="password">Contraseña</label>
              <div className="input-con-boton">
                <input
                  id="password"
                  type={verPassword ? 'text' : 'password'}
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={enviando}
                />
                <button
                  type="button"
                  className="btn-ver"
                  onClick={() => setVerPassword((v) => !v)}
                  aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  tabIndex={-1}
                >
                  {verPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          )}

          {error && <div className="alerta alerta-error">{error}</div>}
          {aviso && <div className="alerta alerta-exito">{aviso}</div>}

          {requiereCaptcha && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <small className="texto-ayuda" style={{ marginBottom: 4 }}>
                Por seguridad, confirme que no es un robot.
              </small>
              <Turnstile
                accion={modo === 'recuperar' ? 'recuperar' : 'login'}
                onToken={setCaptchaToken}
                onExpire={() => setCaptchaToken(null)}
                onNoDisponible={() => setCaptchaNoDisponible(true)}
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={enviando || (requiereCaptcha && !captchaToken)}
          >
            {enviando
              ? 'Procesando…'
              : modo === 'login'
              ? 'Ingresar'
              : 'Enviar enlace de recuperación'}
          </button>

          <button
            type="button"
            className="btn-enlace"
            onClick={() => {
              setModo(modo === 'login' ? 'recuperar' : 'login')
              setError(null)
              setAviso(null)
            }}
            disabled={enviando}
          >
            {modo === 'login' ? '¿Olvidó su contraseña?' : 'Volver al inicio de sesión'}
          </button>
        </form>

        <p className="login-pie">
          El acceso es exclusivo para propietarios y residentes registrados.
          <br />
          Si no tiene credenciales, solicítelas a la administración.
        </p>

        {/* PUENTE AL REGISTRO SaaS */}
        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e5e7eb', textAlign: 'center' }}>
          <small style={{ color: '#4b5563', display: 'block', marginBottom: '12px' }}>
            ¿Desea implementar PyP Condominios en su empresa o condominio?
          </small>
          <Link 
            to="/registro" 
            className="btn btn-secundario" 
            style={{ 
              width: '100%', 
              textDecoration: 'none', 
              display: 'inline-block', 
              boxSizing: 'border-box',
              textAlign: 'center'
            }}
          >
            Registrar nueva empresa
          </Link>
        </div>

      </div>
    </div>
  )
}
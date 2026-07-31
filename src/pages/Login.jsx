import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { iniciarSesion, recuperarContrasena } = useAuth()

  const [modo, setModo] = useState('login') // 'login' | 'recuperar'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

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

    if (modo === 'recuperar') {
      const res = await recuperarContrasena(email)
      setEnviando(false)
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

    const res = await iniciarSesion(email, password)
    setEnviando(false)
    if (!res.ok) setError(res.error)
    // Si tiene éxito, AuthProvider redirige automáticamente.
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo" style={{ marginBottom: '2px' }}>
            <img
              src="/logo-login.png"
              alt="PyP Condominios"
              style={{
                height: '130px',
                width: 'auto',
                objectFit: 'contain',
                margin: '0 auto',
                display: 'block'
              }}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
            PyP <span style={{ color: '#f97316' }}>Condominios</span>
          </h1>
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

          <button type="submit" className="btn btn-primary" disabled={enviando}>
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
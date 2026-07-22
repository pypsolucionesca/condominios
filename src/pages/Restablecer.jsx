import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Restablecer() {
  const { cambiarContrasena } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [listo, setListo] = useState(false)
  const [sesionValida, setSesionValida] = useState(null)

  useEffect(() => {
    // El enlace del correo trae la sesión en el hash de la URL.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSesionValida(Boolean(session))
    })
  }, [])

  const enviar = async (e) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      return setError('La contraseña debe tener al menos 8 caracteres.')
    }
    if (password !== confirmar) {
      return setError('Las contraseñas no coinciden.')
    }

    setEnviando(true)
    const res = await cambiarContrasena(password)
    setEnviando(false)

    if (!res.ok) return setError(res.error)
    setListo(true)
    setTimeout(() => navigate('/', { replace: true }), 2000)
  }

  if (sesionValida === null) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p>Verificando enlace…</p>
        </div>
      </div>
    )
  }

  if (!sesionValida) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Enlace no válido</h1>
          <div className="alerta alerta-error">
            El enlace expiró o ya fue utilizado. Solicite uno nuevo desde la pantalla de
            inicio de sesión.
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/login')}>
            Ir al inicio de sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <h1>Definir contraseña</h1>
          <p>Elija una contraseña para acceder al sistema</p>
        </div>

        {listo ? (
          <div className="alerta alerta-exito">
            Contraseña actualizada. Redirigiendo…
          </div>
        ) : (
          <form onSubmit={enviar} noValidate>
            <div className="form-group">
              <label htmlFor="pass">Nueva contraseña</label>
              <input
                id="pass"
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
              />
              <small className="texto-ayuda">Mínimo 8 caracteres.</small>
            </div>

            <div className="form-group">
              <label htmlFor="pass2">Confirmar contraseña</label>
              <input
                id="pass2"
                type="password"
                className="form-control"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            {error && <div className="alerta alerta-error">{error}</div>}

            <button className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

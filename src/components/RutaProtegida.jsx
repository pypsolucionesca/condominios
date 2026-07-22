import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Cargando({ mensaje = 'Cargando…' }) {
  return (
    <div className="pantalla-carga">
      <div className="spinner" />
      <p>{mensaje}</p>
    </div>
  )
}

/**
 * Exige sesión activa. Si se indica `soloAdmin`, además exige rol admin.
 *
 * Esto es control de INTERFAZ, no de seguridad: su única función es evitar
 * que el usuario vea pantallas inútiles. La protección real vive en las
 * políticas RLS de Postgres, que se aplican aunque alguien manipule el
 * JavaScript del navegador.
 */
export function RutaProtegida({ children, soloAdmin = false }) {
  const { autenticado, cargando, esAdmin, errorPerfil, cerrarSesion } = useAuth()
  const location = useLocation()

  if (cargando) return <Cargando mensaje="Verificando sesión…" />

  if (errorPerfil) {
    return (
      <div className="pantalla-carga">
        <div className="alerta alerta-error" style={{ maxWidth: 420 }}>
          {errorPerfil}
        </div>
        <button className="btn btn-primary" style={{ maxWidth: 220 }} onClick={cerrarSesion}>
          Volver al inicio de sesión
        </button>
      </div>
    )
  }

  if (!autenticado) {
    return <Navigate to="/login" state={{ desde: location.pathname }} replace />
  }

  if (soloAdmin && !esAdmin) {
    return <Navigate to="/mi-cuenta" replace />
  }

  return children
}

/**
 * Impide ver el login a quien ya tiene sesión iniciada.
 */
export function RutaPublica({ children }) {
  const { autenticado, cargando, esAdmin } = useAuth()

  if (cargando) return <Cargando />
  if (autenticado) return <Navigate to={esAdmin ? '/panel' : '/mi-cuenta'} replace />

  return children
}

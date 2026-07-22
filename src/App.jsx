import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { RutaProtegida, RutaPublica, Cargando } from './components/RutaProtegida'
import Layout from './components/Layout'
import Login from './pages/Login'
import Restablecer from './pages/Restablecer'
import MiCuenta from './pages/MiCuenta'
import AdminUsuarios from './pages/AdminUsuarios'
import './styles/app.css'

/** Envía a cada rol a su pantalla inicial. */
function Inicio() {
  const { esAdmin, cargando } = useAuth()
  if (cargando) return <Cargando />
  return <Navigate to={esAdmin ? '/panel' : '/mi-cuenta'} replace />
}

function Pendiente({ titulo }) {
  return (
    <div className="card">
      <h2 className="card-header">{titulo}</h2>
      <p className="texto-vacio">Este módulo se habilitará en la siguiente fase.</p>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Públicas */}
          <Route
            path="/login"
            element={
              <RutaPublica>
                <Login />
              </RutaPublica>
            }
          />
          <Route path="/restablecer" element={<Restablecer />} />

          {/* Protegidas */}
          <Route
            element={
              <RutaProtegida>
                <Layout />
              </RutaProtegida>
            }
          >
            <Route path="/" element={<Inicio />} />

            {/* Residente */}
            <Route path="/mi-cuenta" element={<MiCuenta />} />
            <Route path="/reportar-pago" element={<Pendiente titulo="Reportar pago" />} />

            {/* Administrador */}
            <Route
              path="/panel"
              element={
                <RutaProtegida soloAdmin>
                  <Pendiente titulo="Panel de control" />
                </RutaProtegida>
              }
            />
            <Route
              path="/apartamentos"
              element={
                <RutaProtegida soloAdmin>
                  <AdminUsuarios />
                </RutaProtegida>
              }
            />
            <Route
              path="/cobranza"
              element={
                <RutaProtegida soloAdmin>
                  <Pendiente titulo="Cobranza" />
                </RutaProtegida>
              }
            />
            <Route
              path="/pagos"
              element={
                <RutaProtegida soloAdmin>
                  <Pendiente titulo="Confirmación de pagos" />
                </RutaProtegida>
              }
            />
            <Route
              path="/tesoreria"
              element={
                <RutaProtegida soloAdmin>
                  <Pendiente titulo="Tesorería" />
                </RutaProtegida>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

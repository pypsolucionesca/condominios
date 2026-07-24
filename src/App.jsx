import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { RutaProtegida, RutaPublica, Cargando } from './components/RutaProtegida'
import Layout from './components/Layout'
import Login from './pages/Login'
import Restablecer from './pages/Restablecer'
import MiCuenta from './pages/MiCuenta'
import Unidades from './pages/Unidades'
import PanelControl from './pages/PanelControl'
import Cobranza from './pages/Cobranza'
import Configuracion from './pages/Configuracion'
import Pagos from './pages/Pagos'
import Tesoreria from './pages/Tesoreria'
import ReportarPago from './pages/ReportarPago'
import Perfil from './pages/Perfil'
import Exoneraciones from './pages/Exoneraciones'
import AvisoInstalacion from './components/AvisoInstalacion'
import ActualizacionApp from './components/ActualizacionApp'
import './styles/app.css'

/** Envía a cada rol a su pantalla inicial. */
function Inicio() {
  const { esAdmin, cargando } = useAuth()
  if (cargando) return <Cargando />
  return <Navigate to={esAdmin ? '/panel' : '/mi-cuenta'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ActualizacionApp />
        <AvisoInstalacion />
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
            <Route path="/perfil" element={<Perfil />} />
            <Route path="/exoneraciones" element={<Exoneraciones />} />

            {/* Residente */}
            <Route path="/mi-cuenta" element={<MiCuenta />} />
            <Route path="/reportar-pago" element={<ReportarPago />} />

            {/* Administrador */}
            <Route path="/panel" element={<PanelControl />} />
            <Route path="/unidades" element={<Unidades />} />
            <Route
              path="/cobranza"
              element={
                <RutaProtegida soloAdmin>
                  <Cobranza />
                </RutaProtegida>
              }
            />
            <Route
              path="/configuracion"
              element={
                <RutaProtegida soloAdmin>
                  <Configuracion />
                </RutaProtegida>
              }
            />
            <Route
              path="/pagos"
              element={
                <RutaProtegida soloAdmin>
                  <Pagos />
                </RutaProtegida>
              }
            />
            <Route path="/tesoreria" element={<Tesoreria />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { RutaProtegida, RutaPublica, Cargando } from './components/RutaProtegida'
import Layout from './components/Layout'
import Login from './pages/Login'
import Restablecer from './pages/Restablecer'
import MiCuenta from './pages/MiCuenta'
import Unidades from './pages/Unidades'
import PanelControl from './pages/PanelControl'
import EstadoUnidad from './pages/EstadoUnidad'
import Cobranza from './pages/Cobranza'
import Configuracion from './pages/Configuracion'
import Pagos from './pages/Pagos'
import Tesoreria from './pages/Tesoreria'
import ReportarPago from './pages/ReportarPago'
import Perfil from './pages/Perfil'
import Exoneraciones from './pages/Exoneraciones'
import AvisoInstalacion from './components/AvisoInstalacion'
import AvisoNotificaciones from './components/AvisoNotificaciones'
import ActualizacionApp from './components/ActualizacionApp'
import './styles/app.css'

/** Envía a cada rol a su pantalla inicial. */
function Inicio() {
  const { puedeOperar, cargando } = useAuth()
  if (cargando) return <Cargando />
  return <Navigate to={puedeOperar ? '/panel' : '/mi-cuenta'} replace />
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
                <AvisoNotificaciones />
                <Layout />
              </RutaProtegida>
            }
          >
            <Route path="/" element={<Inicio />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="/exoneraciones" element={<Exoneraciones />} />

            {/* Residente (Cualquiera) */}
            <Route path="/mi-cuenta" element={<MiCuenta />} />
            <Route path="/reportar-pago" element={<ReportarPago />} />

            {/* Acceso a Unidades y Panel: Bloqueado a Residentes Restringidos */}
            <Route 
              path="/panel" 
              element={
                <RutaProtegida bloquearRestringido>
                  <PanelControl />
                </RutaProtegida>
              } 
            />
            <Route 
              path="/unidad/:id" 
              element={
                <RutaProtegida bloquearRestringido>
                  <EstadoUnidad />
                </RutaProtegida>
              } 
            />
            <Route 
              path="/unidades" 
              element={
                <RutaProtegida bloquearRestringido>
                  <Unidades />
                </RutaProtegida>
              } 
            />

            {/* Administrador y Supervisor (soloOperador) */}
            <Route
              path="/cobranza"
              element={
                <RutaProtegida soloOperador>
                  <Cobranza />
                </RutaProtegida>
              }
            />
            <Route
              path="/pagos"
              element={
                <RutaProtegida soloOperador>
                  <Pagos />
                </RutaProtegida>
              }
            />
            <Route path="/tesoreria" element={<Tesoreria />} />

            {/* Solo Administrador (soloAdmin) */}
            <Route
              path="/configuracion"
              element={
                <RutaProtegida soloAdmin>
                  <Configuracion />
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
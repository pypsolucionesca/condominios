import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Campana from './Campana'
import LimiteError from './LimiteError'
import CentroAyuda from './CentroAyuda'

export default function Layout() {
  const { perfil, condominio, esAdmin, esSupervisor, puedeOperar, cerrarSesion, unidades, esRestringido } =
    useAuth()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [ayudaAbierta, setAyudaAbierta] = useState(false)
  const navigate = useNavigate()

  const salir = async () => {
    await cerrarSesion()
    navigate('/login', { replace: true })
  }

  // =========================================================================
  // MURO DE PAGO (BILLING LOCK)
  // Si la empresa está suspendida, destruimos el layout y mostramos el candado
  // =========================================================================
  if (condominio?.subscription_status === 'suspendida') {
    return (
      <div className="login-container" style={{ padding: '20px' }}>
        <div className="login-box" style={{ maxWidth: 500, textAlign: 'center' }}>
          <span aria-hidden="true" style={{ fontSize: '4rem' }}>🔒</span>
          <h2 style={{ color: '#ef4444', margin: '15px 0' }}>Servicio Suspendido</h2>
          
          <p style={{ color: 'var(--text-main)', marginBottom: 20, fontSize: '1.1rem' }}>
            El acceso al sistema para <strong>{condominio.name}</strong> se encuentra actualmente restringido.
          </p>
          
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '16px', borderRadius: '8px', textAlign: 'left', marginBottom: 24, fontSize: '0.95rem' }}>
            <strong>Acción requerida:</strong> Por favor, póngase en contacto con <strong>P&P Soluciones</strong> para regularizar el estado de su cuenta y reactivar el acceso a la plataforma operativa.
          </div>
          
          <button className="btn btn-secundario" onClick={salir} style={{ width: '100%', padding: '12px' }}>
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }
  // =========================================================================

  let enlaces
  if (puedeOperar) {
    enlaces = []
    if (unidades.length > 0) {
      enlaces.push({ to: '/mi-cuenta', icono: '📄', texto: 'Mi cuenta' })
    }
    enlaces.push(
      { to: '/panel', icono: '📊', texto: 'Panel' },
      { to: '/unidades', icono: '🏢', texto: 'Unidades' },
      { to: '/cobranza', icono: '📄', texto: 'Cobranza' },
      { to: '/pagos', icono: '💵', texto: 'Pagos' },
      { to: '/tesoreria', icono: '🏦', texto: 'Tesorería' }
    )
    // Gobierno: solo el administrador
    if (esAdmin) {
      enlaces.push({ to: '/exoneraciones', icono: '🤲', texto: 'Exoneraciones' })
      enlaces.push({ to: '/usuarios', icono: '👥', texto: 'Usuarios' })
      enlaces.push({ to: '/configuracion', icono: '⚙️', texto: 'Ajustes' })
    }
  } else {
    enlaces = [
      { to: '/mi-cuenta', icono: '📄', texto: 'Mi cuenta' },
      { to: '/reportar-pago', icono: '💵', texto: 'Reportar pago' },
    ]
    
    if (!esRestringido) {
      enlaces.push(
        { to: '/panel', icono: '📊', texto: 'Transparencia' },
        { to: '/unidades', icono: '🏢', texto: 'Unidades' }
      )
    }
  }

  const descripcionRol = esAdmin
    ? 'Administrador'
    : esSupervisor
    ? 'Supervisor'
    : unidades.length === 1
    ? `Apto. ${unidades[0].code}`
    : unidades.length > 1
    ? `${unidades.length} apartamentos`
    : 'Residente'

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-marca">
          <div className="sidebar-logo">
            <img
              src={condominio?.logo_url || "/logo.png"}
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = 'none'
                e.currentTarget.parentNode.textContent = '🏢'
              }}
            />
          </div>
          <div>
            <strong>{condominio?.name || 'Gestión y Finanzas'}</strong>
            <small>P&P Admin</small>
          </div>
        </div>

        <nav className="sidebar-nav">
          {enlaces.map((e) => (
            <NavLink
              key={e.to}
              to={e.to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'activo' : ''}`}
            >
              <span aria-hidden="true">{e.icono}</span>
              {e.texto}
            </NavLink>
          ))}

          {/* BOTÓN GLOBAL DE CENTRO DE AYUDA (ESCRITORIO) */}
          <button
            type="button"
            className="sidebar-link"
            onClick={() => setAyudaAbierta(true)}
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <span aria-hidden="true">💡</span>
            Ayuda y soporte
          </button>
        </nav>

        <div className="sidebar-pie">
          <NavLink to="/perfil" className="usuario-info usuario-enlace">
            {perfil?.avatar_url ? (
              <img src={perfil.avatar_url} alt="" className="usuario-avatar" />
            ) : (
              <span className="usuario-avatar-vacio" aria-hidden="true">👤</span>
            )}
            <div style={{ minWidth: 0 }}>
            <strong>{perfil?.full_name}</strong>
            <small>
              {(esAdmin || esSupervisor) && (
                <span className={`chip ${esAdmin ? 'chip-admin' : 'chip-supervisor'}`}>
                  {descripcionRol}
                </span>
              )}
              {!esAdmin && !esSupervisor && descripcionRol}
            </small>
            </div>
          </NavLink>
          <button className="btn-salir" onClick={salir}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <header className="header-movil">
        <div className="header-marca">
          <div className="header-logo">
            <img
              src={condominio?.logo_url || "/icon-192.png"}
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = 'none'
                e.currentTarget.parentNode.textContent = '🏢'
              }}
            />
          </div>
          <div>
            <strong>{condominio?.name || 'Gestión y Finanzas'}</strong>
            <small>P&P Admin</small>
          </div>
        </div>
        <div className="header-derecha">
          <LimiteError silencioso>
            <Campana />
          </LimiteError>
        </div>
        {menuAbierto && (
          <>
            <div className="menu-fondo" onClick={() => setMenuAbierto(false)} />
            <div className="menu-desplegable">
              <div className="menu-usuario">
                <strong>{perfil?.full_name}</strong>
                <small>
                  {(esAdmin || esSupervisor) && (
                    <span className={`chip ${esAdmin ? 'chip-admin' : 'chip-supervisor'}`}>
                      {descripcionRol}
                    </span>
                  )}
                  {!esAdmin && !esSupervisor && descripcionRol}
                </small>
              </div>

              <nav className="menu-nav">
                {enlaces.map((e) => (
                  <NavLink
                    key={e.to}
                    to={e.to}
                    className={({ isActive }) =>
                      `menu-item menu-item-nav ${isActive ? 'activo' : ''}`
                    }
                    onClick={() => setMenuAbierto(false)}
                  >
                    <span aria-hidden="true">{e.icono}</span>
                    {e.texto}
                  </NavLink>
                ))}

                {/* BOTÓN GLOBAL DE CENTRO DE AYUDA (MÓVIL) */}
                <button
                  type="button"
                  className="menu-item menu-item-nav"
                  onClick={() => {
                    setMenuAbierto(false)
                    setAyudaAbierta(true)
                  }}
                >
                  <span aria-hidden="true">💡</span>
                  Ayuda y soporte
                </button>
              </nav>

              <div className="menu-separador" />

              <NavLink
                to="/perfil"
                className="menu-item menu-item-nav"
                onClick={() => setMenuAbierto(false)}
              >
                <span aria-hidden="true">👤</span>
                Mi perfil
              </NavLink>
              <button
                className="menu-item menu-item-nav"
                onClick={() => {
                  setMenuAbierto(false)
                  window.location.reload()
                }}
              >
                <span aria-hidden="true">🔄</span>
                Recargar datos
              </button>
              <button className="menu-item menu-item-nav menu-item-salir" onClick={salir}>
                <span aria-hidden="true">🚪</span>
                Cerrar sesión
              </button>
            </div>
          </>
        )}
      </header>

      <main className="main-content">
        <div className="campana-escritorio">
          <LimiteError silencioso>
            <Campana />
          </LimiteError>
        </div>
        <div className="content-wrapper">
          <Outlet />
        </div>
      </main>

      <nav className="nav-inferior">
        {enlaces.slice(0, 2).map((e) => (
          <NavLink
            key={e.to}
            to={e.to}
            className={({ isActive }) => `nav-inferior-item ${isActive ? 'activo' : ''}`}
          >
            <span className="icono" aria-hidden="true">
              {e.icono}
            </span>
            {e.texto}
          </NavLink>
        ))}
        <button
          className={`nav-inferior-item nav-inferior-menu ${menuAbierto ? 'activo' : ''}`}
          onClick={() => setMenuAbierto((v) => !v)}
          aria-label="Más opciones"
          aria-expanded={menuAbierto}
        >
          <span className="icono" aria-hidden="true">☰</span>
          Menú
        </button>
      </nav>

      <CentroAyuda 
        abierto={ayudaAbierta} 
        onCerrar={() => setAyudaAbierta(false)} 
      />
    </div>
  )
}
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Campana from './Campana'

export default function Layout() {
  const { perfil, esAdmin, cerrarSesion, unidades, finanzasPublicas } = useAuth()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const navigate = useNavigate()

  const enlaces = esAdmin
    ? [
        { to: '/panel', icono: '📊', texto: 'Panel' },
        { to: '/unidades', icono: '🏢', texto: 'Unidades' },
        { to: '/cobranza', icono: '📄', texto: 'Cobranza' },
        { to: '/pagos', icono: '💵', texto: 'Pagos' },
        { to: '/tesoreria', icono: '🏦', texto: 'Tesorería' },
        { to: '/configuracion', icono: '⚙️', texto: 'Ajustes' },
      ]
    : [
        { to: '/mi-cuenta', icono: '📄', texto: 'Mi cuenta' },
        { to: '/reportar-pago', icono: '💵', texto: 'Reportar pago' },
        { to: '/panel', icono: '📊', texto: 'Transparencia' },
        { to: '/unidades', icono: '🏢', texto: 'Unidades' },
      ]

  const salir = async () => {
    await cerrarSesion()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-marca">
          <div className="sidebar-logo">
            <img
              src="/logo.png"
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = 'none'
                e.currentTarget.parentNode.textContent = '🏢'
              }}
            />
          </div>
          <div>
            <strong>Gestión y Finanzas</strong>
            <small>Condominio Vecinal C4</small>
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
              {esAdmin
                ? 'Administrador'
                : unidades.length === 1
                ? `Apto. ${unidades[0].code}`
                : `${unidades.length} apartamentos`}
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
              src="/logo.png"
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = 'none'
                e.currentTarget.parentNode.textContent = '🏢'
              }}
            />
          </div>
          <div>
            <strong>Gestión y Finanzas</strong>
            <small>Condominio Vecinal C4</small>
          </div>
        </div>
        <div className="header-derecha">
          <Campana />
          <button
          className="hamburguesa"
          onClick={() => setMenuAbierto((v) => !v)}
          aria-label="Menú"
          aria-expanded={menuAbierto}
        >
          ☰
        </button>
        </div>
        {menuAbierto && (
          <div className="menu-desplegable">
            <div className="menu-usuario">
              <strong>{perfil?.full_name}</strong>
              <small>{esAdmin ? 'Administrador' : 'Residente'}</small>
            </div>
            <NavLink to="/perfil" className="menu-item menu-item-normal" onClick={() => setMenuAbierto(false)}>
              Mi perfil
            </NavLink>
            <button className="menu-item" onClick={salir}>
              Cerrar sesión
            </button>
          </div>
        )}
      </header>

      <main className="main-content">
        <div className="campana-escritorio">
          <Campana />
        </div>
        <div className="content-wrapper">
          <Outlet />
        </div>
      </main>

      <nav className="nav-inferior">
        {enlaces.slice(0, 5).map((e) => (
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
      </nav>
    </div>
  )
}

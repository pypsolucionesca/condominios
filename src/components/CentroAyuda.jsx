import React from 'react'

export default function CentroAyuda({ abierto, onCerrar }) {
  if (!abierto) return null

  // Estilos integrados para garantizar que el modal se vea bien sin depender de CSS externo
  const estilos = {
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.7)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    },
    modal: {
      backgroundColor: '#ffffff',
      borderRadius: '12px',
      width: '100%',
      maxWidth: '450px',
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    },
    cabecera: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '16px 24px',
      borderBottom: '1px solid #e2e8f0',
      backgroundColor: '#f8fafc'
    },
    titulo: {
      margin: 0,
      fontSize: '1.25rem',
      fontWeight: '700',
      color: '#0f172a'
    },
    btnCerrar: {
      background: 'none',
      border: 'none',
      fontSize: '1.5rem',
      color: '#64748b',
      cursor: 'pointer',
      padding: '0',
      lineHeight: '1'
    },
    cuerpo: {
      padding: '24px'
    },
    seccion: {
      marginBottom: '24px'
    },
    subtitulo: {
      margin: '0 0 12px 0',
      fontSize: '1rem',
      fontWeight: '600',
      color: '#334155'
    },
    texto: {
      margin: '0 0 16px 0',
      fontSize: '0.9rem',
      color: '#475569',
      lineHeight: '1.5'
    },
    botonesGrid: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    },
    btnWa: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      backgroundColor: '#25D366',
      color: '#ffffff',
      padding: '12px',
      borderRadius: '8px',
      textDecoration: 'none',
      fontWeight: '600',
      fontSize: '0.95rem',
      border: 'none',
      transition: 'background-color 0.2s'
    },
    btnEmail: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      backgroundColor: '#f1f5f9',
      color: '#334155',
      padding: '12px',
      borderRadius: '8px',
      textDecoration: 'none',
      fontWeight: '600',
      fontSize: '0.95rem',
      border: '1px solid #e2e8f0',
      transition: 'background-color 0.2s'
    },
    separador: {
      border: 'none',
      borderTop: '1px solid #e2e8f0',
      margin: '0 0 24px 0'
    },
    acercaDe: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      backgroundColor: '#f8fafc',
      padding: '20px',
      borderRadius: '8px',
      border: '1px solid #e2e8f0'
    },
    logo: {
      height: '50px',
      width: 'auto',
      marginBottom: '12px'
    },
    appName: {
      fontSize: '1.1rem',
      fontWeight: '800',
      color: '#0f172a',
      letterSpacing: '-0.02em',
      marginBottom: '4px'
    },
    version: {
      fontSize: '0.8rem',
      color: '#64748b',
      fontWeight: '600',
      backgroundColor: '#e2e8f0',
      padding: '2px 8px',
      borderRadius: '9999px',
      marginBottom: '12px'
    },
    textoLegal: {
      margin: 0,
      fontSize: '0.8rem',
      color: '#64748b',
      lineHeight: '1.5'
    }
  }

  return (
    <div style={estilos.overlay} onClick={onCerrar}>
      <div style={estilos.modal} onClick={(e) => e.stopPropagation()}>
        <div style={estilos.cabecera}>
          <h2 style={estilos.titulo}>Ayuda y Soporte</h2>
          <button style={estilos.btnCerrar} onClick={onCerrar} aria-label="Cerrar ventana">
            &times;
          </button>
        </div>

        <div style={estilos.cuerpo}>
          
          <div style={estilos.seccion}>
            <h3 style={estilos.subtitulo}>¿Problemas con la plataforma?</h3>
            <p style={estilos.texto}>
              Comunícate directamente con nuestro equipo de soporte técnico para generar un reporte o resolver cualquier inconveniente.
            </p>
            <div style={estilos.botonesGrid}>
              <a 
                href="https://wa.me/584126156961" 
                target="_blank" 
                rel="noopener noreferrer" 
                style={estilos.btnWa}
              >
                <span aria-hidden="true">💬</span> Contactar por WhatsApp
              </a>
              <a 
                href="mailto:soporte@pypcloud.com" 
                style={estilos.btnEmail}
              >
                <span aria-hidden="true">✉️</span> soporte@pypcloud.com
              </a>
            </div>
          </div>

          <hr style={estilos.separador} />

          <div style={estilos.seccion} style={{ marginBottom: 0 }}>
            <h3 style={estilos.subtitulo}>Acerca de</h3>
            <div style={estilos.acercaDe}>
              <img 
                src="/logo-login.png" 
                alt="PyP Condominios" 
                style={estilos.logo} 
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
              <span style={estilos.appName}>
                PyP <span style={{ color: '#f97316' }}>Condominios</span>
              </span>
              <span style={estilos.version}>Versión 1.0.0</span>
              <p style={estilos.textoLegal}>
                Desarrollado y mantenido por <strong>P&P Soluciones</strong>.<br />
                © 2026 Todos los derechos reservados.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
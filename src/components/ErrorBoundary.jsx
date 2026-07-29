import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { tieneError: false }
  }

  static getDerivedStateFromError(error) {
    // Actualiza el estado para que la próxima renderización muestre la UI de repuesto
    return { tieneError: true }
  }

  componentDidCatch(error, info) {
    // Aquí podrías enviar el error a un servicio de monitoreo en el futuro
    console.error('Colapso de UI evitado por ErrorBoundary:', error, info)
  }

  recargarApp = () => {
    // Limpia la URL y fuerza una recarga total ignorando el caché actual
    window.location.href = window.location.origin + '?reload=' + new Date().getTime()
  }

  render() {
    if (this.state.tieneError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '20px', textAlign: 'center', fontFamily: 'system-ui, sans-serif', backgroundColor: '#f8fafc' }}>
          <span style={{ fontSize: '3rem', marginBottom: '16px' }} aria-hidden="true">🔄</span>
          <h2 style={{ color: '#0f172a', margin: '0 0 12px 0', fontSize: '1.5rem' }}>Actualización requerida</h2>
          <p style={{ color: '#475569', marginBottom: '24px', maxWidth: '300px', lineHeight: '1.5' }}>
            El sistema se ha actualizado y requiere refrescar los datos almacenados en su dispositivo para continuar.
          </p>
          <button 
            onClick={this.recargarApp}
            style={{ padding: '14px 28px', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '1rem', cursor: 'pointer', fontWeight: '600', width: '100%', maxWidth: '250px' }}
          >
            Sincronizar sistema
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
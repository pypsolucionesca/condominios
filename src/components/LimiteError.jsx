import { Component } from 'react'

/**
 * Impide que el fallo de un componente deje toda la página en blanco.
 *
 * React desmonta el árbol completo cuando un componente lanza una
 * excepción no capturada. Envolviendo las partes accesorias —la campana,
 * un gráfico— se contiene el daño: falla ese recuadro y el resto de la
 * aplicación sigue utilizable.
 */
export default class LimiteError extends Component {
  constructor(props) {
    super(props)
    this.state = { fallo: false }
  }

  static getDerivedStateFromError() {
    return { fallo: true }
  }

  componentDidCatch(error, info) {
    console.error('Fallo contenido en', this.props.nombre || 'componente', error, info)
  }

  render() {
    if (this.state.fallo) {
      if (this.props.silencioso) return null

      return (
        <div className="alerta alerta-aviso">
          No se pudo cargar {this.props.nombre || 'esta sección'}. El resto del sistema
          funciona con normalidad.
        </div>
      )
    }

    return this.props.children
  }
}

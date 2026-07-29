import { Link } from 'react-router-dom'

export default function Terminos() {
  return (
    <div className="login-container" style={{ alignItems: 'flex-start', padding: '40px 20px', overflowY: 'auto' }}>
      <div className="login-box" style={{ maxWidth: 800, width: '100%' }}>
        <h2 style={{ color: 'var(--primary-color)', marginBottom: 20 }}>Términos y Condiciones de Uso</h2>
        <small className="texto-ayuda" style={{ display: 'block', marginBottom: 20 }}>Última actualización: Julio 2026</small>

        <div style={{ textAlign: 'left', fontSize: '0.95rem', lineHeight: '1.6', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p>
            Bienvenido a <strong>P&P Admin</strong>. Al registrar una empresa o condominio en nuestra plataforma (a través de condominios.pypcloud.com o dominios asociados), usted acepta cumplir y estar sujeto a los siguientes términos y condiciones de uso.
          </p>

          <h3 style={{ fontSize: '1.1rem', marginTop: 10 }}>1. Concesión de Licencia</h3>
          <p>
            P&P Soluciones le otorga una licencia temporal, revocable, no exclusiva e intransferible para utilizar el software como una herramienta de gestión administrativa y contable. El código fuente, la interfaz y la marca son propiedad intelectual exclusiva de P&P Soluciones. Queda prohibida su reventa, ingeniería inversa o modificación.
          </p>

          <h3 style={{ fontSize: '1.1rem', marginTop: 10 }}>2. Exoneración de Responsabilidad Financiera</h3>
          <p>
            P&P Admin es una herramienta tecnológica de registro y cálculo automatizado. <strong>P&P Soluciones no asume ninguna responsabilidad legal o financiera</strong> por errores humanos en la carga de datos por parte del administrador, diferencias en los cálculos derivados de variaciones en las tasas cambiarias oficiales externas (como el BCV), ni por disputas legales internas entre copropietarios o juntas de condominio.
          </p>

          <h3 style={{ fontSize: '1.1rem', marginTop: 10 }}>3. Disponibilidad del Servicio</h3>
          <p>
            Nos esforzamos por mantener la plataforma operativa el 100% del tiempo utilizando infraestructura en la nube de alta disponibilidad. Sin embargo, no garantizamos que el servicio esté libre de interrupciones temporales por labores de mantenimiento o fallas ajenas a nuestro control.
          </p>

          <div style={{ marginTop: 30, textAlign: 'center', borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
            <Link to="/registro" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
              Volver al Registro
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
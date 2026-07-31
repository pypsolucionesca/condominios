import { Link } from 'react-router-dom'

export default function Privacidad() {
  return (
    <div className="login-container" style={{ alignItems: 'flex-start', padding: '40px 20px', overflowY: 'auto' }}>
      <div className="login-box" style={{ maxWidth: 800, width: '100%' }}>
        <h2 style={{ color: 'var(--primary-color)', marginBottom: 20 }}>Política de Privacidad</h2>
        <small className="texto-ayuda" style={{ display: 'block', marginBottom: 20 }}>Última actualización: Julio 2026</small>

        <div style={{ textAlign: 'left', fontSize: '0.95rem', lineHeight: '1.6', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p>
            En <strong>P&P Soluciones</strong> valoramos y protegemos la privacidad de los datos de nuestros usuarios y de los residentes que hacen vida en los condominios administrados mediante <strong>PyP Condominios</strong>.
          </p>

          <h3 style={{ fontSize: '1.1rem', marginTop: 10 }}>1. Información que Recopilamos</h3>
          <p>
            Recopilamos información básica de registro (nombre, correo electrónico) y datos operativos necesarios para la administración del condominio (nombres de propietarios, números de cédula/RIF, teléfonos y registros de pagos o transacciones financieras).
          </p>

          <h3 style={{ fontSize: '1.1rem', marginTop: 10 }}>2. Uso de la Información</h3>
          <p>
            Los datos ingresados son utilizados estrictamente para la emisión de recibos de cobro, reportes de tesorería y comunicación interna del condominio. <strong>P&P Soluciones nunca comercializará, cederá ni compartirá bases de datos</strong> con terceros con fines publicitarios o comerciales.
          </p>

          <h3 style={{ fontSize: '1.1rem', marginTop: 10 }}>3. Seguridad de los Datos</h3>
          <p>
            Implementamos protocolos de seguridad estándar de la industria (encriptación y políticas de acceso restringido por filas en bases de datos) para salvaguardar la información contra accesos no autorizados.
          </p>

          <h3 style={{ fontSize: '1.1rem', marginTop: 10 }}>4. Acceso y Responsabilidad de Terceros</h3>
          <p>
            Usted comprende que la junta de condominio y/o la administración de su residencia tienen acceso legítimo a sus datos financieros y de contacto dentro de la plataforma para ejercer la gestión de cobranza. <strong>P&P Soluciones no es responsable</strong> del manejo, distribución o uso indebido que dichos administradores den a esta información fuera del ecosistema del software.
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
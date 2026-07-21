import React from 'react';
import '../styles/global.css';

export default function Sidebar({ vista, setVista }) {
  return (
    <>
      <style>{`
        /* --- ESTILOS BASE (ESCRITORIO) --- */
        .sidebar { 
          width: 280px; 
          background-color: var(--sidebar-bg); 
          color: #f8fafc; 
          display: flex; 
          flex-direction: column; 
          padding: 25px 0; 
          position: fixed; 
          height: 100vh; 
          overflow-y: auto; 
          overflow-x: hidden; 
          z-index: 10; 
          box-shadow: 2px 0 10px rgba(0,0,0,0.1);
        }
        
        .sidebar::-webkit-scrollbar { width: 6px; }
        .sidebar::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,0.1); border-radius: 10px; }
        
        .sidebar-header { 
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center; 
          padding: 0 15px 20px 15px; 
          border-bottom: 1px solid rgba(255,255,255,0.05); 
          margin-bottom: 15px; 
        }
        
        .sidebar-header img { 
          width: 150px;      
          height: 150px; 
          object-fit: cover; 
          border-radius: 50%; 
          background: white; 
          padding: 5px;
          border: 3px solid rgba(255,255,255,0.1);
          margin-bottom: 2px; /* Espacio reducido al mínimo para pegar el texto */
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        
        .sidebar-header h1 { 
          font-size: 1.25rem; 
          font-weight: 800; 
          color: #f8fafc; 
          line-height: 1.2; 
          margin-top: 0;
          margin-bottom: 6px; 
          letter-spacing: -0.5px;
        }
        
        .sidebar-header h2 { 
          font-size: 0.85rem; 
          font-weight: 400; 
          color: #94a3b8; 
          line-height: 1.3;
        }

        .nav-menu { 
          display: flex; 
          flex-direction: column; 
          width: 100%; 
        }
        
        .nav-btn { 
          padding: 15px 25px; 
          text-align: left; 
          background: transparent; 
          border: none; 
          color: #cbd5e1; 
          font-size: 1rem; 
          cursor: pointer; 
          transition: all 0.2s; 
          border-left: 4px solid transparent; 
          width: 100%; 
        }
        
        .nav-btn:hover { 
          background: rgba(255,255,255,0.05); 
          color: white; 
        }
        
        .nav-btn.active { 
          background: rgba(255,255,255,0.05); 
          color: var(--sidebar-active); 
          border-left: 4px solid var(--sidebar-active); 
          font-weight: 600; 
        }

        /* --- DISEÑO RESPONSIVO (MÓVILES Y TABLETS) --- */
        @media (max-width: 768px) {
          .sidebar { 
            width: 100%; 
            height: auto; 
            position: static; 
            padding: 15px 0 0 0; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          
          .sidebar-header { 
            flex-direction: row; 
            justify-content: flex-start;
            text-align: left;
            padding: 0 20px 15px 20px; 
            gap: 15px; 
            border-bottom: none;
            margin-bottom: 5px;
          }
          
          .sidebar-header img { 
            width: 65px; 
            height: 65px; 
            margin-bottom: 0;
          }
          
          .sidebar-header h1 { font-size: 1.15rem; margin-bottom: 2px; }
          .sidebar-header h2 { font-size: 0.8rem; }
          
          .nav-menu { 
            flex-direction: row; 
            overflow-x: auto; 
            flex-wrap: nowrap; 
            border-top: 1px solid rgba(255,255,255,0.05);
            scrollbar-width: none; 
          }
          .nav-menu::-webkit-scrollbar { display: none; }
          
          .nav-btn { 
            width: auto; 
            padding: 12px 20px; 
            border-left: none; 
            border-bottom: 3px solid transparent; 
            white-space: nowrap; 
            font-size: 0.95rem; 
          }
          
          .nav-btn.active { 
            border-left: none; 
            border-bottom: 3px solid var(--sidebar-active); 
          }
        }
      `}</style>

      <aside className="sidebar">
        <div className="sidebar-header">
          <img src="/logo.png" alt="Logo PyP SGF" onError={(e) => { e.target.style.display = 'none' }} />
          <div>
            <h1>Sistema de Gestión<br/>y Finanzas</h1>
            <h2>Condominio Vecinal C4<br/>Juan Pablo II</h2>
          </div>
        </div>
        <nav className="nav-menu">
          <button className={`nav-btn ${vista === 'propietarios' ? 'active' : ''}`} onClick={() => setVista('propietarios')}>Locales y Propietarios</button>
          <button className={`nav-btn ${vista === 'cuentas' ? 'active' : ''}`} onClick={() => setVista('cuentas')}>Bancos y Cajas</button>
          <button className={`nav-btn ${vista === 'facturacion' ? 'active' : ''}`} onClick={() => setVista('facturacion')}>Facturación Mensual</button>
          <button className={`nav-btn ${vista === 'pagos' ? 'active' : ''}`} onClick={() => setVista('pagos')}>Ingresos (Pagos)</button>
          <button className={`nav-btn ${vista === 'gastos' ? 'active' : ''}`} onClick={() => setVista('gastos')}>Egresos Operativos</button>
        </nav>
      </aside>
    </>
  );
}
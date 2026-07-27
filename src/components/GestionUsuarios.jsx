import { useEffect, useState, useCallback } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { etiqueta } from '../lib/formato'
import { Confirmar, Aviso, Cargador, MenuAcciones, Panel } from './UI'

/**
 * Gestión de usuarios y roles (solo administrador).
 *
 * Lista a todos los usuarios del condominio y permite cambiar su rol
 * usando las funciones del backend, todas auditadas:
 *   - promover un residente a supervisor / degradar supervisor
 *   - poner o quitar la restricción a un residente
 *   - transferir la titularidad de administrador
 *
 * El modelo de roles (estilo Active Directory):
 *   Administrador · gobierna    Supervisor · opera
 *   Residente · su unidad       Residente restringido · sin tesorería
 */

const ROL_ETIQUETA = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  resident: 'Residente',
  residente_restringido: 'Residente restringido',
}

const ROL_COLOR = {
  admin: 'chip-admin',
  supervisor: 'chip-supervisor',
  resident: 'chip-residente',
  residente_restringido: 'chip-restringido',
}

// ------------------------------------------------------------------
// Funciones de formateo en tiempo real
// ------------------------------------------------------------------

const capitalizarNombres = (texto) => {
  if (!texto) return ''
  return texto
    .toLowerCase()
    .split(' ')
    .map(palabra => palabra.charAt(0).toUpperCase() + palabra.slice(1))
    .join(' ')
}

const formatearCedula = (texto) => {
  if (!texto) return ''
  const limpio = texto.toUpperCase().replace(/[^VEJGP0-9]/g, '')
  const match = limpio.match(/^([VEJGP])?(\d+)$/)
  
  if (!match) return limpio
  const letra = match[1] || ''
  const numeros = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  
  return letra ? `${letra}-${numeros}` : numeros
}

const formatearTelefono = (texto) => {
  if (!texto) return ''
  const limpio = texto.replace(/\D/g, '')
  if (limpio.length <= 4) return limpio
  return `${limpio.slice(0, 4)}-${limpio.slice(4, 11)}`
}

export default function GestionUsuarios() {
  const { perfil, esAdmin } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  
  // Estados para invitar
  const [panelInvitar, setPanelInvitar] = useState(false)
  const [formInvitar, setFormInvitar] = useState({ email: '', full_name: '', role: 'supervisor' })
  const [invitando, setInvitando] = useState(false)

  // Estados para editar perfil
  const [panelEditar, setPanelEditar] = useState(false)
  const [formEditar, setFormEditar] = useState({ id: '', full_name: '', national_id: '', phone: '', email: '' })
  const [editando, setEditando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const { data, error: err } = await supabase.rpc('usuarios_con_correo')
      if (err) throw err
      setUsuarios(data || [])
      setError(null)
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Invita a un nuevo administrador o supervisor.
  const invitarUsuario = async (e) => {
    e.preventDefault()
    setError(null)
    setAviso(null)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formInvitar.email.trim())) {
      return setError('Ingrese un correo electrónico válido.')
    }
    if (!formInvitar.full_name.trim()) {
      return setError('Ingrese el nombre del usuario.')
    }

    setInvitando(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('La sesión expiró. Vuelva a iniciar sesión.')

      const resp = await supabase.functions.invoke('invitar-residente', {
        body: {
          email: formInvitar.email.trim(),
          full_name: formInvitar.full_name.trim(),
          role: formInvitar.role,
          origin: window.location.origin,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (resp.error) {
        let detalle = resp.error.message
        try {
          const cuerpo = await resp.error.context?.json?.()
          if (cuerpo?.error) detalle = cuerpo.error
        } catch {
          /* el cuerpo no era JSON */
        }
        throw new Error(detalle)
      }
      if (resp.data?.error) throw new Error(resp.data.error)

      setAviso(resp.data.mensaje)
      setPanelInvitar(false)
      setFormInvitar({ email: '', full_name: '', role: 'supervisor' })
      await cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setInvitando(false)
    }
  }

  // Edita los datos de perfil del usuario (nombre, cédula, teléfono)
  const guardarEdicion = async (e) => {
    e.preventDefault()
    setError(null)
    setAviso(null)

    if (!formEditar.full_name.trim()) {
      return setError('El nombre no puede estar vacío.')
    }

    setEditando(true)
    try {
      const { error: err } = await supabase
        .from('profiles')
        .update({
          full_name: formEditar.full_name.trim(),
          national_id: formEditar.national_id?.trim() || null,
          phone: formEditar.phone?.trim() || null,
        })
        .eq('id', formEditar.id)

      if (err) throw err

      setAviso('Datos del residente actualizados correctamente.')
      setPanelEditar(false)
      await cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEditando(false)
    }
  }

  // Ejecuta una RPC de gestión y refresca la lista
  const ejecutar = async (rpc, params, mensajeOk) => {
    setError(null)
    setAviso(null)
    try {
      const { error: err } = await supabase.rpc(rpc, params)
      if (err) throw err
      setAviso(mensajeOk)
      await cargar()
    } catch (err) {
      setError(mensajeError(err))
    }
    setConfirmar(null)
  }

  // Función para desvincular a un residente de todas sus unidades
  const ejecutarDesvinculacion = async (userId) => {
    setError(null)
    setAviso(null)
    try {
      const { error: err } = await supabase
        .from('unit_members')
        .delete()
        .eq('user_id', userId)

      if (err) throw err
      setAviso('El residente ha sido desvinculado de la unidad correctamente.')
      await cargar()
    } catch (err) {
      setError(mensajeError(err))
    }
    setConfirmar(null)
  }

  if (!esAdmin) {
    return (
      <div className="card">
        <h2 className="card-header">Usuarios</h2>
        <p className="texto-ayuda">Solo el administrador puede gestionar usuarios.</p>
      </div>
    )
  }

  if (cargando) return <Cargador texto="Cargando usuarios…" />

  // Acciones disponibles según el rol de cada usuario
  const accionesDe = (u) => {
    const acc = []

    acc.push({
      icono: '✏️',
      texto: 'Editar datos',
      onClick: () => {
        setFormEditar({ 
          id: u.id, 
          full_name: u.full_name || '', 
          national_id: u.national_id || '',
          phone: u.phone || '',
          email: u.email || ''
        })
        setPanelEditar(true)
      },
    })

    if (u.id === perfil?.id) return acc 

    if (u.role === 'resident' || u.role === 'residente_restringido') {
      acc.push({
        icono: '🚪',
        texto: 'Desvincular de unidad',
        onClick: () =>
          setConfirmar({
            titulo: 'Desvincular residente',
            mensaje: `¿Está seguro de que desea remover a ${u.full_name} de su unidad? Ya no podrá ver los estados de cuenta correspondientes ni reportar pagos para ella. Su cuenta seguirá existiendo en el sistema.`,
            texto: 'Sí, desvincular',
            peligro: true,
            accion: () => ejecutarDesvinculacion(u.id),
          }),
      })

      acc.push({
        icono: '⬆️',
        texto: 'Hacer supervisor',
        onClick: () =>
          setConfirmar({
            titulo: 'Promover a supervisor',
            mensaje: `${u.full_name} podrá operar el sistema (confirmar pagos, emitir avisos, registrar gastos), pero no gestionar usuarios ni exonerar. ¿Continuar?`,
            texto: 'Hacer supervisor',
            accion: () =>
              ejecutar('promote_to_supervisor', { p_user_id: u.id }, `${u.full_name} ahora es supervisor.`),
          }),
      })
    }

    if (u.role === 'resident') {
      acc.push({
        icono: '🔒',
        texto: 'Restringir acceso',
        onClick: () =>
          ejecutar('set_resident_restriction', { p_user_id: u.id, p_restringido: true },
            `${u.full_name} ahora tiene acceso restringido.`),
      })
    }

    if (u.role === 'residente_restringido') {
      acc.push({
        icono: '🔓',
        texto: 'Quitar restricción',
        onClick: () =>
          ejecutar('set_resident_restriction', { p_user_id: u.id, p_restringido: false },
            `Se quitó la restricción a ${u.full_name}.`),
      })
    }

    if (u.role === 'supervisor') {
      acc.push({
        icono: '⬇️',
        texto: 'Quitar supervisor',
        onClick: () =>
          setConfirmar({
            titulo: 'Degradar supervisor',
            mensaje: `${u.full_name} volverá a ser residente y perderá el acceso de operación. ¿Continuar?`,
            texto: 'Degradar',
            peligro: true,
            accion: () =>
              ejecutar('demote_supervisor', { p_user_id: u.id }, `${u.full_name} vuelve a ser residente.`),
          }),
      })
      acc.push({
        icono: '👑',
        texto: 'Transferir administración',
        onClick: () =>
          setConfirmar({
            titulo: 'Transferir administración',
            mensaje: `${u.full_name} pasará a ser el ADMINISTRADOR del condominio, con todos los poderes. Usted quedará como supervisor. Esta acción es delicada y queda registrada. ¿Está seguro?`,
            texto: 'Sí, transferir',
            peligro: true,
            accion: () =>
              ejecutar('transfer_admin', { p_new_admin_id: u.id },
                `Administración transferida a ${u.full_name}. Usted es ahora supervisor.`),
          }),
      })
    }

    return acc
  }

  return (
    <div className="card">
      <div className="card-header-flex">
        <h2>Usuarios y roles</h2>
        <button
          type="button"
          className="btn btn-primary btn-auto"
          onClick={() => setPanelInvitar(true)}
        >
          + Invitar admin/supervisor
        </button>
      </div>
      <p className="texto-ayuda" style={{ marginBottom: 16 }}>
        Administrador gobierna · Supervisor opera · Residente ve su cuenta. Todos los
        cambios de rol quedan registrados.
      </p>

      {error && <Aviso tipo="error" onCerrar={() => setError(null)}>{error}</Aviso>}
      {aviso && <Aviso tipo="exito" onCerrar={() => setAviso(null)}>{aviso}</Aviso>}

      <ul className="list-group">
        {usuarios.map((u) => (
          <li 
            key={u.id} 
            className="list-item" 
            style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              padding: '10px 0', 
              gap: '12px' 
            }}
          >
            <span className="usuario-avatar-vacio" aria-hidden="true" style={{ flexShrink: 0, width: '36px', height: '36px', fontSize: '1rem' }}>
              {u.role === 'admin' ? '👑' : u.role === 'supervisor' ? '🛠️' : '👤'}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <strong style={{ fontSize: '0.95rem', display: 'block', marginBottom: '3px' }}>
                {u.full_name}
                {u.id === perfil?.id && <span className="texto-ayuda" style={{ display: 'inline', marginLeft: '4px' }}>· usted</span>}
              </strong>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' }}>
                <span className={`chip ${ROL_COLOR[u.role] || ''}`} style={{ padding: '2px 8px', fontSize: '0.68rem' }}>
                  {ROL_ETIQUETA[u.role] || u.role}
                </span>
                {u.cuenta_activa ? (
                  <span className="chip chip-exito" style={{ padding: '2px 8px', fontSize: '0.68rem' }}>✓ Activo</span>
                ) : (
                  <span className="chip chip-aviso" style={{ padding: '2px 8px', fontSize: '0.68rem' }}>Pendiente</span>
                )}
                {!u.is_active && <span className="chip chip-inactivo" style={{ padding: '2px 8px', fontSize: '0.68rem' }}>Inactivo</span>}
              </div>

              <small style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                {[
                  u.national_id ? `C.I.: ${formatearCedula(u.national_id)}` : null,
                  u.phone ? `Telf.: ${formatearTelefono(u.phone)}` : null
                ].filter(Boolean).join(' · ')}
              </small>
              
              {u.email && <small className="usuario-correo" style={{ display: 'block', fontSize: '0.78rem', marginTop: '1px' }}>{u.email}</small>}
            </div>
            
            <div 
              className="list-item-derecha" 
              style={{ 
                width: 'auto', 
                flexDirection: 'column', 
                alignItems: 'flex-end', 
                flexShrink: 0 
              }}
            >
              {accionesDe(u).length > 0 && <MenuAcciones acciones={accionesDe(u)} />}
            </div>
          </li>
        ))}
      </ul>

      <Confirmar
        abierto={Boolean(confirmar)}
        titulo={confirmar?.titulo}
        mensaje={confirmar?.mensaje}
        textoConfirmar={confirmar?.texto}
        peligro={confirmar?.peligro}
        onConfirmar={confirmar?.accion}
        onCancelar={() => setConfirmar(null)}
      />

      {/* Panel para invitar admin/supervisor */}
      <Panel
        abierto={panelInvitar}
        titulo="Invitar administrador o supervisor"
        onCerrar={() => setPanelInvitar(false)}
        ancho={480}
      >
        <form onSubmit={invitarUsuario}>
          <p className="texto-ayuda" style={{ marginBottom: 16 }}>
            Estos roles operan el sistema y no se vinculan a una unidad. Se enviará una
            invitación al correo para que la persona defina su contraseña.
          </p>

          {error && (
            <Aviso tipo="error" onCerrar={() => setError(null)}>
              {error}
            </Aviso>
          )}

          <div className="form-group">
            <label>Correo electrónico *</label>
            <input
              type="email"
              className="form-control"
              value={formInvitar.email}
              onChange={(e) => setFormInvitar({ ...formInvitar, email: e.target.value })}
              placeholder="nombre@correo.com"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Nombre completo *</label>
            <input
              className="form-control"
              value={formInvitar.full_name}
              onChange={(e) => setFormInvitar({ ...formInvitar, full_name: capitalizarNombres(e.target.value) })}
              placeholder="Nombre y apellido"
            />
          </div>

          <div className="form-group">
            <label>Rol *</label>
            <select
              className="form-control"
              value={formInvitar.role}
              onChange={(e) => setFormInvitar({ ...formInvitar, role: e.target.value })}
            >
              <option value="supervisor">Supervisor · opera el sistema</option>
              <option value="admin">Administrador · gobierna</option>
            </select>
            <small className="texto-ayuda">
              {formInvitar.role === 'admin'
                ? 'Podrá gestionar usuarios, exonerar, borrar y configurar. Úselo con cuidado.'
                : 'Podrá confirmar pagos, registrar gastos y emitir avisos. No gestiona usuarios ni configuración.'}
            </small>
          </div>

          <div className="panel-acciones">
            <button
              type="button"
              className="btn btn-secundario"
              onClick={() => setPanelInvitar(false)}
            >
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={invitando}>
              {invitando ? 'Enviando…' : 'Enviar invitación'}
            </button>
          </div>
        </form>
      </Panel>

      {/* Panel para editar datos de usuario */}
      <Panel
        abierto={panelEditar}
        titulo="Editar datos del usuario"
        onCerrar={() => setPanelEditar(false)}
        ancho={480}
      >
        <form onSubmit={guardarEdicion}>
          <p className="texto-ayuda" style={{ marginBottom: 16 }}>
            Modifique los datos personales del residente. Para cambiar la relación con una unidad (Propietario/Inquilino), debe hacerlo desde la vista de la unidad.
          </p>

          {error && (
            <Aviso tipo="error" onCerrar={() => setError(null)}>
              {error}
            </Aviso>
          )}

          <div className="form-group">
            <label>Correo electrónico</label>
            <input
              type="email"
              className="form-control"
              value={formEditar.email}
              disabled
              style={{ backgroundColor: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed' }}
            />
            <small className="texto-ayuda">El correo está vinculado a la cuenta de autenticación en Supabase y no puede ser modificado por esta vía.</small>
          </div>

          <div className="form-group">
            <label>Nombre o Razón Social *</label>
            <input
              className="form-control"
              value={formEditar.full_name}
              onChange={(e) => setFormEditar({ ...formEditar, full_name: capitalizarNombres(e.target.value) })}
              placeholder="Nombre y apellido"
              autoFocus
            />
          </div>
          
          <div className="form-group">
            <label>Cédula / RIF</label>
            <input
              className="form-control"
              value={formEditar.national_id}
              onChange={(e) => setFormEditar({ ...formEditar, national_id: formatearCedula(e.target.value) })}
              placeholder="V-12.345.678"
            />
          </div>

          <div className="form-group">
            <label>Teléfono</label>
            <input
              className="form-control"
              value={formEditar.phone}
              onChange={(e) => setFormEditar({ ...formEditar, phone: formatearTelefono(e.target.value) })}
              placeholder="0414-1234567"
            />
          </div>

          <div className="panel-acciones">
            <button
              type="button"
              className="btn btn-secundario"
              onClick={() => setPanelEditar(false)}
            >
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={editando}>
              {editando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </Panel>
    </div>
  )
}
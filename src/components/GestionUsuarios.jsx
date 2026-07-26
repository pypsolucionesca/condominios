import { useEffect, useState, useCallback } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { etiqueta } from '../lib/formato'
import { Confirmar, Aviso, Cargador, MenuAcciones } from './UI'

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

export default function GestionUsuarios() {
  const { perfil, esAdmin } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [confirmar, setConfirmar] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      // usuarios_con_correo (SECURITY DEFINER, solo admin) trae el correo,
      // que vive en auth.users y no es accesible directamente desde el
      // cliente. Ya devuelve la lista ordenada por rol y nombre.
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
    if (u.id === perfil?.id) return [] // no puede cambiarse a sí mismo aquí
    const acc = []

    if (u.role === 'resident' || u.role === 'residente_restringido') {
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
      <h2 className="card-header">Usuarios y roles</h2>
      <p className="texto-ayuda" style={{ marginBottom: 16 }}>
        Administrador gobierna · Supervisor opera · Residente ve su cuenta. Todos los
        cambios de rol quedan registrados.
      </p>

      {error && <Aviso tipo="error" onCerrar={() => setError(null)}>{error}</Aviso>}
      {aviso && <Aviso tipo="exito" onCerrar={() => setAviso(null)}>{aviso}</Aviso>}

      <ul className="list-group">
        {usuarios.map((u) => (
          <li key={u.id} className="list-item">
            <span className="usuario-avatar-vacio" aria-hidden="true">
              {u.role === 'admin' ? '👑' : u.role === 'supervisor' ? '🛠️' : '👤'}
            </span>
            <div style={{ minWidth: 0 }}>
              <strong>
                {u.full_name}
                {u.id === perfil?.id && <span className="texto-ayuda"> · usted</span>}
              </strong>
              <small>
                <span className={`chip ${ROL_COLOR[u.role] || ''}`}>
                  {ROL_ETIQUETA[u.role] || u.role}
                </span>
                {!u.is_active && ' · inactivo'}
                {u.phone ? ` · ${u.phone}` : ''}
              </small>
              {u.email && <small className="usuario-correo">{u.email}</small>}
            </div>
            <div className="list-item-derecha">
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
    </div>
  )
}

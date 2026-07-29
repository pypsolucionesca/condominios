import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { normalizar } from '../lib/formato'
import { Confirmar, Aviso, Cargador, Panel, Vacio } from '../components/UI'

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

export default function Usuarios() {
  const { perfil, esAdmin } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  
  const [busqueda, setBusqueda] = useState('')
  const [filtroRol, setFiltroRol] = useState('')
  
  const [panelInvitar, setPanelInvitar] = useState(false)
  const [formInvitar, setFormInvitar] = useState({ email: '', full_name: '', role: 'supervisor' })
  const [invitando, setInvitando] = useState(false)

  // Estado unificado para el perfil del usuario
  const [panelUsuario, setPanelUsuario] = useState(false)
  const [usuarioActivo, setUsuarioActivo] = useState(null)
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

  const visibles = useMemo(() => {
    const q = normalizar(busqueda)
    return usuarios.filter(u => {
      if (filtroRol && u.role !== filtroRol) return false
      if (!q) return true
      return (
        normalizar(u.full_name).includes(q) ||
        normalizar(u.email).includes(q) ||
        normalizar(u.national_id).includes(q) ||
        normalizar(u.phone).includes(q)
      )
    })
  }, [usuarios, busqueda, filtroRol])

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

  const abrirPerfil = (u) => {
    setUsuarioActivo(u)
    setFormEditar({ 
      id: u.id, 
      full_name: u.full_name || '', 
      national_id: u.national_id || '',
      phone: u.phone || '',
      email: u.email || ''
    })
    setPanelUsuario(true)
  }

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

      setAviso('Datos del usuario actualizados correctamente.')
      setPanelUsuario(false)
      await cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEditando(false)
    }
  }

  const ejecutar = async (rpc, params, mensajeOk) => {
    setError(null)
    setAviso(null)
    try {
      const { error: err } = await supabase.rpc(rpc, params)
      if (err) throw err
      setAviso(mensajeOk)
      setPanelUsuario(false)
      await cargar()
    } catch (err) {
      setError(mensajeError(err))
    }
    setConfirmar(null)
  }

  const ejecutarDesvinculacion = async (userId) => {
    setError(null)
    setAviso(null)
    try {
      // 1. Primero lo borramos de cualquier unidad asignada
      await supabase
        .from('unit_members')
        .delete()
        .eq('user_id', userId)

      // 2. Luego lo sacamos definitivamente del condominio.
      // Omitimos modificar la columna "role" para evitar el error de restricción not-null.
      const { error: err } = await supabase
        .from('profiles')
        .update({ condominium_id: null, is_active: false })
        .eq('id', userId)

      if (err) throw err
      setAviso('El usuario ha sido removido del condominio correctamente.')
      setPanelUsuario(false)
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

  return (
    <>
      <style>{`
        .tabla-usuarios .celda-usuario { min-width: 200px; }
        .tabla-usuarios .info-movil { display: none; }
        @media (max-width: 768px) {
          .tabla-usuarios .col-contacto { display: none !important; }
          .tabla-usuarios .info-movil { 
            display: block; 
            margin-top: 4px; 
            line-height: 1.25; 
          }
        }
      `}</style>

      <div className="pagina-cabecera">
        <div>
          <h1>Usuarios y roles</h1>
          <p className="texto-ayuda">Administrador gobierna · Supervisor opera · Residente ve su cuenta.</p>
        </div>
        <button
          className="btn btn-primary btn-accion flotante"
          onClick={() => setPanelInvitar(true)}
        >
          <span className="texto-boton">Invitar admin/supervisor</span>
          <span className="icono-boton" aria-hidden="true">+</span>
        </button>
      </div>

      {error && <Aviso tipo="error" onCerrar={() => setError(null)}>{error}</Aviso>}
      {aviso && <Aviso tipo="exito" onCerrar={() => setAviso(null)}>{aviso}</Aviso>}

      <div className="barra-filtros">
        <input
          className="form-control"
          placeholder="Buscar por nombre, correo o cédula…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select
          className="form-control"
          style={{ maxWidth: 200 }}
          value={filtroRol}
          onChange={(e) => setFiltroRol(e.target.value)}
        >
          <option value="">Todos los roles</option>
          <option value="admin">Administrador</option>
          <option value="supervisor">Supervisor</option>
          <option value="resident">Residente</option>
          <option value="residente_restringido">Residente restringido</option>
        </select>
      </div>

      {visibles.length === 0 ? (
        <div className="card">
          <Vacio
            icono="👥"
            titulo="Sin resultados"
            mensaje="No hay usuarios que coincidan con la búsqueda o el filtro."
          />
        </div>
      ) : (
        <div className="card">
          <div className="tabla-scroll">
            <table className="tabla tabla-usuarios">
              <thead>
                <tr>
                  <th className="celda-usuario">Usuario</th>
                  <th className="col-contacto">Contacto</th>
                  <th>Rol y Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibles.map((u) => (
                  <tr key={u.id} className="fila-clicable" onClick={() => abrirPerfil(u)}>
                    <td className="celda-usuario">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span aria-hidden="true" style={{ fontSize: '1.2rem' }}>
                          {u.role === 'admin' ? '👑' : u.role === 'supervisor' ? '🛠️' : '👤'}
                        </span>
                        <div>
                          <strong>
                            {u.full_name}
                            {u.id === perfil?.id && <span className="texto-ayuda" style={{ fontWeight: 'normal', marginLeft: '4px' }}>· usted</span>}
                          </strong>
                          {u.email && <small className="bloque usuario-correo" style={{ color: 'var(--text-muted)' }}>{u.email}</small>}
                          <div className="info-movil">
                            <small style={{ color: 'var(--text-muted)' }}>
                              {[
                                u.national_id ? `C.I. ${formatearCedula(u.national_id)}` : null,
                                u.phone ? formatearTelefono(u.phone) : null
                              ].filter(Boolean).join(' · ')}
                            </small>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="col-contacto">
                      {u.national_id && <span className="bloque">C.I. {formatearCedula(u.national_id)}</span>}
                      {u.phone && <span className="bloque">{formatearTelefono(u.phone)}</span>}
                      {!u.national_id && !u.phone && <span className="texto-ayuda">—</span>}
                    </td>
                    <td>
                      <span className={`chip ${ROL_COLOR[u.role] || ''}`} style={{ marginBottom: '4px' }}>
                        {ROL_ETIQUETA[u.role] || u.role}
                      </span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {u.cuenta_activa ? (
                          <span className="chip chip-exito">✓ Activo</span>
                        ) : (
                          <span className="chip chip-aviso">Pendiente</span>
                        )}
                        {!u.is_active && <span className="chip chip-inactivo">Inactivo</span>}
                      </div>
                    </td>
                    <td className="der">
                      <button className="btn-mini btn-secundario">Gestionar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Confirmar
        abierto={Boolean(confirmar)}
        titulo={confirmar?.titulo}
        mensaje={confirmar?.mensaje}
        textoConfirmar={confirmar?.texto}
        peligro={confirmar?.peligro}
        onConfirmar={confirmar?.accion}
        onCancelar={() => setConfirmar(null)}
      />

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

      <Panel
        abierto={panelUsuario}
        titulo="Perfil de usuario"
        onCerrar={() => setPanelUsuario(false)}
        ancho={500}
      >
        {usuarioActivo && (
          <>
            <form onSubmit={guardarEdicion}>
              <div className="form-group">
                <label>Correo electrónico</label>
                <input
                  type="email"
                  className="form-control"
                  value={formEditar.email}
                  disabled
                  style={{ backgroundColor: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed' }}
                />
                <small className="texto-ayuda">Vinculado a la autenticación; no modificable por esta vía.</small>
              </div>

              <div className="form-group">
                <label>Nombre o Razón Social *</label>
                <input
                  className="form-control"
                  value={formEditar.full_name}
                  onChange={(e) => setFormEditar({ ...formEditar, full_name: capitalizarNombres(e.target.value) })}
                  placeholder="Nombre y apellido"
                />
              </div>
              
              <div className="grid-form">
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
              </div>

              <div className="panel-acciones" style={{ marginTop: '10px' }}>
                <button className="btn btn-primary" disabled={editando}>
                  {editando ? 'Guardando…' : 'Guardar datos'}
                </button>
              </div>
            </form>

            {usuarioActivo.id !== perfil?.id && (
              <>
                <div className="separador" style={{ margin: '24px 0' }} />
                <h4 className="subtitulo">Accesos y Rol</h4>
                <p className="texto-ayuda" style={{ marginBottom: '16px' }}>
                  Nivel de acceso actual: <strong className={`chip ${ROL_COLOR[usuarioActivo.role] || ''}`}>{ROL_ETIQUETA[usuarioActivo.role] || usuarioActivo.role}</strong>
                </p>

                <div className="grid-form">
                  {(usuarioActivo.role === 'resident' || usuarioActivo.role === 'residente_restringido') && (
                    <button
                      type="button"
                      className="btn btn-secundario btn-accion"
                      onClick={() =>
                        setConfirmar({
                          titulo: 'Promover a supervisor',
                          mensaje: `${usuarioActivo.full_name} podrá operar el sistema (confirmar pagos, emitir avisos, registrar gastos), pero no gestionar usuarios ni exonerar. ¿Continuar?`,
                          texto: 'Hacer supervisor',
                          accion: () => ejecutar('promote_to_supervisor', { p_user_id: usuarioActivo.id }, `${usuarioActivo.full_name} ahora es supervisor.`),
                        })
                      }
                    >
                      ⬆️ Hacer supervisor
                    </button>
                  )}

                  {usuarioActivo.role === 'resident' && (
                    <button
                      type="button"
                      className="btn btn-secundario btn-accion"
                      onClick={() => ejecutar('set_resident_restriction', { p_user_id: usuarioActivo.id, p_restringido: true }, `${usuarioActivo.full_name} ahora tiene acceso restringido.`)}
                    >
                      🔒 Restringir acceso
                    </button>
                  )}

                  {usuarioActivo.role === 'residente_restringido' && (
                    <button
                      type="button"
                      className="btn btn-secundario btn-accion"
                      onClick={() => ejecutar('set_resident_restriction', { p_user_id: usuarioActivo.id, p_restringido: false }, `Se quitó la restricción a ${usuarioActivo.full_name}.`)}
                    >
                      🔓 Quitar restricción
                    </button>
                  )}

                  {usuarioActivo.role === 'supervisor' && (
                    <>
                      <button
                        type="button"
                        className="btn btn-secundario btn-accion"
                        onClick={() =>
                          setConfirmar({
                            titulo: 'Degradar supervisor',
                            mensaje: `${usuarioActivo.full_name} volverá a ser residente y perderá el acceso de operación. ¿Continuar?`,
                            texto: 'Degradar',
                            peligro: true,
                            accion: () => ejecutar('demote_supervisor', { p_user_id: usuarioActivo.id }, `${usuarioActivo.full_name} vuelve a ser residente.`),
                          })
                        }
                      >
                        ⬇️ Quitar supervisor
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-accion"
                        onClick={() =>
                          setConfirmar({
                            titulo: 'Transferir administración',
                            mensaje: `${usuarioActivo.full_name} pasará a ser el ADMINISTRADOR del condominio. Usted quedará como supervisor. Esta acción es delicada. ¿Está seguro?`,
                            texto: 'Sí, transferir',
                            peligro: true,
                            accion: () => ejecutar('transfer_admin', { p_new_admin_id: usuarioActivo.id }, `Administración transferida a ${usuarioActivo.full_name}.`),
                          })
                        }
                      >
                        👑 Transferir administración
                      </button>
                    </>
                  )}

                  {(usuarioActivo.role === 'resident' || usuarioActivo.role === 'residente_restringido') && (
                    <button
                      type="button"
                      className="btn btn-danger btn-accion"
                      onClick={() =>
                        setConfirmar({
                          titulo: 'Remover usuario',
                          mensaje: `¿Desea remover definitivamente a ${usuarioActivo.full_name} del condominio? Esta invitación será cancelada y desaparecerá de la lista.`,
                          texto: 'Sí, remover',
                          peligro: true,
                          accion: () => ejecutarDesvinculacion(usuarioActivo.id),
                        })
                      }
                    >
                      🚪 Remover del condominio
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </Panel>
    </>
  )
}
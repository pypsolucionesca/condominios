import { useEffect, useState } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { subirAvatar } from '../lib/imagenes'
import { pushDisponible, estadoPermiso, activarPush, desactivarPush, pushActivo } from '../lib/push'
import { etiqueta } from '../lib/formato'
import { Aviso, Cargador, SelectorImagen } from '../components/UI'
import { reiniciarAplicacion } from '../components/ActualizacionApp'
import BotonInstalar from '../components/BotonInstalar'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY

// Debe coincidir con VERSION en public/sw.js
const VERSION_APP = '1.5.0'

export default function Perfil() {
  const { perfil, usuario, unidades, recargarPerfil, cambiarContrasena } = useAuth()

  const [form, setForm] = useState({ full_name: '', national_id: '', phone: '' })
  const [avatar, setAvatar] = useState(null)
  const [prefs, setPrefs] = useState(null)
  const [push, setPush] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

  const [clave, setClave] = useState({ nueva: '', confirmar: '' })

  useEffect(() => {
    if (perfil) {
      setForm({
        full_name: perfil.full_name || '',
        national_id: perfil.national_id || '',
        phone: perfil.phone || '',
      })
    }
  }, [perfil])

  useEffect(() => {
    supabase
      .from('notification_preferences')
      .select('*')
      .maybeSingle()
      .then(({ data }) => setPrefs(data))

    pushActivo().then(setPush)
  }, [])

  const guardarPerfil = async (e) => {
    e.preventDefault()
    setError(null)

    if (!form.full_name.trim()) return setError('El nombre es obligatorio.')

    setGuardando(true)
    try {
      let avatarUrl = perfil.avatar_url

      if (avatar) {
        const res = await subirAvatar(avatar, usuario.id)
        avatarUrl = res.url
      }

      const { error: err } = await supabase
        .from('profiles')
        .update({
          full_name: form.full_name.trim(),
          national_id: form.national_id.trim() || null,
          phone: form.phone.trim() || null,
          avatar_url: avatarUrl,
        })
        .eq('id', usuario.id)

      if (err) throw err

      setAviso('Perfil actualizado.')
      setAvatar(null)
      recargarPerfil()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  const guardarPrefs = async (cambios) => {
    const nuevas = { ...prefs, ...cambios }
    setPrefs(nuevas)

    const { error: err } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: usuario.id, ...cambios }, { onConflict: 'user_id' })

    if (err) setError(mensajeError(err))
  }

  const alternarPush = async () => {
    setError(null)

    if (push) {
      const res = await desactivarPush()
      if (res.ok) {
        setPush(false)
        setAviso('Notificaciones push desactivadas en este dispositivo.')
      } else {
        setError(res.error)
      }
      return
    }

    const res = await activarPush(VAPID)
    if (res.ok) {
      setPush(true)
      setAviso('Notificaciones push activadas en este dispositivo.')
    } else {
      setError(res.error)
    }
  }

  const cambiarClave = async (e) => {
    e.preventDefault()
    setError(null)

    if (clave.nueva.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (clave.nueva !== clave.confirmar) return setError('Las contraseñas no coinciden.')

    setGuardando(true)
    const res = await cambiarContrasena(clave.nueva)
    setGuardando(false)

    if (res.ok) {
      setAviso('Contraseña actualizada.')
      setClave({ nueva: '', confirmar: '' })
    } else {
      setError(res.error)
    }
  }

  if (!perfil) return <Cargador />

  const permiso = estadoPermiso()

  return (
    <>
      <div className="pagina-cabecera">
        <div>
          <h1>Mi Perfil</h1>
          <p className="texto-ayuda">{usuario?.email}</p>
        </div>
      </div>

      {error && <Aviso tipo="error" onCerrar={() => setError(null)}>{error}</Aviso>}
      {aviso && <Aviso tipo="exito" onCerrar={() => setAviso(null)}>{aviso}</Aviso>}

      <div className="card">
        <h2 className="card-header">Datos personales</h2>

        <form onSubmit={guardarPerfil}>
          <SelectorImagen
            etiqueta="Foto o logo"
            valorActual={perfil.avatar_url}
            onSeleccion={setAvatar}
            redonda
            ayuda="Se comprime a WebP automáticamente."
          />

          <div className="grid-form">
            <div className="form-group">
              <label>Nombre o razón social *</label>
              <input
                className="form-control"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Cédula / RIF</label>
              <input
                className="form-control"
                value={form.national_id}
                onChange={(e) => setForm({ ...form, national_id: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Teléfono</label>
              <input
                className="form-control"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>

          {unidades.length > 0 && (
            <div className="form-group">
              <label>Unidades asignadas</label>
              <div className="chips-fila">
                {unidades.map((u) => (
                  <span key={u.id} className="chip">
                    {u.code} · {etiqueta(u.relation)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button className="btn btn-primary btn-accion" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="card-header">Notificaciones</h2>

        {!prefs ? (
          <Cargador texto="Cargando preferencias…" />
        ) : (
          <>
            <div className="opcion-bloque" style={{ marginBottom: 14 }}>
              <input
                type="checkbox"
                checked={push}
                onChange={alternarPush}
                disabled={!pushDisponible() || permiso === 'denied'}
              />
              <div>
                <strong>Notificaciones en este dispositivo</strong>
                <small>
                  {!pushDisponible()
                    ? 'Su navegador no admite notificaciones push.'
                    : permiso === 'denied'
                    ? 'Bloqueó las notificaciones. Debe permitirlas desde la configuración del navegador.'
                    : 'Recibirá avisos aunque no tenga la aplicación abierta. Debe activarlo en cada dispositivo.'}
                </small>
              </div>
            </div>

            <label className="opcion-bloque">
              <input
                type="checkbox"
                checked={prefs.email_enabled}
                onChange={(e) => guardarPrefs({ email_enabled: e.target.checked })}
              />
              <div>
                <strong>Notificaciones por correo</strong>
                <small>Recibirá un correo cuando ocurran los eventos que seleccione abajo.</small>
              </div>
            </label>

            <div className="separador" />

            <h4 className="subtitulo">Qué quiere recibir</h4>

            <div className="tabla-preferencias">
              <div className="pref-cabecera">
                <span />
                <span>Correo</span>
                <span>Dispositivo</span>
              </div>

              <FilaPref
                etiqueta="Avisos de cobro"
                descripcion="Cuando se emite un aviso o vence"
                email={prefs.email_avisos}
                push={prefs.push_avisos}
                onEmail={(v) => guardarPrefs({ email_avisos: v })}
                onPush={(v) => guardarPrefs({ push_avisos: v })}
              />

              <FilaPref
                etiqueta="Pagos"
                descripcion="Confirmaciones y rechazos"
                email={prefs.email_pagos}
                push={prefs.push_pagos}
                onEmail={(v) => guardarPrefs({ email_pagos: v })}
                onPush={(v) => guardarPrefs({ push_pagos: v })}
              />

              <FilaPref
                etiqueta="Resumen semanal"
                descripcion="Gastos e ingresos del condominio"
                email={prefs.email_resumen}
                push={prefs.push_resumen}
                onEmail={(v) => guardarPrefs({ email_resumen: v })}
                onPush={(v) => guardarPrefs({ push_resumen: v })}
              />
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2 className="card-header">Aplicación</h2>

        <div className="fila-resumen" style={{ marginBottom: 18 }}>
          <div>
            <small>Versión</small>
            <strong>{VERSION_APP}</strong>
          </div>
          <div>
            <small>Modo</small>
            <strong>
              {window.matchMedia('(display-mode: standalone)').matches
                ? 'Instalada'
                : 'Navegador'}
            </strong>
          </div>
        </div>

        <BotonInstalar />

        <p className="texto-ayuda">
          Si la aplicación se comporta de forma extraña o muestra datos antiguos, reinicie
          para descargar la versión más reciente. Su sesión no se cerrará.
        </p>

        <button
          className="btn btn-secundario btn-accion"
          onClick={() => {
            if (confirm('Se limpiarán los archivos guardados y la aplicación se recargará. ¿Continuar?')) {
              reiniciarAplicacion()
            }
          }}
        >
          Reiniciar aplicación
        </button>
      </div>

      <div className="card">
        <h2 className="card-header">Cambiar contraseña</h2>

        <form onSubmit={cambiarClave}>
          <div className="grid-form">
            <div className="form-group">
              <label>Nueva contraseña</label>
              <input
                type="password"
                className="form-control"
                value={clave.nueva}
                onChange={(e) => setClave({ ...clave, nueva: e.target.value })}
                autoComplete="new-password"
              />
              <small className="texto-ayuda">Mínimo 8 caracteres.</small>
            </div>

            <div className="form-group">
              <label>Confirmar</label>
              <input
                type="password"
                className="form-control"
                value={clave.confirmar}
                onChange={(e) => setClave({ ...clave, confirmar: e.target.value })}
                autoComplete="new-password"
              />
            </div>
          </div>

          <button className="btn btn-secundario btn-accion" disabled={guardando || !clave.nueva}>
            Cambiar contraseña
          </button>
        </form>
      </div>
    </>
  )
}

function FilaPref({ etiqueta, descripcion, email, push, onEmail, onPush }) {
  return (
    <div className="pref-fila">
      <div>
        <strong>{etiqueta}</strong>
        <small>{descripcion}</small>
      </div>
      <input type="checkbox" checked={email} onChange={(e) => onEmail(e.target.checked)} />
      <input type="checkbox" checked={push} onChange={(e) => onPush(e.target.checked)} />
    </div>
  )
}

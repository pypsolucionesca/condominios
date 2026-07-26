import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { subirLogoUnidad } from '../lib/imagenes'
import {
  fmtUSD,
  fmtNumero,
  nombreUnidadCorto,
  etiqueta,
  normalizar,
  TIPOS_UNIDAD,
  TIPOS_UBICACION,
  RELACIONES,
} from '../lib/formato'
import { Panel, MenuAcciones, Confirmar, Aviso, Vacio, Cargador, SelectorImagen } from '../components/UI'

const FORM_UNIDAD = {
  code: '',
  unit_type: 'apartamento',
  location_type: '',
  location_name: '',
  floor: '',
  area_m2: '',
  notes: '',
  business_name: '',
  tax_id: '',
  phone: '',
}

const FORM_INVITACION = {
  email: '',
  full_name: '',
  national_id: '',
  phone: '',
  relation: 'propietario',
  role: 'resident',
  is_primary: false,
}

export default function Unidades() {
  const { perfil, esAdmin } = useAuth()

  const [unidades, setUnidades] = useState([])
  const [miembros, setMiembros] = useState([])
  const [saldos, setSaldos] = useState({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')

  const [panelUnidad, setPanelUnidad] = useState(false)
  const [panelInvitar, setPanelInvitar] = useState(false)
  const [detalleUnidad, setDetalleUnidad] = useState(null)
  const [editando, setEditando] = useState(null)
  const [unidadDestino, setUnidadDestino] = useState(null)
  const [confirmacion, setConfirmacion] = useState(null)

  const [formUnidad, setFormUnidad] = useState(FORM_UNIDAD)
  const [logoArchivo, setLogoArchivo] = useState(null)
  const [formInvitacion, setFormInvitacion] = useState(FORM_INVITACION)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [rU, rM, rS] = await Promise.all([
        supabase
          .from('units')
          .select(
            'id, code, unit_type, location_type, location_name, floor, area_m2, aliquot, is_active, notes, logo_url, fixed_fee, business_name, tax_id, phone'
          )
          .order('code'),
        supabase
          .from('unit_members')
          .select(
            'id, relation, is_primary, unit_id, profiles:user_id (id, full_name, national_id, phone, avatar_url, is_active)'
          ),
        supabase.from('units_with_balance').select('id, balance_usd'),
      ])

      if (rU.error) throw rU.error
      if (rM.error) throw rM.error

      setUnidades(rU.data || [])
      setMiembros(rM.data || [])

      const mapa = {}
      for (const s of rS.data || []) mapa[s.id] = Number(s.balance_usd) || 0
      setSaldos(mapa)

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
    return unidades.filter((u) => {
      if (filtroTipo && u.unit_type !== filtroTipo) return false
      if (!q) return true
      return (
        normalizar(u.code).includes(q) ||
        normalizar(u.location_name).includes(q) ||
        miembros.some(
          (m) => m.unit_id === u.id && normalizar(m.profiles?.full_name).includes(q)
        )
      )
    })
  }, [unidades, miembros, busqueda, filtroTipo])

  const activas = unidades.filter((u) => u.is_active)
  const sumaAlicuotas = activas.reduce((s, u) => s + Number(u.aliquot || 0), 0)
  const areaTotal = activas.reduce((s, u) => s + Number(u.area_m2 || 0), 0)
  const sinArea = activas.filter((u) => !u.area_m2 || Number(u.area_m2) <= 0).length

  // ------------------------------------------------------------------ acciones

  const abrirNueva = () => {
    setEditando(null)
    setFormUnidad(FORM_UNIDAD)
    setLogoArchivo(null)
    setPanelUnidad(true)
  }

  const abrirEditar = (u) => {
    setEditando(u)
    setFormUnidad({
      code: u.code || '',
      unit_type: u.unit_type || 'apartamento',
      location_type: u.location_type || '',
      location_name: u.location_name || '',
      floor: u.floor || '',
      area_m2: u.area_m2 ?? '',
      notes: u.notes || '',
      business_name: u.business_name || '',
      tax_id: u.tax_id || '',
      phone: u.phone || '',
    })
    setLogoArchivo(null)
    setPanelUnidad(true)
  }

  const guardarUnidad = async (e) => {
    e.preventDefault()
    setError(null)

    const code = formUnidad.code.trim()
    if (!code) return setError('El identificador es obligatorio.')

    const area = formUnidad.area_m2 === '' ? null : Number(formUnidad.area_m2)
    if (area !== null && (isNaN(area) || area <= 0)) {
      return setError('El área debe ser un número mayor que cero.')
    }

    setEnviando(true)
    try {
      const esLocal = formUnidad.unit_type === 'local_comercial'
      const datos = {
        code,
        unit_type: formUnidad.unit_type,
        location_type: formUnidad.location_type || null,
        location_name: formUnidad.location_name.trim() || null,
        floor: formUnidad.floor.trim() || null,
        area_m2: area,
        notes: formUnidad.notes.trim() || null,
        business_name: esLocal ? formUnidad.business_name.trim() || null : null,
        tax_id: esLocal ? formUnidad.tax_id.trim() || null : null,
        phone: esLocal ? formUnidad.phone.trim() || null : null,
      }

      let unitId = editando?.id

      if (editando) {
        const { error: err } = await supabase.from('units').update(datos).eq('id', editando.id)
        if (err) throw err
      } else {
        const { data, error: err } = await supabase
          .from('units')
          .insert([{ ...datos, condominium_id: perfil.condominium_id }])
          .select('id')
          .single()
        if (err) throw err
        unitId = data.id
      }

      if (logoArchivo && unitId) {
        const { url } = await subirLogoUnidad(logoArchivo, unitId)
        await supabase.from('units').update({ logo_url: url }).eq('id', unitId)
      }

      setAviso(editando ? `${code} actualizado.` : `${code} registrado.`)
      setPanelUnidad(false)
      setLogoArchivo(null)
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  const abrirInvitar = (u) => {
    setUnidadDestino(u)
    setFormInvitacion(FORM_INVITACION)
    setPanelInvitar(true)
  }

  const invitar = async (e) => {
    e.preventDefault()
    setError(null)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formInvitacion.email.trim())) {
      return setError('Ingrese un correo electrónico válido.')
    }
    if (!formInvitacion.full_name.trim()) {
      return setError('Ingrese el nombre del residente.')
    }

    setEnviando(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('La sesión expiró. Vuelva a iniciar sesión.')

      const resp = await supabase.functions.invoke('invitar-residente', {
        body: {
          ...formInvitacion,
          unit_id: unidadDestino.id,
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
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  const desvincular = (m) => {
    setConfirmacion({
      titulo: 'Desvincular residente',
      mensaje: `¿Desvincular a ${m.profiles?.full_name || 'este usuario'}? Perderá acceso al estado de cuenta de la unidad.`,
      peligro: true,
      textoConfirmar: 'Desvincular',
      accion: async () => {
        const { error: err } = await supabase.from('unit_members').delete().eq('id', m.id)
        if (err) setError(mensajeError(err))
        else {
          setAviso('Residente desvinculado.')
          cargar()
        }
        setConfirmacion(null)
      },
    })
  }

  // Vincula el PROPIO perfil del usuario a la unidad como propietario.
  // No cambia el rol: un admin o supervisor sigue siéndolo, pero además
  // queda asociado a su unidad, con lo que verá su "Mi cuenta".
  const vincularme = async (unidad) => {
    setError(null)
    try {
      const { error: err } = await supabase.from('unit_members').insert([
        {
          unit_id: unidad.id,
          user_id: perfil.id,
          relation: 'propietario',
          is_primary: false,
        },
      ])
      if (err) throw err
      setAviso(`Se vinculó su usuario a ${unidad.code}. Ya puede ver "Mi cuenta".`)
      setDetalleUnidad(null)
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  const eliminar = async (u) => {
    setError(null)
    try {
      const { data, error: err } = await supabase.rpc('unit_can_delete', {
        p_unit_id: u.id,
      })
      if (err) throw err

      if (!data.puede) {
        setConfirmacion({
          titulo: `No se puede eliminar ${u.code}`,
          mensaje: data.motivo,
          textoConfirmar: 'Desactivar en su lugar',
          peligro: true,
          accion: async () => {
            const { error: e2 } = await supabase
              .from('units')
              .update({ is_active: false })
              .eq('id', u.id)
            setConfirmacion(null)
            if (e2) setError(mensajeError(e2))
            else {
              setAviso(`${u.code} desactivada.`)
              cargar()
            }
          },
        })
        return
      }

      setConfirmacion({
        titulo: `Eliminar ${u.code}`,
        mensaje:
          'Se borrará definitivamente. ' +
          (data.motivo || 'La unidad no tiene historial financiero.'),
        peligro: true,
        textoConfirmar: 'Eliminar',
        accion: async () => {
          setEnviando(true)
          const { error: e2 } = await supabase.rpc('delete_unit', { p_unit_id: u.id })
          setEnviando(false)
          setConfirmacion(null)
          if (e2) setError(mensajeError(e2))
          else {
            setAviso(`${u.code} eliminada. Alícuotas recalculadas.`)
            cargar()
          }
        },
      })
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  const cambiarEstado = (u) => {
    const desactivar = u.is_active
    setConfirmacion({
      titulo: desactivar ? 'Desactivar unidad' : 'Reactivar unidad',
      mensaje: desactivar
        ? `${u.code} dejará de recibir avisos de cobro y su alícuota se repartirá entre las demás. El historial se conserva.`
        : `${u.code} volverá a recibir avisos y participará del reparto de alícuotas.`,
      peligro: desactivar,
      textoConfirmar: desactivar ? 'Desactivar' : 'Reactivar',
      accion: async () => {
        const { error: err } = await supabase
          .from('units')
          .update({ is_active: !u.is_active })
          .eq('id', u.id)
        if (err) setError(mensajeError(err))
        else {
          setAviso(`${u.code} ${desactivar ? 'desactivada' : 'reactivada'}. Alícuotas recalculadas.`)
          cargar()
        }
        setConfirmacion(null)
      },
    })
  }

  // ------------------------------------------------------------------ vista

  if (cargando) return <Cargador texto="Cargando unidades…" />

  return (
    <>
      <div className="pagina-cabecera">
        <div>
          <h1>Apartamentos y Locales</h1>
          <p className="texto-ayuda">
            {activas.length} unidades activas
            {areaTotal > 0 && ` · ${fmtNumero(areaTotal)} m² totales`}
          </p>
        </div>
        {esAdmin && (
          <button className="btn btn-primary btn-accion flotante" onClick={abrirNueva}>
            <span className="texto-boton">+ Nueva unidad</span>
            <span className="icono-boton" aria-hidden="true">+</span>
          </button>
        )}
      </div>

      {error && <Aviso tipo="error" onCerrar={() => setError(null)}>{error}</Aviso>}
      {aviso && <Aviso tipo="exito" onCerrar={() => setAviso(null)}>{aviso}</Aviso>}

      {esAdmin && sinArea > 0 && (
        <Aviso tipo="aviso">
          {sinArea === 1
            ? 'Hay 1 unidad sin área declarada; no participa del reparto por alícuota.'
            : `Hay ${sinArea} unidades sin área declarada; no participan del reparto por alícuota.`}
        </Aviso>
      )}

      {esAdmin && activas.length > 0 && Math.abs(sumaAlicuotas - 1) > 0.0001 && (
        <Aviso tipo="aviso">
          Las alícuotas suman {(sumaAlicuotas * 100).toFixed(4)}% en lugar de 100%. Revise que
          todas las unidades tengan su área registrada.
        </Aviso>
      )}

      <div className="barra-filtros">
        <input
          className="form-control"
          placeholder="Buscar por código, ubicación o residente…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select
          className="form-control"
          style={{ maxWidth: 200 }}
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
        >
          <option value="">Todos los tipos</option>
          {TIPOS_UNIDAD.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.etiqueta}
            </option>
          ))}
        </select>
      </div>

      {visibles.length === 0 ? (
        <div className="card">
          <Vacio
            icono="🏢"
            titulo={unidades.length === 0 ? 'Aún no hay unidades' : 'Sin resultados'}
            mensaje={
              unidades.length === 0
                ? 'Registre los apartamentos y locales del condominio para comenzar a emitir avisos de cobro.'
                : 'Pruebe con otros términos de búsqueda.'
            }
            accion={
              esAdmin && unidades.length === 0 ? (
                <button className="btn btn-primary btn-auto" onClick={abrirNueva}>
                  Registrar la primera unidad
                </button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="lista-unidades">
          {visibles.map((u) => {
            const gente = miembros.filter((m) => m.unit_id === u.id)
            const saldo = saldos[u.id] || 0

            return (
              <div key={u.id} className={`tarjeta-unidad ${!u.is_active ? 'inactiva' : ''}`}>
                <div className="unidad-logo">
                  {u.logo_url ? (
                    <img src={u.logo_url} alt="" />
                  ) : (
                    <span aria-hidden="true">
                      {u.unit_type === 'local_comercial' ? '🏪' : '🏠'}
                    </span>
                  )}
                </div>

                <div
                  className="unidad-datos clicable"
                  onClick={() => setDetalleUnidad({ unidad: u, gente })}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault()
                      setDetalleUnidad({ unidad: u, gente })
                    }
                  }}
                >
                  <div className="unidad-titulo">
                    <strong>{nombreUnidadCorto(u)}</strong>
                    <span className="chip">{etiqueta(u.unit_type)}</span>
                    {!u.is_active && <span className="chip chip-inactivo">Inactiva</span>}
                  </div>

                  <div className="unidad-meta">
                    {u.area_m2 ? `${fmtNumero(u.area_m2)} m²` : 'Sin área'}
                    {u.floor ? ` · Piso ${u.floor}` : ''}
                    {u.fixed_fee ? ` · Cuota ${fmtUSD(u.fixed_fee)}` : ''}
                    <span
                      className="dato-secundario"
                      title="Coeficiente de propiedad. Solo se usa para repartir gastos extraordinarios."
                    >
                      · Alícuota {(Number(u.aliquot) * 100).toFixed(2)}%
                    </span>
                  </div>

                  {gente.length === 0 ? (
                    <div className="unidad-residentes vacio">Sin residentes vinculados</div>
                  ) : (
                    <div className="unidad-residentes">
                      {gente.map((m) => (
                        <span key={m.id} className="residente-chip">
                          {m.profiles?.avatar_url && <img src={m.profiles.avatar_url} alt="" />}
                          {m.profiles?.full_name || 'Sin nombre'}
                          <em>{etiqueta(m.relation)}</em>
                          {m.is_primary && <b title="Contacto principal">★</b>}
                          {esAdmin && (
                            <button
                              className="residente-quitar"
                              onClick={(ev) => {
                                ev.stopPropagation()
                                desvincular(m)
                              }}
                              aria-label="Desvincular"
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="unidad-derecha">
                  <div className={`unidad-saldo ${saldo > 0 ? 'debe' : saldo < 0 ? 'favor' : ''}`}>
                    <small>{saldo > 0 ? 'Debe' : saldo < 0 ? 'A favor' : 'Solvente'}</small>
                    <strong>{saldo === 0 ? '—' : fmtUSD(Math.abs(saldo))}</strong>
                  </div>

                  {esAdmin && (
                    <MenuAcciones
                      acciones={[
                        { icono: '✏️', texto: 'Editar', onClick: () => abrirEditar(u) },
                        {
                          icono: '👤',
                          texto: 'Invitar residente',
                          onClick: () => abrirInvitar(u),
                          desactivado: !u.is_active,
                        },
                        {
                          icono: u.is_active ? '🚫' : '✅',
                          texto: u.is_active ? 'Desactivar' : 'Reactivar',
                          onClick: () => cambiarEstado(u),
                          peligro: u.is_active,
                        },
                        {
                          icono: '🗑️',
                          texto: 'Eliminar',
                          onClick: () => eliminar(u),
                          peligro: true,
                          titulo: 'Solo si no tiene historial financiero',
                        },
                      ]}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ---------------------------------------------- formulario de unidad */}
      <Panel
        abierto={panelUnidad}
        titulo={editando ? `Editar ${editando.code}` : 'Nueva unidad'}
        onCerrar={() => setPanelUnidad(false)}
      >
        <form onSubmit={guardarUnidad}>
          <div className="form-group">
            <label>Tipo de unidad *</label>
            <select
              className="form-control"
              value={formUnidad.unit_type}
              onChange={(e) => setFormUnidad({ ...formUnidad, unit_type: e.target.value })}
            >
              {TIPOS_UNIDAD.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Identificador *</label>
            <input
              className="form-control"
              value={formUnidad.code}
              onChange={(e) => setFormUnidad({ ...formUnidad, code: e.target.value })}
              placeholder="4-A, LOC-12, PB-3"
              autoFocus
            />
            <small className="texto-ayuda">
              Código corto que aparecerá en los avisos de cobro. No podrá cambiarse una vez que
              la unidad tenga avisos emitidos.
            </small>
          </div>

          {formUnidad.unit_type === 'local_comercial' && (
            <div className="bloque-comercial">
              <h4 className="subtitulo">Datos del comercio</h4>
              <div className="form-group">
                <label>Nombre de la empresa</label>
                <input
                  className="form-control"
                  value={formUnidad.business_name}
                  onChange={(e) =>
                    setFormUnidad({ ...formUnidad, business_name: e.target.value })
                  }
                  placeholder="PyPSoluciones C.A."
                />
              </div>
              <div className="grid-form">
                <div className="form-group">
                  <label>RIF</label>
                  <input
                    className="form-control"
                    value={formUnidad.tax_id}
                    onChange={(e) => setFormUnidad({ ...formUnidad, tax_id: e.target.value })}
                    placeholder="J-12345678-9"
                  />
                </div>
                <div className="form-group">
                  <label>Teléfono</label>
                  <input
                    className="form-control"
                    value={formUnidad.phone}
                    onChange={(e) => setFormUnidad({ ...formUnidad, phone: e.target.value })}
                    placeholder="0412-1234567"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid-form">
            <div className="form-group">
              <label>Tipo de ubicación</label>
              <select
                className="form-control"
                value={formUnidad.location_type}
                onChange={(e) => setFormUnidad({ ...formUnidad, location_type: e.target.value })}
              >
                <option value="">Sin especificar</option>
                {TIPOS_UBICACION.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Nombre de la ubicación</label>
              <input
                className="form-control"
                value={formUnidad.location_name}
                onChange={(e) => setFormUnidad({ ...formUnidad, location_name: e.target.value })}
                placeholder="A, Central, Norte"
              />
            </div>

            <div className="form-group">
              <label>Piso / Nivel</label>
              <input
                className="form-control"
                value={formUnidad.floor}
                onChange={(e) => setFormUnidad({ ...formUnidad, floor: e.target.value })}
                placeholder="PB, 1, 2"
              />
            </div>

            <div className="form-group">
              <label>Área (m²)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                value={formUnidad.area_m2}
                onChange={(e) => setFormUnidad({ ...formUnidad, area_m2: e.target.value })}
              />
              <small className="texto-ayuda">Determina la alícuota. Se recalcula sola.</small>
            </div>
          </div>

          <SelectorImagen
            etiqueta="Logo o imagen"
            valorActual={editando?.logo_url}
            onSeleccion={setLogoArchivo}
            ayuda="Se comprime a WebP automáticamente."
          />

          <div className="form-group">
            <label>Notas</label>
            <textarea
              className="form-control"
              rows={2}
              value={formUnidad.notes}
              onChange={(e) => setFormUnidad({ ...formUnidad, notes: e.target.value })}
            />
          </div>

          <div className="panel-acciones">
            <button
              type="button"
              className="btn btn-secundario"
              onClick={() => setPanelUnidad(false)}
            >
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Registrar unidad'}
            </button>
          </div>
        </form>
      </Panel>

      {/* ------------------------------------------------- detalle de unidad */}
      <Panel
        abierto={!!detalleUnidad}
        titulo={detalleUnidad ? nombreUnidadCorto(detalleUnidad.unidad) : ''}
        onCerrar={() => setDetalleUnidad(null)}
      >
        {detalleUnidad && (
          <div className="detalle-unidad">
            {detalleUnidad.unidad.unit_type === 'local_comercial' && (
              <div className="detalle-seccion">
                <h4 className="subtitulo">Datos del comercio</h4>
                <dl className="detalle-lista">
                  <div>
                    <dt>Empresa</dt>
                    <dd>{detalleUnidad.unidad.business_name || '—'}</dd>
                  </div>
                  <div>
                    <dt>RIF</dt>
                    <dd>{detalleUnidad.unidad.tax_id || '—'}</dd>
                  </div>
                  <div>
                    <dt>Teléfono</dt>
                    <dd>{detalleUnidad.unidad.phone || '—'}</dd>
                  </div>
                </dl>
              </div>
            )}

            <div className="detalle-seccion">
              <h4 className="subtitulo">Datos de la unidad</h4>
              <dl className="detalle-lista">
                <div>
                  <dt>Identificador</dt>
                  <dd>{detalleUnidad.unidad.code}</dd>
                </div>
                <div>
                  <dt>Tipo</dt>
                  <dd>{etiqueta(detalleUnidad.unidad.unit_type)}</dd>
                </div>
                <div>
                  <dt>Ubicación</dt>
                  <dd>
                    {[
                      detalleUnidad.unidad.location_type &&
                        etiqueta(detalleUnidad.unidad.location_type),
                      detalleUnidad.unidad.location_name,
                    ]
                      .filter(Boolean)
                      .join(' ') || '—'}
                  </dd>
                </div>
                <div>
                  <dt>Piso / Nivel</dt>
                  <dd>{detalleUnidad.unidad.floor || '—'}</dd>
                </div>
                <div>
                  <dt>Área</dt>
                  <dd>
                    {detalleUnidad.unidad.area_m2
                      ? `${fmtNumero(detalleUnidad.unidad.area_m2)} m²`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Alícuota</dt>
                  <dd>{(Number(detalleUnidad.unidad.aliquot) * 100).toFixed(2)}%</dd>
                </div>
                {detalleUnidad.unidad.fixed_fee ? (
                  <div>
                    <dt>Cuota fija</dt>
                    <dd>{fmtUSD(detalleUnidad.unidad.fixed_fee)}</dd>
                  </div>
                ) : null}
              </dl>
              {detalleUnidad.unidad.notes && (
                <p className="detalle-notas">{detalleUnidad.unidad.notes}</p>
              )}
            </div>

            <div className="detalle-seccion">
              <h4 className="subtitulo">
                Responsables ({detalleUnidad.gente.length})
              </h4>
              {detalleUnidad.gente.length === 0 ? (
                <p className="texto-ayuda">Sin responsables vinculados.</p>
              ) : (
                <ul className="detalle-responsables">
                  {detalleUnidad.gente.map((m) => (
                    <li key={m.id} className="responsable-ficha">
                      <div className="responsable-avatar">
                        {m.profiles?.avatar_url ? (
                          <img src={m.profiles.avatar_url} alt="" />
                        ) : (
                          <span aria-hidden="true">👤</span>
                        )}
                      </div>
                      <div className="responsable-datos">
                        <div className="responsable-titulo">
                          <strong>{m.profiles?.full_name || 'Sin nombre'}</strong>
                          <span className="chip">{etiqueta(m.relation)}</span>
                          {m.is_primary && (
                            <span className="chip" title="Contacto principal">
                              ★ Principal
                            </span>
                          )}
                        </div>
                        <div className="responsable-meta">
                          {m.profiles?.national_id && (
                            <span>Cédula/RIF: {m.profiles.national_id}</span>
                          )}
                          {m.profiles?.phone && <span>Tel: {m.profiles.phone}</span>}
                          {!m.profiles?.national_id && !m.profiles?.phone && (
                            <span>Sin datos de contacto adicionales</span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {esAdmin && (
              <div className="panel-acciones">
                <button
                  type="button"
                  className="btn btn-secundario"
                  onClick={() => {
                    const u = detalleUnidad.unidad
                    setDetalleUnidad(null)
                    abrirEditar(u)
                  }}
                >
                  Editar unidad
                </button>
                {/* Vincularme: solo si mi propio perfil NO es ya responsable
                    de esta unidad. Permite al admin/supervisor asociarse a su
                    apartamento y ver "Mi cuenta" sin cambiar de rol. */}
                {!detalleUnidad.gente.some((m) => m.profiles?.id === perfil?.id) && (
                  <button
                    type="button"
                    className="btn btn-secundario"
                    onClick={() => vincularme(detalleUnidad.unidad)}
                  >
                    Vincularme a esta unidad
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!detalleUnidad.unidad.is_active}
                  onClick={() => {
                    const u = detalleUnidad.unidad
                    setDetalleUnidad(null)
                    abrirInvitar(u)
                  }}
                >
                  Invitar responsable
                </button>
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* ------------------------------------------------- invitar residente */}
      <Panel
        abierto={panelInvitar}
        titulo={`Invitar a ${unidadDestino?.code || ''}`}
        onCerrar={() => setPanelInvitar(false)}
      >
        <p className="texto-ayuda">
          Recibirá un correo para definir su contraseña. Podrá consultar el estado de cuenta de
          esta unidad y reportar sus pagos.
        </p>

        <form onSubmit={invitar}>
          <div className="form-group">
            <label>Correo electrónico *</label>
            <input
              type="email"
              className="form-control"
              value={formInvitacion.email}
              onChange={(e) => setFormInvitacion({ ...formInvitacion, email: e.target.value })}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Nombre o razón social *</label>
            <input
              className="form-control"
              value={formInvitacion.full_name}
              onChange={(e) => setFormInvitacion({ ...formInvitacion, full_name: e.target.value })}
            />
          </div>

          <div className="grid-form">
            <div className="form-group">
              <label>Cédula / RIF</label>
              <input
                className="form-control"
                value={formInvitacion.national_id}
                onChange={(e) =>
                  setFormInvitacion({ ...formInvitacion, national_id: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label>Teléfono</label>
              <input
                className="form-control"
                value={formInvitacion.phone}
                onChange={(e) => setFormInvitacion({ ...formInvitacion, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Relación con la unidad</label>
            <select
              className="form-control"
              value={formInvitacion.relation}
              onChange={(e) => setFormInvitacion({ ...formInvitacion, relation: e.target.value })}
            >
              {RELACIONES.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.etiqueta}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Tipo de acceso</label>
            <select
              className="form-control"
              value={formInvitacion.role}
              onChange={(e) => setFormInvitacion({ ...formInvitacion, role: e.target.value })}
            >
              <option value="resident">Completo — ve finanzas del condominio</option>
              <option value="residente_restringido">
                Restringido — solo su cuenta y pagos
              </option>
            </select>
            <small className="texto-ayuda">
              El acceso restringido es para quien paga condominio pero no debe ver las cuentas,
              saldos ni las demás unidades. Solo consulta su estado de cuenta y reporta pagos.
            </small>
          </div>

          <label className="checkbox-linea">
            <input
              type="checkbox"
              checked={formInvitacion.is_primary}
              onChange={(e) =>
                setFormInvitacion({ ...formInvitacion, is_primary: e.target.checked })
              }
            />
            Contacto principal de cobranza
          </label>

          <div className="panel-acciones">
            <button
              type="button"
              className="btn btn-secundario"
              onClick={() => setPanelInvitar(false)}
            >
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar invitación'}
            </button>
          </div>
        </form>
      </Panel>

      <Confirmar
        abierto={Boolean(confirmacion)}
        titulo={confirmacion?.titulo}
        mensaje={confirmacion?.mensaje}
        peligro={confirmacion?.peligro}
        textoConfirmar={confirmacion?.textoConfirmar}
        onConfirmar={() => confirmacion?.accion()}
        onCancelar={() => setConfirmacion(null)}
      />
    </>
  )
}

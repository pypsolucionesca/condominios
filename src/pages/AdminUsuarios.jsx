import { useEffect, useState, useCallback } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function AdminUsuarios() {
  const { perfil } = useAuth()

  const [unidades, setUnidades] = useState([])
  const [miembros, setMiembros] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const [form, setForm] = useState({
    email: '',
    full_name: '',
    national_id: '',
    phone: '',
    unit_id: '',
    relation: 'propietario',
    is_primary: false,
  })

  const [formUnidad, setFormUnidad] = useState({ code: '', tower: '', floor: '', area_m2: '' })

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [rU, rM] = await Promise.all([
        supabase
          .from('units')
          .select('id, code, tower, floor, area_m2, aliquot, is_active')
          .order('code'),
        supabase
          .from('unit_members')
          .select('id, relation, is_primary, unit_id, profiles:user_id (id, full_name, phone, is_active)'),
      ])
      if (rU.error) throw rU.error
      if (rM.error) throw rM.error
      setUnidades(rU.data || [])
      setMiembros(rM.data || [])
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

  const crearUnidad = async (e) => {
    e.preventDefault()
    setError(null)
    setAviso(null)

    const code = formUnidad.code.trim()
    if (!code) return setError('El identificador del apartamento es obligatorio.')

    setEnviando(true)
    const { error: err } = await supabase.from('units').insert([
      {
        condominium_id: perfil.condominium_id,
        code,
        tower: formUnidad.tower.trim() || null,
        floor: formUnidad.floor.trim() || null,
        area_m2: formUnidad.area_m2 ? Number(formUnidad.area_m2) : null,
      },
    ])
    setEnviando(false)

    if (err) return setError(mensajeError(err))
    setAviso(`Apartamento ${code} creado.`)
    setFormUnidad({ code: '', tower: '', floor: '', area_m2: '' })
    cargar()
  }

  const invitar = async (e) => {
    e.preventDefault()
    setError(null)
    setAviso(null)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return setError('Ingrese un correo electrónico válido.')
    }
    if (!form.full_name.trim()) return setError('Ingrese el nombre del residente.')
    if (!form.unit_id) return setError('Seleccione un apartamento.')

    setEnviando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()

      const resp = await supabase.functions.invoke('invitar-residente', {
        body: { ...form, origin: window.location.origin },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (resp.error) throw resp.error
      if (resp.data?.error) throw new Error(resp.data.error)

      setAviso(resp.data.mensaje)
      setForm({
        email: '',
        full_name: '',
        national_id: '',
        phone: '',
        unit_id: '',
        relation: 'propietario',
        is_primary: false,
      })
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  const desvincular = async (id, nombre) => {
    if (!confirm(`¿Desvincular a ${nombre} de este apartamento?`)) return
    const { error: err } = await supabase.from('unit_members').delete().eq('id', id)
    if (err) return setError(mensajeError(err))
    setAviso('Residente desvinculado.')
    cargar()
  }

  const sumaAlicuotas = unidades
    .filter((u) => u.is_active)
    .reduce((s, u) => s + Number(u.aliquot || 0), 0)

  return (
    <>
      <div className="card">
        <h2 className="card-header">Registrar apartamento</h2>
        <form onSubmit={crearUnidad}>
          <div className="grid-form">
            <div className="form-group">
              <label>Identificador *</label>
              <input
                className="form-control"
                value={formUnidad.code}
                onChange={(e) => setFormUnidad({ ...formUnidad, code: e.target.value })}
                placeholder="4-A"
              />
            </div>
            <div className="form-group">
              <label>Torre</label>
              <input
                className="form-control"
                value={formUnidad.tower}
                onChange={(e) => setFormUnidad({ ...formUnidad, tower: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Piso</label>
              <input
                className="form-control"
                value={formUnidad.floor}
                onChange={(e) => setFormUnidad({ ...formUnidad, floor: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Área (m²)</label>
              <input
                type="number"
                step="0.01"
                className="form-control"
                value={formUnidad.area_m2}
                onChange={(e) => setFormUnidad({ ...formUnidad, area_m2: e.target.value })}
              />
            </div>
          </div>
          <button className="btn btn-primary mt-4" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Registrar apartamento'}
          </button>
        </form>

        {unidades.length > 0 && Math.abs(sumaAlicuotas - 1) > 0.0001 && (
          <div className="alerta alerta-aviso mt-4">
            Las alícuotas suman {sumaAlicuotas.toFixed(6)} y deben sumar 1.0. Configúrelas
            antes de emitir avisos de cobro por alícuota.
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="card-header">Invitar residente</h2>
        <p className="texto-ayuda">
          El residente recibirá un correo para crear su contraseña. Solo podrá consultar el
          estado de cuenta del apartamento asignado.
        </p>
        <form onSubmit={invitar}>
          <div className="grid-form">
            <div className="form-group">
              <label>Correo electrónico *</label>
              <input
                type="email"
                className="form-control"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Nombre completo *</label>
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
            <div className="form-group">
              <label>Apartamento *</label>
              <select
                className="form-control"
                value={form.unit_id}
                onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
              >
                <option value="">Seleccione…</option>
                {unidades
                  .filter((u) => u.is_active)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code}
                    </option>
                  ))}
              </select>
            </div>
            <div className="form-group">
              <label>Relación</label>
              <select
                className="form-control"
                value={form.relation}
                onChange={(e) => setForm({ ...form, relation: e.target.value })}
              >
                <option value="propietario">Propietario</option>
                <option value="inquilino">Inquilino</option>
                <option value="autorizado">Autorizado</option>
              </select>
            </div>
          </div>

          <label className="checkbox-linea">
            <input
              type="checkbox"
              checked={form.is_primary}
              onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
            />
            Contacto principal de cobranza
          </label>

          <button className="btn btn-primary mt-4" disabled={enviando}>
            {enviando ? 'Enviando invitación…' : 'Enviar invitación'}
          </button>
        </form>
      </div>

      {error && <div className="alerta alerta-error">{error}</div>}
      {aviso && <div className="alerta alerta-exito">{aviso}</div>}

      <div className="card">
        <h2 className="card-header">Apartamentos y residentes</h2>
        {cargando ? (
          <p>Cargando…</p>
        ) : unidades.length === 0 ? (
          <p className="texto-vacio">Aún no hay apartamentos registrados.</p>
        ) : (
          <ul className="list-group">
            {unidades.map((u) => {
              const gente = miembros.filter((m) => m.unit_id === u.id)
              return (
                <li key={u.id} className="list-item bloque-unidad">
                  <div>
                    <strong>
                      {u.code}
                      {u.tower ? ` · Torre ${u.tower}` : ''}
                    </strong>
                    <small>
                      Alícuota {(Number(u.aliquot) * 100).toFixed(4)}%
                      {u.area_m2 ? ` · ${u.area_m2} m²` : ''}
                    </small>

                    {gente.length === 0 ? (
                      <small className="texto-aviso">Sin residentes vinculados</small>
                    ) : (
                      <ul className="sublista">
                        {gente.map((m) => (
                          <li key={m.id}>
                            <span>
                              {m.profiles?.full_name || 'Sin nombre'}
                              <em> · {m.relation}</em>
                              {m.is_primary && <strong> · principal</strong>}
                            </span>
                            <button
                              className="btn-mini btn-danger"
                              onClick={() => desvincular(m.id, m.profiles?.full_name)}
                            >
                              Quitar
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}

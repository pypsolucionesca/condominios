import { useState, useEffect, useCallback } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmtUSD, fmtFecha, hoy } from '../lib/formato'
import { Panel, MenuAcciones, Aviso, Vacio, Cargador, Indicador } from '../components/UI'
import CampoFecha from '../components/CampoFecha'

const MOTIVOS = [
  { valor: 'vejez', etiqueta: 'Edad avanzada' },
  { valor: 'discapacidad', etiqueta: 'Discapacidad' },
  { valor: 'acuerdo_asamblea', etiqueta: 'Acuerdo de asamblea' },
  { valor: 'convenio_pago', etiqueta: 'Convenio de pago' },
  { valor: 'situacion_economica', etiqueta: 'Situación económica' },
  { valor: 'litigio', etiqueta: 'Litigio' },
  { valor: 'otro', etiqueta: 'Otro' },
]

const etiquetaMotivo = (v) => MOTIVOS.find((m) => m.valor === v)?.etiqueta || v

const FORM_EXONERACION = {
  unit_id: '',
  kind: 'total',
  percentage: '50',
  reason: 'vejez',
  description: '',
  authorized_by: '',
  document_ref: '',
  document_public: false,
  starts_on: hoy(),
  ends_on: '',
}

const FORM_CONDONACION = {
  unit_id: '',
  amount: '',
  reason: 'convenio_pago',
  description: '',
  authorized_by: '',
  document_ref: '',
  document_public: false,
  applied_on: hoy(),
  invoice_ids: [],
}

export default function Exoneraciones() {
  const { perfil, esAdmin } = useAuth()

  const [datos, setDatos] = useState(null)
  const [unidades, setUnidades] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [panel, setPanel] = useState(null)
  const [pestana, setPestana] = useState('exoneraciones')

  const [formE, setFormE] = useState(FORM_EXONERACION)
  const [formC, setFormC] = useState(FORM_CONDONACION)
  const [documento, setDocumento] = useState(null)
  const [pendientes, setPendientes] = useState([])
  const [revocando, setRevocando] = useState(null)
  const [motivoRevoca, setMotivoRevoca] = useState('')

  const cargar = useCallback(async () => {
    if (!perfil?.condominium_id) return
    setCargando(true)
    try {
      const [rE, rU] = await Promise.all([
        supabase.rpc('exemptions_list', { p_condominium_id: perfil.condominium_id }),
        supabase.from('units').select('id, code').eq('is_active', true).order('code'),
      ])
      if (rE.error) throw rE.error
      setDatos(rE.data)
      setUnidades(rU.data || [])
      setError(null)
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setCargando(false)
    }
  }, [perfil?.condominium_id])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Avisos pendientes al elegir unidad para condonar
  useEffect(() => {
    if (!formC.unit_id) {
      setPendientes([])
      return
    }
    supabase
      .rpc('unit_pending_invoices', { p_unit_id: formC.unit_id })
      .then(({ data }) => {
        setPendientes(data || [])
        setFormC((f) => ({ ...f, invoice_ids: (data || []).map((i) => i.id) }))
      })
  }, [formC.unit_id])

  const subirDocumento = async () => {
    if (!documento) return null
    const { comprimirImagen } = await import('../lib/imagenes')

    const nombre = `${perfil.condominium_id}/${Date.now()}`

    if (documento.type === 'application/pdf') {
      const { error: err } = await supabase.storage
        .from('exemptions')
        .upload(`${nombre}.pdf`, documento, { contentType: 'application/pdf' })
      if (err) throw err
      return `${nombre}.pdf`
    }

    const { blob, extension } = await comprimirImagen(documento, {
      maxAncho: 1400,
      maxAlto: 1400,
      calidad: 0.82,
    })
    const { error: err } = await supabase.storage
      .from('exemptions')
      .upload(`${nombre}.${extension}`, blob, { contentType: blob.type })
    if (err) throw err
    return `${nombre}.${extension}`
  }

  const guardarExoneracion = async (e) => {
    e.preventDefault()
    setError(null)

    if (!formE.unit_id) return setError('Seleccione la unidad.')
    if (!formE.description.trim()) return setError('Describa el motivo de la exoneración.')
    if (!formE.authorized_by.trim()) return setError('Indique quién autoriza.')

    const pct = formE.kind === 'total' ? 100 : Number(formE.percentage)
    if (formE.kind === 'parcial' && (!pct || pct <= 0 || pct >= 100)) {
      return setError('El porcentaje debe estar entre 1 y 99.')
    }

    setEnviando(true)
    try {
      const ruta = await subirDocumento()

      const { error: err } = await supabase.rpc('grant_exemption', {
        p_unit_id: formE.unit_id,
        p_kind: formE.kind,
        p_percentage: pct,
        p_reason: formE.reason,
        p_description: formE.description.trim(),
        p_authorized_by: formE.authorized_by.trim(),
        p_starts_on: formE.starts_on,
        p_ends_on: formE.ends_on || null,
        p_document_ref: formE.document_ref.trim() || null,
        p_document_url: ruta,
        p_document_public: formE.document_public,
      })
      if (err) throw err

      setAviso('Exoneración registrada.')
      setPanel(null)
      setFormE(FORM_EXONERACION)
      setDocumento(null)
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  const guardarCondonacion = async (e) => {
    e.preventDefault()
    setError(null)

    if (!formC.unit_id) return setError('Seleccione la unidad.')
    const monto = Number(formC.amount)
    if (!monto || monto <= 0) return setError('Indique el monto a condonar.')
    if (!formC.description.trim()) return setError('Describa el motivo.')
    if (!formC.authorized_by.trim()) return setError('Indique quién autoriza.')

    setEnviando(true)
    try {
      const ruta = await subirDocumento()

      const { data, error: err } = await supabase.rpc('forgive_debt', {
        p_unit_id: formC.unit_id,
        p_amount: monto,
        p_reason: formC.reason,
        p_description: formC.description.trim(),
        p_authorized_by: formC.authorized_by.trim(),
        p_invoice_ids: formC.invoice_ids.length ? formC.invoice_ids : null,
        p_applied_on: formC.applied_on,
        p_document_ref: formC.document_ref.trim() || null,
        p_document_url: ruta,
        p_document_public: formC.document_public,
      })
      if (err) throw err

      setAviso(
        `Condonación de ${fmtUSD(monto)} aplicada a ${data.avisos_cubiertos} aviso(s).` +
          (Number(data.sobrante) > 0
            ? ` Quedan ${fmtUSD(data.sobrante)} como saldo a favor.`
            : '')
      )
      setPanel(null)
      setFormC(FORM_CONDONACION)
      setDocumento(null)
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  const revocar = async () => {
    if (!motivoRevoca.trim()) return setError('Indique el motivo de la revocación.')

    setEnviando(true)
    try {
      const { error: err } = await supabase.rpc('revoke_exemption', {
        p_exemption_id: revocando.id,
        p_reason: motivoRevoca.trim(),
      })
      if (err) throw err

      setAviso(`Exoneración de ${revocando.unidad} revocada.`)
      setRevocando(null)
      setMotivoRevoca('')
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  const verDocumento = async (ruta) => {
    if (!ruta) return
    const { data } = await supabase.storage
      .from('exemptions')
      .createSignedUrl(ruta, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  if (cargando) return <Cargador texto="Cargando exoneraciones…" />

  const exoneraciones = datos?.exoneraciones || []
  const condonaciones = datos?.condonaciones || []
  const activas = exoneraciones.filter((e) => e.activa)

  const totalCondonado = pendientes
    .filter((p) => formC.invoice_ids.includes(p.id))
    .reduce((s, p) => s + Number(p.pendiente || 0), 0)

  return (
    <>
      <div className="pagina-cabecera">
        <div>
          <h1>Exoneraciones</h1>
          <p className="texto-ayuda">
            {activas.length} exoneración(es) vigente(s) · {condonaciones.length} condonación(es)
          </p>
        </div>
        {esAdmin && (
          <div className="grupo-botones">
            <button
              className="btn btn-secundario btn-accion"
              onClick={() => {
                setFormC(FORM_CONDONACION)
                setDocumento(null)
                setPanel('condonar')
              }}
            >
              Condonar deuda
            </button>
            <button
              className="btn btn-primary btn-accion"
              onClick={() => {
                setFormE(FORM_EXONERACION)
                setDocumento(null)
                setPanel('exonerar')
              }}
            >
              Nueva exoneración
            </button>
          </div>
        )}
      </div>

      {error && <Aviso tipo="error" onCerrar={() => setError(null)}>{error}</Aviso>}
      {aviso && <Aviso tipo="exito" onCerrar={() => setAviso(null)}>{aviso}</Aviso>}

      <div className="grid-indicadores">
        <Indicador
          etiqueta="Impacto mensual"
          valor={fmtUSD(datos?.impacto_mensual)}
          detalle="Cuotas que se dejan de cobrar cada mes"
          color={Number(datos?.impacto_mensual) > 0 ? 'negativo' : 'neutro'}
          icono="📉"
        />
        <Indicador
          etiqueta="Total condonado"
          valor={fmtUSD(datos?.total_condonado)}
          detalle="Deuda perdonada históricamente"
          color="neutro"
          icono="🤝"
        />
      </div>

      <div className="pestanas">
        <button
          className={`pestana ${pestana === 'exoneraciones' ? 'activa' : ''}`}
          onClick={() => setPestana('exoneraciones')}
        >
          Exoneraciones ({exoneraciones.length})
        </button>
        <button
          className={`pestana ${pestana === 'condonaciones' ? 'activa' : ''}`}
          onClick={() => setPestana('condonaciones')}
        >
          Condonaciones ({condonaciones.length})
        </button>
      </div>

      {pestana === 'exoneraciones' && (
        <div className="card">
          {exoneraciones.length === 0 ? (
            <Vacio
              icono="🤲"
              titulo="Sin exoneraciones"
              mensaje="Una exoneración libera a una unidad de pagar la cuota, total o parcialmente, de forma permanente."
            />
          ) : (
            <ul className="list-group">
              {exoneraciones.map((e) => (
                <li key={e.id} className={`list-item ${!e.activa ? 'inactiva' : ''}`}>
                  <div>
                    <div className="unidad-titulo">
                      <strong>{e.unidad}</strong>
                      <span className={`chip ${e.tipo === 'total' ? 'chip-total' : ''}`}>
                        {e.tipo === 'total' ? 'Total' : `${e.porcentaje}% exonerado`}
                      </span>
                      {!e.activa && <span className="chip chip-inactivo">Revocada</span>}
                    </div>
                    <small>{etiquetaMotivo(e.motivo)} · {e.descripcion}</small>
                    <small>
                      Autoriza: {e.autorizado_por}
                      {e.documento_ref ? ` · ${e.documento_ref}` : ''}
                      {' · Desde '}
                      {fmtFecha(e.desde)}
                      {e.hasta ? ` hasta ${fmtFecha(e.hasta)}` : ''}
                    </small>
                    {e.motivo_revocacion && (
                      <small className="texto-error">
                        Revocada: {e.motivo_revocacion}
                      </small>
                    )}
                  </div>

                  <div className="list-item-derecha">
                    {e.activa && (
                      <div className="unidad-saldo">
                        <small>Mensual</small>
                        <strong className="texto-danger">
                          − {fmtUSD(e.ahorro_mensual)}
                        </strong>
                      </div>
                    )}
                    <MenuAcciones
                      acciones={[
                        {
                          icono: '📎',
                          texto: 'Ver documento',
                          oculto: !e.documento_url,
                          onClick: () => verDocumento(e.documento_url),
                        },
                        {
                          icono: '🚫',
                          texto: 'Revocar',
                          peligro: true,
                          oculto: !e.activa || !esAdmin,
                          onClick: () => {
                            setRevocando(e)
                            setMotivoRevoca('')
                          },
                        },
                      ]}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {pestana === 'condonaciones' && (
        <div className="card">
          {condonaciones.length === 0 ? (
            <Vacio
              icono="🤝"
              titulo="Sin condonaciones"
              mensaje="Una condonación perdona una deuda concreta que ya existe, sin afectar las cuotas futuras."
            />
          ) : (
            <ul className="list-group">
              {condonaciones.map((c) => (
                <li key={c.id} className="list-item">
                  <div>
                    <div className="unidad-titulo">
                      <strong>{c.unidad}</strong>
                      <span className="chip">{etiquetaMotivo(c.motivo)}</span>
                    </div>
                    <small>{c.descripcion}</small>
                    <small>
                      Autoriza: {c.autorizado_por}
                      {c.documento_ref ? ` · ${c.documento_ref}` : ''}
                      {' · '}
                      {fmtFecha(c.fecha)}
                    </small>
                  </div>
                  <div className="list-item-derecha">
                    <strong className="texto-danger">{fmtUSD(c.monto)}</strong>
                    <MenuAcciones
                      acciones={[
                        {
                          icono: '📎',
                          texto: 'Ver documento',
                          oculto: !c.documento_url,
                          onClick: () => verDocumento(c.documento_url),
                        },
                      ]}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ------------------------------------------------ nueva exoneración */}
      <Panel
        abierto={panel === 'exonerar'}
        titulo="Nueva exoneración"
        onCerrar={() => setPanel(null)}
        ancho={600}
      >
        <Aviso tipo="aviso">
          Una exoneración permanente afecta las emisiones futuras. Los gastos del condominio no
          bajan, así que conviene que sea una decisión de asamblea con su respaldo documental.
        </Aviso>

        <form onSubmit={guardarExoneracion}>
          <div className="form-group">
            <label>Unidad *</label>
            <select
              className="form-control"
              value={formE.unit_id}
              onChange={(e) => setFormE({ ...formE, unit_id: e.target.value })}
            >
              <option value="">Seleccione…</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Alcance *</label>
            <div className="opciones-moneda">
              <button
                type="button"
                className={`opcion-moneda ${formE.kind === 'total' ? 'activa' : ''}`}
                onClick={() => setFormE({ ...formE, kind: 'total' })}
              >
                <strong>Total</strong>
                <small>No paga cuota</small>
              </button>
              <button
                type="button"
                className={`opcion-moneda ${formE.kind === 'parcial' ? 'activa' : ''}`}
                onClick={() => setFormE({ ...formE, kind: 'parcial' })}
              >
                <strong>Parcial</strong>
                <small>Paga una parte</small>
              </button>
            </div>
          </div>

          {formE.kind === 'parcial' && (
            <div className="form-group">
              <label>Porcentaje exonerado *</label>
              <div className="input-con-boton">
                <input
                  type="number"
                  min="1"
                  max="99"
                  className="form-control"
                  value={formE.percentage}
                  onChange={(e) => setFormE({ ...formE, percentage: e.target.value })}
                />
                <span className="sufijo-texto">%</span>
              </div>
              <small className="texto-ayuda">
                Exonerar el {formE.percentage || 0}% significa que pagará el{' '}
                {100 - (Number(formE.percentage) || 0)}% de su cuota.
              </small>
            </div>
          )}

          <div className="grid-form">
            <div className="form-group">
              <label>Motivo *</label>
              <select
                className="form-control"
                value={formE.reason}
                onChange={(e) => setFormE({ ...formE, reason: e.target.value })}
              >
                {MOTIVOS.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Autorizado por *</label>
              <input
                className="form-control"
                value={formE.authorized_by}
                onChange={(e) => setFormE({ ...formE, authorized_by: e.target.value })}
                placeholder="Asamblea de propietarios"
              />
            </div>

            <div className="form-group">
              <label>Desde *</label>
              <CampoFecha
                value={formE.starts_on}
                onChange={(v) => setFormE({ ...formE, starts_on: v })}
              />
            </div>

            <div className="form-group">
              <label>Hasta</label>
              <CampoFecha
                value={formE.ends_on}
                onChange={(v) => setFormE({ ...formE, ends_on: v })}
              />
              <small className="texto-ayuda">Vacío = indefinida.</small>
            </div>
          </div>

          <div className="form-group">
            <label>Descripción del acuerdo *</label>
            <textarea
              className="form-control"
              rows={2}
              value={formE.description}
              onChange={(e) => setFormE({ ...formE, description: e.target.value })}
              placeholder="Aprobado en asamblea por condición de edad avanzada del propietario"
            />
          </div>

          <div className="form-group">
            <label>Referencia del documento</label>
            <input
              className="form-control"
              value={formE.document_ref}
              onChange={(e) => setFormE({ ...formE, document_ref: e.target.value })}
              placeholder="Acta N° 12 del 15/03/2026"
            />
          </div>

          <DocumentoAdjunto
            archivo={documento}
            onArchivo={setDocumento}
            publico={formE.document_public}
            onPublico={(v) => setFormE({ ...formE, document_public: v })}
          />

          <div className="panel-acciones">
            <button type="button" className="btn btn-secundario" onClick={() => setPanel(null)}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Registrando…' : 'Registrar exoneración'}
            </button>
          </div>
        </form>
      </Panel>

      {/* -------------------------------------------------- condonar deuda */}
      <Panel
        abierto={panel === 'condonar'}
        titulo="Condonar deuda"
        onCerrar={() => setPanel(null)}
        ancho={600}
      >
        <p className="texto-ayuda">
          Perdona una deuda que ya existe. No afecta las cuotas futuras: para eso es la
          exoneración.
        </p>

        <form onSubmit={guardarCondonacion}>
          <div className="form-group">
            <label>Unidad *</label>
            <select
              className="form-control"
              value={formC.unit_id}
              onChange={(e) => setFormC({ ...formC, unit_id: e.target.value })}
            >
              <option value="">Seleccione…</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code}
                </option>
              ))}
            </select>
          </div>

          {pendientes.length > 0 && (
            <>
              <h4 className="subtitulo">Avisos a condonar</h4>
              <div className="lista-avisos">
                {pendientes.map((p) => (
                  <label
                    key={p.id}
                    className={`aviso-fila ${formC.invoice_ids.includes(p.id) ? 'marcado' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={formC.invoice_ids.includes(p.id)}
                      onChange={() =>
                        setFormC({
                          ...formC,
                          invoice_ids: formC.invoice_ids.includes(p.id)
                            ? formC.invoice_ids.filter((x) => x !== p.id)
                            : [...formC.invoice_ids, p.id],
                        })
                      }
                    />
                    <div className="aviso-datos">
                      <strong>{p.periodo}</strong>
                      <small>Aviso N° {p.invoice_number}</small>
                    </div>
                    <div className="aviso-monto">
                      <strong>{fmtUSD(p.pendiente)}</strong>
                    </div>
                  </label>
                ))}
              </div>

              <div className="total-seleccion">
                <span>{formC.invoice_ids.length} aviso(s) seleccionado(s)</span>
                <strong>{fmtUSD(totalCondonado)}</strong>
              </div>
            </>
          )}

          <div className="grid-form">
            <div className="form-group">
              <label>Monto a condonar (USD) *</label>
              <div className="input-con-boton">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-control"
                  value={formC.amount}
                  onChange={(e) => setFormC({ ...formC, amount: e.target.value })}
                />
                {totalCondonado > 0 && (
                  <button
                    type="button"
                    className="btn-sufijo"
                    onClick={() => setFormC({ ...formC, amount: totalCondonado.toFixed(2) })}
                  >
                    Exacto
                  </button>
                )}
              </div>
            </div>

            <div className="form-group">
              <label>Fecha *</label>
              <CampoFecha
                value={formC.applied_on}
                onChange={(v) => setFormC({ ...formC, applied_on: v })}
              />
            </div>

            <div className="form-group">
              <label>Motivo *</label>
              <select
                className="form-control"
                value={formC.reason}
                onChange={(e) => setFormC({ ...formC, reason: e.target.value })}
              >
                {MOTIVOS.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Autorizado por *</label>
              <input
                className="form-control"
                value={formC.authorized_by}
                onChange={(e) => setFormC({ ...formC, authorized_by: e.target.value })}
                placeholder="Junta de condominio"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Descripción del acuerdo *</label>
            <textarea
              className="form-control"
              rows={2}
              value={formC.description}
              onChange={(e) => setFormC({ ...formC, description: e.target.value })}
              placeholder="Convenio: paga 3 meses y se condonan los 3 restantes"
            />
          </div>

          <div className="form-group">
            <label>Referencia del documento</label>
            <input
              className="form-control"
              value={formC.document_ref}
              onChange={(e) => setFormC({ ...formC, document_ref: e.target.value })}
              placeholder="Convenio del 20/07/2026"
            />
          </div>

          <DocumentoAdjunto
            archivo={documento}
            onArchivo={setDocumento}
            publico={formC.document_public}
            onPublico={(v) => setFormC({ ...formC, document_public: v })}
          />

          <div className="panel-acciones">
            <button type="button" className="btn btn-secundario" onClick={() => setPanel(null)}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Aplicando…' : 'Aplicar condonación'}
            </button>
          </div>
        </form>
      </Panel>

      {/* ------------------------------------------------------- revocar */}
      {revocando && (
        <div className="panel-fondo" onClick={() => setRevocando(null)}>
          <div className="dialogo" onClick={(e) => e.stopPropagation()} role="alertdialog">
            <h3>Revocar exoneración de {revocando.unidad}</h3>
            <p>
              La unidad volverá a pagar su cuota completa desde la próxima emisión. El registro
              se conserva en el historial.
            </p>
            <div className="form-group">
              <label>Motivo *</label>
              <textarea
                className="form-control"
                rows={2}
                value={motivoRevoca}
                onChange={(e) => setMotivoRevoca(e.target.value)}
                autoFocus
              />
            </div>
            <div className="dialogo-botones">
              <button className="btn btn-secundario" onClick={() => setRevocando(null)}>
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                onClick={revocar}
                disabled={enviando || !motivoRevoca.trim()}
              >
                {enviando ? 'Revocando…' : 'Revocar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** Adjuntar el respaldo documental con control de visibilidad. */
function DocumentoAdjunto({ archivo, onArchivo, publico, onPublico }) {
  return (
    <>
      <div className="form-group">
        <label>Documento de respaldo</label>
        <div className="zona-archivo">
          {archivo ? (
            <div className="archivo-pdf">
              <span aria-hidden="true">
                {archivo.type === 'application/pdf' ? '📄' : '🖼️'}
              </span>
              <strong>{archivo.name}</strong>
            </div>
          ) : (
            <div className="zona-archivo-vacia">
              <span aria-hidden="true">📎</span>
              <small>Acta, resolución o certificado</small>
            </div>
          )}

          <div className="grupo-botones" style={{ marginTop: 10 }}>
            <label className="btn-mini btn-primary" style={{ cursor: 'pointer' }}>
              {archivo ? 'Cambiar' : 'Seleccionar'}
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => onArchivo(e.target.files?.[0] || null)}
                style={{ display: 'none' }}
              />
            </label>
            {archivo && (
              <button
                type="button"
                className="btn-mini btn-secundario"
                onClick={() => onArchivo(null)}
              >
                Quitar
              </button>
            )}
          </div>
        </div>
        <small className="texto-ayuda">Las imágenes se comprimen a WebP automáticamente.</small>
      </div>

      <label className="opcion-bloque">
        <input
          type="checkbox"
          checked={publico}
          onChange={(e) => onPublico(e.target.checked)}
        />
        <div>
          <strong>Documento visible para todos</strong>
          <small>
            Un acta de asamblea conviene que sea pública; un certificado médico normalmente no.
            El motivo escrito siempre se ve, independientemente de esta opción.
          </small>
        </div>
      </label>
    </>
  )
}

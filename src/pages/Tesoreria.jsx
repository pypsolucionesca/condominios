import { useEffect, useState, useCallback } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmtUSD, fmtMoneda, fmtFecha, etiqueta, hoy, FRECUENCIAS, TIPOS_BENEFICIARIO } from '../lib/formato'
import { Panel, MenuAcciones, Confirmar, Aviso, Vacio, Cargador, Indicador } from '../components/UI'

const PESTANAS = [
  { id: 'cuentas', texto: 'Cuentas' },
  { id: 'gastos', texto: 'Gastos' },
  { id: 'personal', texto: 'Personal y proveedores' },
  { id: 'compromisos', texto: 'Pagos recurrentes' },
]

export default function Tesoreria() {
  const { perfil, esAdmin, condominio } = useAuth()

  const [pestana, setPestana] = useState('cuentas')
  const [cuentas, setCuentas] = useState([])
  const [gastos, setGastos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [personal, setPersonal] = useState([])
  const [compromisos, setCompromisos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const [panel, setPanel] = useState(null)
  const [editando, setEditando] = useState(null)
  const [confirmacion, setConfirmacion] = useState(null)

  const [formCuenta, setFormCuenta] = useState({
    name: '',
    kind: 'caja',
    currency: 'USD',
    bank_name: '',
    account_number: '',
    opening_balance: '',
  })

  const [formGasto, setFormGasto] = useState({
    account_id: '',
    description: '',
    amount: '',
    currency: 'USD',
    expense_date: hoy(),
    category_id: '',
    supplier: '',
    invoice_ref: '',
  })

  const [formPersona, setFormPersona] = useState({
    kind: 'empleado',
    full_name: '',
    national_id: '',
    phone: '',
    role_title: '',
    hired_at: '',
  })

  const [formCompromiso, setFormCompromiso] = useState({
    payee_id: '',
    description: '',
    amount: '',
    currency: 'USD',
    frequency: 'semanal',
    next_due_date: hoy(),
    account_id: '',
    category_id: '',
  })

  const [historial, setHistorial] = useState({ persona: null, pagos: [], desde: '', hasta: '' })

  const [pagoCompromiso, setPagoCompromiso] = useState({
    id: null,
    account_id: '',
    payment_date: hoy(),
    amount: '',
  })

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [rC, rG, rCat, rP, rR] = await Promise.all([
        supabase.from('accounts_with_balance').select('*').order('name'),
        supabase
          .from('expenses')
          .select(
            'id, expense_date, description, amount, currency, amount_usd, supplier, invoice_ref, account_id, category_id, payee_id, accounts:account_id (name), expense_categories:category_id (name), payees:payee_id (full_name)'
          )
          .order('expense_date', { ascending: false })
          .limit(150),
        supabase.from('expense_categories').select('id, name').order('name'),
        supabase.from('payees').select('*').order('full_name'),
        supabase
          .from('recurring_expenses')
          .select('*, payees:payee_id (full_name), accounts:account_id (name)')
          .order('next_due_date'),
      ])

      if (rC.error) throw rC.error
      if (rG.error) throw rG.error

      setCuentas(rC.data || [])
      setGastos(rG.data || [])
      setCategorias(rCat.data || [])
      setPersonal(rP.data || [])
      setCompromisos(rR.data || [])
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

  const cerrarPanel = () => {
    setPanel(null)
    setEditando(null)
  }

  // ------------------------------------------------------------- cuentas

  const guardarCuenta = async (e) => {
    e.preventDefault()
    setError(null)
    if (!formCuenta.name.trim()) return setError('Indique el nombre de la cuenta.')

    setEnviando(true)
    try {
      const datos = {
        name: formCuenta.name.trim(),
        kind: formCuenta.kind,
        currency: formCuenta.currency,
        bank_name: formCuenta.bank_name.trim() || null,
        account_number: formCuenta.account_number.trim() || null,
      }

      if (editando) {
        const { error: err } = await supabase.from('accounts').update(datos).eq('id', editando.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('accounts').insert([
          {
            ...datos,
            condominium_id: perfil.condominium_id,
            opening_balance: Number(formCuenta.opening_balance) || 0,
          },
        ])
        if (err) throw err
      }

      setAviso(editando ? 'Cuenta actualizada.' : 'Cuenta registrada.')
      cerrarPanel()
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  // -------------------------------------------------------------- gastos

  const guardarGasto = async (e) => {
    e.preventDefault()
    setError(null)

    if (!formGasto.account_id) return setError('Seleccione la cuenta de origen.')
    if (!formGasto.description.trim()) return setError('Describa el gasto.')
    const monto = Number(formGasto.amount)
    if (!monto || monto <= 0) return setError('El monto debe ser mayor que cero.')

    setEnviando(true)
    try {
      const { error: err } = await supabase.rpc('register_expense', {
        p_account_id: formGasto.account_id,
        p_description: formGasto.description.trim(),
        p_amount: monto,
        p_currency: formGasto.currency,
        p_expense_date: formGasto.expense_date,
        p_category_id: formGasto.category_id || null,
        p_supplier: formGasto.supplier.trim() || null,
        p_invoice_ref: formGasto.invoice_ref.trim() || null,
        p_receipt_url: null,
      })
      if (err) throw err

      setAviso('Gasto registrado.')
      cerrarPanel()
      setFormGasto({
        account_id: '',
        description: '',
        amount: '',
        currency: 'USD',
        expense_date: hoy(),
        category_id: '',
        supplier: '',
        invoice_ref: '',
      })
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  // ------------------------------------------------------------ personal

  const guardarPersona = async (e) => {
    e.preventDefault()
    setError(null)
    if (!formPersona.full_name.trim()) return setError('Indique el nombre.')

    setEnviando(true)
    try {
      const datos = {
        kind: formPersona.kind,
        full_name: formPersona.full_name.trim(),
        national_id: formPersona.national_id.trim() || null,
        phone: formPersona.phone.trim() || null,
        role_title: formPersona.role_title.trim() || null,
        hired_at: formPersona.hired_at || null,
      }

      if (editando) {
        const { error: err } = await supabase.from('payees').update(datos).eq('id', editando.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase
          .from('payees')
          .insert([{ ...datos, condominium_id: perfil.condominium_id }])
        if (err) throw err
      }

      setAviso(editando ? 'Datos actualizados.' : 'Registro creado.')
      cerrarPanel()
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  // --------------------------------------------------------- compromisos

  const guardarCompromiso = async (e) => {
    e.preventDefault()
    setError(null)

    if (!formCompromiso.description.trim()) return setError('Describa el compromiso.')
    const monto = Number(formCompromiso.amount)
    if (!monto || monto <= 0) return setError('El monto debe ser mayor que cero.')

    setEnviando(true)
    try {
      const datos = {
        payee_id: formCompromiso.payee_id || null,
        description: formCompromiso.description.trim(),
        amount: monto,
        currency: formCompromiso.currency,
        frequency: formCompromiso.frequency,
        next_due_date: formCompromiso.next_due_date,
        account_id: formCompromiso.account_id || null,
        category_id: formCompromiso.category_id || null,
      }

      if (editando) {
        const { error: err } = await supabase
          .from('recurring_expenses')
          .update(datos)
          .eq('id', editando.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('recurring_expenses').insert([
          {
            ...datos,
            condominium_id: perfil.condominium_id,
            start_date: formCompromiso.next_due_date,
          },
        ])
        if (err) throw err
      }

      setAviso(editando ? 'Compromiso actualizado.' : 'Compromiso registrado.')
      cerrarPanel()
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  const pagarCompromiso = async (e) => {
    e.preventDefault()
    setError(null)
    if (!pagoCompromiso.account_id) return setError('Seleccione la cuenta de origen.')

    setEnviando(true)
    try {
      const { error: err } = await supabase.rpc('pay_recurring_expense', {
        p_recurring_id: pagoCompromiso.id,
        p_account_id: pagoCompromiso.account_id,
        p_payment_date: pagoCompromiso.payment_date,
        p_amount: pagoCompromiso.amount ? Number(pagoCompromiso.amount) : null,
        p_receipt_url: null,
      })
      if (err) throw err

      setAviso('Pago registrado y próximo vencimiento actualizado.')
      cerrarPanel()
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  // ---------------------------------------------------- recibos e historial

  const descargarRecibo = async (gasto) => {
    setError(null)
    try {
      const persona = personal.find((p) => p.id === gasto.payee_id)
      const { pdfReciboPago, logoParaPdf, descargarPdf } = await import('../lib/pdf')
      const logo = await logoParaPdf(condominio?.logo_url)

      const doc = pdfReciboPago({
        pago: { ...gasto, cuenta: gasto.accounts?.name },
        beneficiario: persona || { full_name: gasto.supplier },
        condominio,
        logoDataUrl: logo,
      })

      descargarPdf(
        doc,
        `Recibo-${(persona?.full_name || gasto.supplier || 'pago').replace(/\s+/g, '-')}-${gasto.expense_date}.pdf`
      )
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  const abrirHistorial = async (persona) => {
    setError(null)

    const desde = new Date()
    desde.setFullYear(desde.getFullYear(), 0, 1)
    const desdeStr = desde.toISOString().slice(0, 10)
    const hastaStr = hoy()

    try {
      const { data, error: err } = await supabase
        .from('expenses')
        .select(
          'id, expense_date, description, amount, currency, amount_usd, accounts:account_id (name)'
        )
        .eq('payee_id', persona.id)
        .gte('expense_date', desdeStr)
        .order('expense_date', { ascending: false })

      if (err) throw err

      setHistorial({ persona, pagos: data || [], desde: desdeStr, hasta: hastaStr })
      setPanel('historial')
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  const descargarHistorial = async () => {
    try {
      const { pdfHistorialBeneficiario, logoParaPdf, descargarPdf } = await import('../lib/pdf')
      const logo = await logoParaPdf(condominio?.logo_url)

      const doc = pdfHistorialBeneficiario({
        beneficiario: historial.persona,
        pagos: historial.pagos,
        condominio,
        desde: historial.desde,
        hasta: historial.hasta,
        logoDataUrl: logo,
      })

      descargarPdf(
        doc,
        `Historial-${historial.persona.full_name.replace(/\s+/g, '-')}.pdf`
      )
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  // ------------------------------------------------------------------ vista

  if (cargando) return <Cargador texto="Cargando tesorería…" />

  const totalUSD = cuentas
    .filter((c) => c.is_active && c.currency === 'USD')
    .reduce((s, c) => s + Number(c.current_balance || 0), 0)
  const totalVES = cuentas
    .filter((c) => c.is_active && c.currency === 'VES')
    .reduce((s, c) => s + Number(c.current_balance || 0), 0)

  const vencidos = compromisos.filter(
    (c) => c.is_active && new Date(c.next_due_date) <= new Date(hoy())
  )

  return (
    <>
      <div className="pagina-cabecera">
        <div>
          <h1>Tesorería</h1>
          <p className="texto-ayuda">Cuentas, gastos y compromisos del condominio</p>
        </div>
      </div>

      {error && <Aviso tipo="error" onCerrar={() => setError(null)}>{error}</Aviso>}
      {aviso && <Aviso tipo="exito" onCerrar={() => setAviso(null)}>{aviso}</Aviso>}

      {vencidos.length > 0 && (
        <Aviso tipo="aviso">
          Hay {vencidos.length} compromiso(s) vencido(s) o por vencer.{' '}
          <button className="enlace-inline" onClick={() => setPestana('compromisos')}>
            Ver
          </button>
        </Aviso>
      )}

      <div className="grid-indicadores">
        <Indicador
          etiqueta="Disponible en dólares"
          valor={fmtUSD(totalUSD)}
          detalle={`${cuentas.filter((c) => c.currency === 'USD').length} cuenta(s)`}
          color="positivo"
          icono="💵"
        />
        <Indicador
          etiqueta="Disponible en bolívares"
          valor={fmtMoneda(totalVES, 'VES')}
          detalle={`${cuentas.filter((c) => c.currency === 'VES').length} cuenta(s)`}
          color="neutro"
          icono="🏦"
        />
      </div>

      <div className="pestanas">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            className={`pestana ${pestana === p.id ? 'activa' : ''}`}
            onClick={() => setPestana(p.id)}
          >
            {p.texto}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------- cuentas */}
      {pestana === 'cuentas' && (
        <div className="card">
          <div className="card-header-flex">
            <h2>Cuentas</h2>
            {esAdmin && (
              <button
                className="btn btn-primary btn-auto"
                onClick={() => {
                  setEditando(null)
                  setFormCuenta({
                    name: '',
                    kind: 'caja',
                    currency: 'USD',
                    bank_name: '',
                    account_number: '',
                    opening_balance: '',
                  })
                  setPanel('cuenta')
                }}
              >
                + Nueva cuenta
              </button>
            )}
          </div>

          {cuentas.length === 0 ? (
            <Vacio
              icono="🏦"
              titulo="Sin cuentas registradas"
              mensaje="Registre la caja chica y las cuentas bancarias para llevar el control de fondos."
            />
          ) : (
            <div className="grid-cuentas">
              {cuentas.map((c) => (
                <div key={c.id} className="tarjeta-cuenta">
                  <div className="cuenta-cabecera">
                    <strong>{c.name}</strong>
                    {esAdmin && (
                      <MenuAcciones
                        acciones={[
                          {
                            icono: '✏️',
                            texto: 'Editar',
                            onClick: () => {
                              setEditando(c)
                              setFormCuenta({
                                name: c.name,
                                kind: c.kind,
                                currency: c.currency,
                                bank_name: c.bank_name || '',
                                account_number: c.account_number || '',
                                opening_balance: c.opening_balance,
                              })
                              setPanel('cuenta')
                            },
                          },
                        ]}
                      />
                    )}
                  </div>
                  <div className="cuenta-saldo">
                    {fmtMoneda(c.current_balance, c.currency)}
                  </div>
                  <small className="texto-ayuda">
                    {etiqueta(c.kind)}
                    {c.bank_name ? ` · ${c.bank_name}` : ''}
                  </small>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------- gastos */}
      {pestana === 'gastos' && (
        <div className="card">
          <div className="card-header-flex">
            <h2>Gastos</h2>
            {esAdmin && (
              <button
                className="btn btn-primary btn-auto"
                onClick={() => {
                  setEditando(null)
                  setPanel('gasto')
                }}
                disabled={cuentas.length === 0}
              >
                + Registrar gasto
              </button>
            )}
          </div>

          {gastos.length === 0 ? (
            <Vacio
              icono="🧾"
              titulo="Sin gastos registrados"
              mensaje="Todos los gastos quedan visibles para los residentes del condominio."
            />
          ) : (
            <div className="tabla-scroll">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Concepto</th>
                    <th>Beneficiario</th>
                    <th>Cuenta</th>
                    <th className="der">Monto</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {gastos.map((g) => (
                    <tr key={g.id}>
                      <td>{fmtFecha(g.expense_date)}</td>
                      <td>
                        {g.description}
                        {g.expense_categories?.name && (
                          <small className="bloque">{g.expense_categories.name}</small>
                        )}
                      </td>
                      <td>{g.payees?.full_name || g.supplier || '—'}</td>
                      <td>{g.accounts?.name || '—'}</td>
                      <td className="der">
                        <strong>{fmtUSD(g.amount_usd)}</strong>
                        {g.currency === 'VES' && (
                          <small className="bloque">{fmtMoneda(g.amount, 'VES')}</small>
                        )}
                      </td>
                      <td className="der">
                        <MenuAcciones
                          acciones={[
                            {
                              icono: '🧾',
                              texto: 'Recibo de pago',
                              onClick: () => descargarRecibo(g),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------ personal */}
      {pestana === 'personal' && (
        <div className="card">
          <div className="card-header-flex">
            <h2>Personal y proveedores</h2>
            {esAdmin && (
              <button
                className="btn btn-primary btn-auto"
                onClick={() => {
                  setEditando(null)
                  setFormPersona({
                    kind: 'empleado',
                    full_name: '',
                    national_id: '',
                    phone: '',
                    role_title: '',
                    hired_at: '',
                  })
                  setPanel('persona')
                }}
              >
                + Nuevo registro
              </button>
            )}
          </div>

          {personal.length === 0 ? (
            <Vacio
              icono="👷"
              titulo="Sin registros"
              mensaje="Registre al personal de mantenimiento y a los proveedores habituales."
            />
          ) : (
            <ul className="list-group">
              {personal.map((p) => (
                <li key={p.id} className="list-item">
                  <div>
                    <strong>{p.full_name}</strong>
                    <small>
                      {etiqueta(p.kind)}
                      {p.role_title ? ` · ${p.role_title}` : ''}
                      {p.phone ? ` · ${p.phone}` : ''}
                    </small>
                  </div>
                  <div className="list-item-derecha">
                    {!p.is_active && <span className="chip chip-inactivo">Inactivo</span>}
                    {esAdmin && (
                      <MenuAcciones
                        acciones={[
                          {
                            icono: '📋',
                            texto: 'Ver historial de pagos',
                            onClick: () => abrirHistorial(p),
                          },
                          {
                            icono: '✏️',
                            texto: 'Editar',
                            onClick: () => {
                              setEditando(p)
                              setFormPersona({
                                kind: p.kind,
                                full_name: p.full_name,
                                national_id: p.national_id || '',
                                phone: p.phone || '',
                                role_title: p.role_title || '',
                                hired_at: p.hired_at || '',
                              })
                              setPanel('persona')
                            },
                          },
                          {
                            icono: p.is_active ? '🚫' : '✅',
                            texto: p.is_active ? 'Desactivar' : 'Reactivar',
                            peligro: p.is_active,
                            onClick: async () => {
                              await supabase
                                .from('payees')
                                .update({ is_active: !p.is_active })
                                .eq('id', p.id)
                              cargar()
                            },
                          },
                        ]}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* --------------------------------------------------- compromisos */}
      {pestana === 'compromisos' && (
        <div className="card">
          <div className="card-header-flex">
            <h2>Pagos recurrentes</h2>
            {esAdmin && (
              <button
                className="btn btn-primary btn-auto"
                onClick={() => {
                  setEditando(null)
                  setFormCompromiso({
                    payee_id: '',
                    description: '',
                    amount: '',
                    currency: 'USD',
                    frequency: 'semanal',
                    next_due_date: hoy(),
                    account_id: '',
                    category_id: '',
                  })
                  setPanel('compromiso')
                }}
              >
                + Nuevo compromiso
              </button>
            )}
          </div>

          <p className="texto-ayuda">
            Sueldos y servicios que se repiten. El sistema avisa al vencer; el pago se registra
            manualmente para que siempre haya una confirmación humana.
          </p>

          {compromisos.length === 0 ? (
            <Vacio
              icono="🔁"
              titulo="Sin compromisos registrados"
              mensaje="Registre el sueldo del personal de mantenimiento o los servicios mensuales."
            />
          ) : (
            <ul className="list-group">
              {compromisos.map((c) => {
                const vencido = new Date(c.next_due_date) <= new Date(hoy())
                return (
                  <li key={c.id} className="list-item">
                    <div>
                      <strong>{c.description}</strong>
                      <small>
                        {c.payees?.full_name ? `${c.payees.full_name} · ` : ''}
                        {etiqueta(c.frequency)} · Próximo: {fmtFecha(c.next_due_date)}
                        {c.last_paid_date ? ` · Último: ${fmtFecha(c.last_paid_date)}` : ''}
                      </small>
                    </div>
                    <div className="list-item-derecha">
                      <strong>{fmtMoneda(c.amount, c.currency)}</strong>
                      {vencido && c.is_active && (
                        <span className="badge badge-emitido">Por pagar</span>
                      )}
                      {esAdmin && (
                        <MenuAcciones
                          acciones={[
                            {
                              icono: '💵',
                              texto: 'Registrar pago',
                              oculto: !c.is_active,
                              onClick: () => {
                                setPagoCompromiso({
                                  id: c.id,
                                  account_id: c.account_id || '',
                                  payment_date: hoy(),
                                  amount: '',
                                })
                                setEditando(c)
                                setPanel('pagar')
                              },
                            },
                            {
                              icono: '✏️',
                              texto: 'Editar',
                              onClick: () => {
                                setEditando(c)
                                setFormCompromiso({
                                  payee_id: c.payee_id || '',
                                  description: c.description,
                                  amount: c.amount,
                                  currency: c.currency,
                                  frequency: c.frequency,
                                  next_due_date: c.next_due_date,
                                  account_id: c.account_id || '',
                                  category_id: c.category_id || '',
                                })
                                setPanel('compromiso')
                              },
                            },
                            {
                              icono: c.is_active ? '🚫' : '✅',
                              texto: c.is_active ? 'Desactivar' : 'Reactivar',
                              peligro: c.is_active,
                              onClick: async () => {
                                await supabase
                                  .from('recurring_expenses')
                                  .update({ is_active: !c.is_active })
                                  .eq('id', c.id)
                                cargar()
                              },
                            },
                          ]}
                        />
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* ------------------------------------------------------- paneles */}

      <Panel
        abierto={panel === 'cuenta'}
        titulo={editando ? 'Editar cuenta' : 'Nueva cuenta'}
        onCerrar={cerrarPanel}
      >
        <form onSubmit={guardarCuenta}>
          <div className="form-group">
            <label>Nombre *</label>
            <input
              className="form-control"
              value={formCuenta.name}
              onChange={(e) => setFormCuenta({ ...formCuenta, name: e.target.value })}
              placeholder="Caja chica, Banesco Corriente"
              autoFocus
            />
          </div>

          <div className="grid-form">
            <div className="form-group">
              <label>Tipo *</label>
              <select
                className="form-control"
                value={formCuenta.kind}
                onChange={(e) => setFormCuenta({ ...formCuenta, kind: e.target.value })}
              >
                <option value="caja">Caja</option>
                <option value="banco">Banco</option>
                <option value="fondo_reserva">Fondo de reserva</option>
              </select>
            </div>

            <div className="form-group">
              <label>Moneda *</label>
              <select
                className="form-control"
                value={formCuenta.currency}
                onChange={(e) => setFormCuenta({ ...formCuenta, currency: e.target.value })}
                disabled={Boolean(editando)}
              >
                <option value="USD">Dólares (USD)</option>
                <option value="VES">Bolívares (Bs.)</option>
              </select>
              {editando && (
                <small className="texto-ayuda">
                  La moneda no puede cambiarse: alteraría los movimientos ya registrados.
                </small>
              )}
            </div>
          </div>

          {formCuenta.kind === 'banco' && (
            <div className="grid-form">
              <div className="form-group">
                <label>Banco</label>
                <input
                  className="form-control"
                  value={formCuenta.bank_name}
                  onChange={(e) => setFormCuenta({ ...formCuenta, bank_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Número de cuenta</label>
                <input
                  className="form-control"
                  value={formCuenta.account_number}
                  onChange={(e) =>
                    setFormCuenta({ ...formCuenta, account_number: e.target.value })
                  }
                />
              </div>
            </div>
          )}

          {!editando && (
            <div className="form-group">
              <label>Saldo inicial</label>
              <input
                type="number"
                step="0.01"
                className="form-control"
                value={formCuenta.opening_balance}
                onChange={(e) =>
                  setFormCuenta({ ...formCuenta, opening_balance: e.target.value })
                }
                placeholder="0.00"
              />
              <small className="texto-ayuda">
                Fondos existentes al momento de registrar la cuenta. No podrá modificarse después.
              </small>
            </div>
          )}

          <div className="panel-acciones">
            <button type="button" className="btn btn-secundario" onClick={cerrarPanel}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </Panel>

      <Panel abierto={panel === 'gasto'} titulo="Registrar gasto" onCerrar={cerrarPanel}>
        <form onSubmit={guardarGasto}>
          <div className="form-group">
            <label>Cuenta de origen *</label>
            <select
              className="form-control"
              value={formGasto.account_id}
              onChange={(e) => setFormGasto({ ...formGasto, account_id: e.target.value })}
            >
              <option value="">Seleccione…</option>
              {cuentas
                .filter((c) => c.is_active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {fmtMoneda(c.current_balance, c.currency)}
                  </option>
                ))}
            </select>
          </div>

          <div className="form-group">
            <label>Concepto *</label>
            <input
              className="form-control"
              value={formGasto.description}
              onChange={(e) => setFormGasto({ ...formGasto, description: e.target.value })}
              placeholder="Compra de bombillos para la plaza"
            />
          </div>

          <div className="grid-form">
            <div className="form-group">
              <label>Monto *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                value={formGasto.amount}
                onChange={(e) => setFormGasto({ ...formGasto, amount: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Moneda *</label>
              <select
                className="form-control"
                value={formGasto.currency}
                onChange={(e) => setFormGasto({ ...formGasto, currency: e.target.value })}
              >
                <option value="USD">Dólares (USD)</option>
                <option value="VES">Bolívares (Bs.)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Fecha *</label>
              <input
                type="date"
                className="form-control"
                value={formGasto.expense_date}
                onChange={(e) => setFormGasto({ ...formGasto, expense_date: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Categoría</label>
              <select
                className="form-control"
                value={formGasto.category_id}
                onChange={(e) => setFormGasto({ ...formGasto, category_id: e.target.value })}
              >
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Proveedor</label>
              <input
                className="form-control"
                value={formGasto.supplier}
                onChange={(e) => setFormGasto({ ...formGasto, supplier: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>N° de factura</label>
              <input
                className="form-control"
                value={formGasto.invoice_ref}
                onChange={(e) => setFormGasto({ ...formGasto, invoice_ref: e.target.value })}
              />
            </div>
          </div>

          <div className="panel-acciones">
            <button type="button" className="btn btn-secundario" onClick={cerrarPanel}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Registrando…' : 'Registrar gasto'}
            </button>
          </div>
        </form>
      </Panel>

      <Panel
        abierto={panel === 'persona'}
        titulo={editando ? 'Editar registro' : 'Personal o proveedor'}
        onCerrar={cerrarPanel}
      >
        <form onSubmit={guardarPersona}>
          <div className="grid-form">
            <div className="form-group">
              <label>Tipo *</label>
              <select
                className="form-control"
                value={formPersona.kind}
                onChange={(e) => setFormPersona({ ...formPersona, kind: e.target.value })}
              >
                {TIPOS_BENEFICIARIO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Nombre completo *</label>
              <input
                className="form-control"
                value={formPersona.full_name}
                onChange={(e) => setFormPersona({ ...formPersona, full_name: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Cédula / RIF</label>
              <input
                className="form-control"
                value={formPersona.national_id}
                onChange={(e) => setFormPersona({ ...formPersona, national_id: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Teléfono</label>
              <input
                className="form-control"
                value={formPersona.phone}
                onChange={(e) => setFormPersona({ ...formPersona, phone: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Cargo o servicio</label>
              <input
                className="form-control"
                value={formPersona.role_title}
                onChange={(e) => setFormPersona({ ...formPersona, role_title: e.target.value })}
                placeholder="Mantenimiento de áreas comunes"
              />
            </div>

            <div className="form-group">
              <label>Fecha de ingreso</label>
              <input
                type="date"
                className="form-control"
                value={formPersona.hired_at}
                onChange={(e) => setFormPersona({ ...formPersona, hired_at: e.target.value })}
              />
            </div>
          </div>

          <div className="panel-acciones">
            <button type="button" className="btn btn-secundario" onClick={cerrarPanel}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </Panel>

      <Panel
        abierto={panel === 'compromiso'}
        titulo={editando ? 'Editar compromiso' : 'Nuevo compromiso'}
        onCerrar={cerrarPanel}
      >
        <form onSubmit={guardarCompromiso}>
          <div className="form-group">
            <label>Beneficiario</label>
            <select
              className="form-control"
              value={formCompromiso.payee_id}
              onChange={(e) => setFormCompromiso({ ...formCompromiso, payee_id: e.target.value })}
            >
              <option value="">Sin beneficiario</option>
              {personal
                .filter((p) => p.is_active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
            </select>
          </div>

          <div className="form-group">
            <label>Concepto *</label>
            <input
              className="form-control"
              value={formCompromiso.description}
              onChange={(e) =>
                setFormCompromiso({ ...formCompromiso, description: e.target.value })
              }
              placeholder="Sueldo semanal de mantenimiento"
            />
          </div>

          <div className="grid-form">
            <div className="form-group">
              <label>Monto *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                value={formCompromiso.amount}
                onChange={(e) => setFormCompromiso({ ...formCompromiso, amount: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Moneda *</label>
              <select
                className="form-control"
                value={formCompromiso.currency}
                onChange={(e) =>
                  setFormCompromiso({ ...formCompromiso, currency: e.target.value })
                }
              >
                <option value="USD">Dólares (USD)</option>
                <option value="VES">Bolívares (Bs.)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Frecuencia *</label>
              <select
                className="form-control"
                value={formCompromiso.frequency}
                onChange={(e) =>
                  setFormCompromiso({ ...formCompromiso, frequency: e.target.value })
                }
              >
                {FRECUENCIAS.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.etiqueta}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Próximo pago *</label>
              <input
                type="date"
                className="form-control"
                value={formCompromiso.next_due_date}
                onChange={(e) =>
                  setFormCompromiso({ ...formCompromiso, next_due_date: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label>Cuenta habitual</label>
              <select
                className="form-control"
                value={formCompromiso.account_id}
                onChange={(e) =>
                  setFormCompromiso({ ...formCompromiso, account_id: e.target.value })
                }
              >
                <option value="">Elegir al pagar</option>
                {cuentas
                  .filter((c) => c.is_active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-group">
              <label>Categoría</label>
              <select
                className="form-control"
                value={formCompromiso.category_id}
                onChange={(e) =>
                  setFormCompromiso({ ...formCompromiso, category_id: e.target.value })
                }
              >
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="panel-acciones">
            <button type="button" className="btn btn-secundario" onClick={cerrarPanel}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </Panel>

      <Panel abierto={panel === 'pagar'} titulo="Registrar pago del compromiso" onCerrar={cerrarPanel}>
        {editando && (
          <form onSubmit={pagarCompromiso}>
            <div className="detalle-pago">
              <div>
                <small>Concepto</small>
                <strong>{editando.description}</strong>
              </div>
              <div>
                <small>Monto habitual</small>
                <strong>{fmtMoneda(editando.amount, editando.currency)}</strong>
              </div>
            </div>

            <div className="form-group">
              <label>Cuenta de origen *</label>
              <select
                className="form-control"
                value={pagoCompromiso.account_id}
                onChange={(e) =>
                  setPagoCompromiso({ ...pagoCompromiso, account_id: e.target.value })
                }
              >
                <option value="">Seleccione…</option>
                {cuentas
                  .filter((c) => c.is_active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {fmtMoneda(c.current_balance, c.currency)}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid-form">
              <div className="form-group">
                <label>Fecha del pago *</label>
                <input
                  type="date"
                  className="form-control"
                  value={pagoCompromiso.payment_date}
                  onChange={(e) =>
                    setPagoCompromiso({ ...pagoCompromiso, payment_date: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>Monto</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-control"
                  value={pagoCompromiso.amount}
                  onChange={(e) =>
                    setPagoCompromiso({ ...pagoCompromiso, amount: e.target.value })
                  }
                  placeholder={String(editando.amount)}
                />
                <small className="texto-ayuda">Vacío usa el monto habitual.</small>
              </div>
            </div>

            <div className="panel-acciones">
              <button type="button" className="btn btn-secundario" onClick={cerrarPanel}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={enviando}>
                {enviando ? 'Registrando…' : 'Registrar pago'}
              </button>
            </div>
          </form>
        )}
      </Panel>

      <Panel
        abierto={panel === 'historial'}
        titulo={`Historial · ${historial.persona?.full_name || ''}`}
        onCerrar={cerrarPanel}
        ancho={620}
      >
        {historial.persona && (
          <>
            <div className="detalle-pago">
              <div>
                <small>Cargo</small>
                <strong>{historial.persona.role_title || '—'}</strong>
              </div>
              <div>
                <small>Pagos en el año</small>
                <strong>{historial.pagos.length}</strong>
              </div>
              <div>
                <small>Total pagado</small>
                <strong>
                  {fmtUSD(
                    historial.pagos.reduce((s, p) => s + Number(p.amount_usd || 0), 0)
                  )}
                </strong>
              </div>
            </div>

            {historial.pagos.length === 0 ? (
              <Vacio
                icono="📋"
                titulo="Sin pagos registrados"
                mensaje="Los pagos realizados a esta persona aparecerán aquí."
              />
            ) : (
              <>
                <div className="tabla-scroll" style={{ maxHeight: 340 }}>
                  <table className="tabla tabla-compacta">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Concepto</th>
                        <th className="der">Monto</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {historial.pagos.map((p) => (
                        <tr key={p.id}>
                          <td>{fmtFecha(p.expense_date)}</td>
                          <td>
                            {p.description}
                            <small className="bloque">{p.accounts?.name || '—'}</small>
                          </td>
                          <td className="der">
                            <strong>{fmtUSD(p.amount_usd)}</strong>
                            {p.currency === 'VES' && (
                              <small className="bloque">{fmtMoneda(p.amount, 'VES')}</small>
                            )}
                          </td>
                          <td className="der">
                            <button
                              className="btn-mini btn-secundario"
                              onClick={() =>
                                descargarRecibo({
                                  ...p,
                                  payee_id: historial.persona.id,
                                })
                              }
                            >
                              Recibo
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="panel-acciones">
                  <button type="button" className="btn btn-secundario" onClick={cerrarPanel}>
                    Cerrar
                  </button>
                  <button className="btn btn-primary" onClick={descargarHistorial}>
                    Descargar historial PDF
                  </button>
                </div>
              </>
            )}
          </>
        )}
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

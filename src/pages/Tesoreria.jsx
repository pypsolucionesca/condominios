import { useEffect, useState, useCallback } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmtUSD, fmtMoneda, fmtNumero, fmtFecha, etiqueta, hoy, FRECUENCIAS, TIPOS_BENEFICIARIO } from '../lib/formato'
import { Panel, MenuAcciones, Confirmar, Aviso, Vacio, Cargador, Indicador, SelectorImagen } from '../components/UI'
import CampoFecha from '../components/CampoFecha'
import { DetalleGasto } from '../components/Detalles'
import LibroCuenta from '../components/LibroCuenta'

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
  const [gastoDetalle, setGastoDetalle] = useState(null)
  const [libroCuenta, setLibroCuenta] = useState(null)

  const [formCuenta, setFormCuenta] = useState({
    name: '',
    kind: 'caja',
    currency: 'USD',
    bank_name: '',
    account_number: '',
    opening_balance: '',
  })

  const FORM_GASTO = {
    account_id: '',
    description: '',
    amount_usd: '',      // el monto se define siempre en dólares
    amount: '',          // lo que realmente se paga, en la moneda elegida
    currency: 'USD',
    expense_date: hoy(),
    category_id: '',
    supplier: '',
    invoice_ref: '',
  }

  const [formGasto, setFormGasto] = useState(FORM_GASTO)
  const [reciboGasto, setReciboGasto] = useState(null)

  const FORM_PERSONA = {
    kind: 'empleado',
    full_name: '',
    national_id: '',
    phone: '',
    email: '',
    address: '',
    role_title: '',
    hired_at: '',
    salary_amount: '',
    salary_currency: 'USD',
    salary_period: 'semanal',
    bank_1_name: '',
    bank_1_account: '',
    bank_1_holder: '',
    bank_2_name: '',
    bank_2_account: '',
    bank_2_holder: '',
    mobile_1_bank: '',
    mobile_1_phone: '',
    mobile_1_id: '',
    mobile_2_bank: '',
    mobile_2_phone: '',
    mobile_2_id: '',
  }

  const [formPersona, setFormPersona] = useState(FORM_PERSONA)
  const [fotoPersona, setFotoPersona] = useState(null)
  const [pestanaPersona, setPestanaPersona] = useState('datos')

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

  const [pagoEmpleado, setPagoEmpleado] = useState({
    persona: null,
    amount_usd: '',
    amount: '',
    currency: 'USD',
    payment_date: hoy(),
    account_id: '',
    concepto: '',
  })

  const [formMovimiento, setFormMovimiento] = useState({
    account_id: '',
    kind: 'comision_bancaria',
    description: '',
    amount: '',
    date: hoy(),
  })

  const [saldoInicial, setSaldoInicial] = useState({ cuenta: null, monto: '' })

  const [tasaHoy, setTasaHoy] = useState(null)
  const [formCategoria, setFormCategoria] = useState({ id: null, name: '' })

  const [pagoCompromiso, setPagoCompromiso] = useState({
    id: null,
    account_id: '',
    payment_date: hoy(),
    amount: '',
  })

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [rC, rG, rCat, rP, rR, rT] = await Promise.all([
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
        supabase.rpc('rate_health'),
      ])

      if (rC.error) throw rC.error
      if (rG.error) throw rG.error

      setCuentas(rC.data || [])
      setGastos(rG.data || [])
      setCategorias(rCat.data || [])
      setPersonal(rP.data || [])
      setCompromisos(rR.data || [])
      setTasaHoy(rT.data || null)
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
        // La moneda se cambia por una función que verifica que no haya
        // movimientos: alterarla después corrompería los importes.
        if (formCuenta.currency !== editando.currency) {
          const { error: eM } = await supabase.rpc('change_account_currency', {
            p_account_id: editando.id,
            p_currency: formCuenta.currency,
          })
          if (eM) throw eM
        }

        const { currency, ...resto } = datos
        const { error: err } = await supabase.from('accounts').update(resto).eq('id', editando.id)
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

    const montoUSD = Number(formGasto.amount_usd)
    if (!montoUSD || montoUSD <= 0) return setError('Indique el monto en dólares.')

    // Lo que sale de la cuenta: en bolívares se usa el equivalente,
    // que el administrador puede haber ajustado si el pago real difiere.
    const montoPago =
      formGasto.currency === 'USD'
        ? montoUSD
        : Number(formGasto.amount) || montoUSD * (tasaHoy?.tasa || 0)

    if (!montoPago || montoPago <= 0) {
      return setError('No se pudo calcular el monto a pagar. Verifique la tasa.')
    }

    setEnviando(true)
    try {
      let rutaRecibo = null
      if (reciboGasto) {
        const { subirComprobante } = await import('../lib/imagenes')
        const res = await subirComprobante(reciboGasto, perfil.condominium_id)
        rutaRecibo = res.ruta
      }

      const { error: err } = await supabase.rpc('register_expense', {
        p_account_id: formGasto.account_id,
        p_description: formGasto.description.trim(),
        p_amount: montoPago,
        p_currency: formGasto.currency,
        p_expense_date: formGasto.expense_date,
        p_category_id: formGasto.category_id || null,
        p_supplier: formGasto.supplier.trim() || null,
        p_invoice_ref: formGasto.invoice_ref.trim() || null,
        p_receipt_url: rutaRecibo,
      })
      if (err) throw err

      setAviso('Gasto registrado.')
      cerrarPanel()
      setFormGasto(FORM_GASTO)
      setReciboGasto(null)
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
      const limpio = (v) => (typeof v === 'string' ? v.trim() || null : v ?? null)

      const datos = {
        kind: formPersona.kind,
        full_name: formPersona.full_name.trim(),
        national_id: limpio(formPersona.national_id),
        phone: limpio(formPersona.phone),
        email: limpio(formPersona.email),
        address: limpio(formPersona.address),
        role_title: limpio(formPersona.role_title),
        hired_at: formPersona.hired_at || null,
        salary_amount: formPersona.salary_amount ? Number(formPersona.salary_amount) : null,
        salary_currency: formPersona.salary_currency,
        salary_period: formPersona.salary_amount ? formPersona.salary_period : null,
        bank_1_name: limpio(formPersona.bank_1_name),
        bank_1_account: limpio(formPersona.bank_1_account),
        bank_1_holder: limpio(formPersona.bank_1_holder),
        bank_2_name: limpio(formPersona.bank_2_name),
        bank_2_account: limpio(formPersona.bank_2_account),
        bank_2_holder: limpio(formPersona.bank_2_holder),
        mobile_1_bank: limpio(formPersona.mobile_1_bank),
        mobile_1_phone: limpio(formPersona.mobile_1_phone),
        mobile_1_id: limpio(formPersona.mobile_1_id),
        mobile_2_bank: limpio(formPersona.mobile_2_bank),
        mobile_2_phone: limpio(formPersona.mobile_2_phone),
        mobile_2_id: limpio(formPersona.mobile_2_id),
      }

      let personaId = editando?.id

      if (editando) {
        const { error: err } = await supabase.from('payees').update(datos).eq('id', editando.id)
        if (err) throw err
      } else {
        const { data, error: err } = await supabase
          .from('payees')
          .insert([{ ...datos, condominium_id: perfil.condominium_id }])
          .select('id')
          .single()
        if (err) throw err
        personaId = data.id
      }

      if (fotoPersona && personaId) {
        const { subirImagen } = await import('../lib/imagenes')
        const { url } = await subirImagen(fotoPersona, 'logos', `personal/${personaId}`, {
          maxAncho: 400,
          maxAlto: 400,
        })
        await supabase.from('payees').update({ photo_url: url }).eq('id', personaId)
      }

      setAviso(editando ? 'Datos actualizados.' : 'Registro creado.')
      setFotoPersona(null)
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

  const eliminarCuenta = async (c) => {
    setError(null)
    try {
      const { data, error: err } = await supabase.rpc('account_can_delete', {
        p_account_id: c.id,
      })
      if (err) throw err

      if (!data.puede) {
        setConfirmacion({
          titulo: `No se puede eliminar «${c.name}»`,
          mensaje: data.motivo,
          peligro: true,
          textoConfirmar: 'Desactivar en su lugar',
          accion: async () => {
            const { error: e2 } = await supabase
              .from('accounts')
              .update({ is_active: false })
              .eq('id', c.id)
            setConfirmacion(null)
            if (e2) setError(mensajeError(e2))
            else {
              setAviso(`${c.name} desactivada.`)
              cargar()
            }
          },
        })
        return
      }

      setConfirmacion({
        titulo: `Eliminar «${c.name}»`,
        mensaje:
          'Se borrará definitivamente. ' + (data.motivo || 'La cuenta no tiene movimientos.'),
        peligro: true,
        textoConfirmar: 'Eliminar',
        accion: async () => {
          setEnviando(true)
          const { error: e2 } = await supabase.rpc('delete_account', { p_account_id: c.id })
          setEnviando(false)
          setConfirmacion(null)
          if (e2) setError(mensajeError(e2))
          else {
            setAviso(`${c.name} eliminada.`)
            cargar()
          }
        },
      })
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  // ---------------------------------------------------------- categorías

  const guardarCategoria = async (e) => {
    e.preventDefault()
    setError(null)

    const nombre = formCategoria.name.trim()
    if (!nombre) return setError('Indique el nombre de la categoría.')

    setEnviando(true)
    try {
      if (formCategoria.id) {
        const { error: err } = await supabase
          .from('expense_categories')
          .update({ name: nombre })
          .eq('id', formCategoria.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase
          .from('expense_categories')
          .insert([{ name: nombre, condominium_id: perfil.condominium_id }])
        if (err) throw err
      }

      setAviso(formCategoria.id ? 'Categoría actualizada.' : 'Categoría creada.')
      setFormCategoria({ id: null, name: '' })
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  const eliminarCategoria = (c) => {
    setConfirmacion({
      titulo: `Eliminar «${c.name}»`,
      mensaje:
        'Los gastos que la usen quedarán sin categoría, pero conservarán su monto y descripción.',
      peligro: true,
      textoConfirmar: 'Eliminar',
      accion: async () => {
        const { error: err } = await supabase
          .from('expense_categories')
          .delete()
          .eq('id', c.id)
        setConfirmacion(null)
        if (err) setError(mensajeError(err))
        else {
          setAviso('Categoría eliminada.')
          cargar()
        }
      },
    })
  }

  // ------------------------------------------------------- pago a empleado

  const abrirPagoEmpleado = (persona) => {
    const periodo = { diario: 'Jornada', semanal: 'Semana', quincenal: 'Quincena', mensual: 'Mes' }

    // El salario puede estar configurado en bolívares; se normaliza a
    // dólares porque es la moneda base de la contabilidad.
    const salarioUSD =
      persona.salary_currency === 'VES' && tasaHoy?.tasa
        ? (Number(persona.salary_amount) / tasaHoy.tasa).toFixed(2)
        : persona.salary_amount
        ? String(persona.salary_amount)
        : ''

    setPagoEmpleado({
      persona,
      amount_usd: salarioUSD,
      amount: '',
      currency: 'USD',
      payment_date: hoy(),
      account_id: '',
      concepto: persona.salary_period
        ? `${periodo[persona.salary_period] || 'Pago'} · ${persona.role_title || persona.full_name}`
        : `Pago a ${persona.full_name}`,
    })
    setPanel('pagar-empleado')
  }

  const registrarPagoEmpleado = async (e) => {
    e.preventDefault()
    setError(null)

    const montoUSD = Number(pagoEmpleado.amount_usd)
    if (!montoUSD || montoUSD <= 0) return setError('Indique el monto en dólares.')
    if (!pagoEmpleado.account_id) return setError('Seleccione la cuenta de origen.')

    const montoPago =
      pagoEmpleado.currency === 'USD'
        ? montoUSD
        : Number(pagoEmpleado.amount) || montoUSD * (tasaHoy?.tasa || 0)

    if (!montoPago || montoPago <= 0) {
      return setError('No se pudo calcular el monto. Verifique la tasa.')
    }

    setEnviando(true)
    try {
      const { data: idGasto, error: err } = await supabase.rpc('register_expense', {
        p_account_id: pagoEmpleado.account_id,
        p_description: pagoEmpleado.concepto.trim() || `Pago a ${pagoEmpleado.persona.full_name}`,
        p_amount: montoPago,
        p_currency: pagoEmpleado.currency,
        p_expense_date: pagoEmpleado.payment_date,
        p_category_id: null,
        p_supplier: pagoEmpleado.persona.full_name,
        p_invoice_ref: null,
        p_receipt_url: null,
      })
      if (err) throw err

      await supabase
        .from('expenses')
        .update({ payee_id: pagoEmpleado.persona.id })
        .eq('id', idGasto)

      setAviso(`Pago registrado a ${pagoEmpleado.persona.full_name}.`)
      cerrarPanel()
      cargar()

      // Se ofrece el recibo de inmediato: es el momento en que se necesita
      const { data: gasto } = await supabase
        .from('expenses')
        .select('*, accounts:account_id (name)')
        .eq('id', idGasto)
        .single()

      if (gasto) {
        setTimeout(() => descargarRecibo({ ...gasto, payee_id: pagoEmpleado.persona.id }), 400)
      }
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  // ------------------------------------------- movimientos y saldo inicial

  const guardarMovimiento = async (e) => {
    e.preventDefault()
    setError(null)

    if (!formMovimiento.account_id) return setError('Seleccione la cuenta.')
    if (!formMovimiento.description.trim()) return setError('Describa el movimiento.')
    const monto = Number(formMovimiento.amount)
    if (!monto || monto <= 0) return setError('El monto debe ser mayor que cero.')

    setEnviando(true)
    try {
      const { error: err } = await supabase.rpc('register_movement', {
        p_account_id: formMovimiento.account_id,
        p_kind: formMovimiento.kind,
        p_description: formMovimiento.description.trim(),
        p_amount: monto,
        p_date: formMovimiento.date,
        p_note: null,
      })
      if (err) throw err

      setAviso('Movimiento registrado.')
      setFormMovimiento({
        account_id: '',
        kind: 'comision_bancaria',
        description: '',
        amount: '',
        date: hoy(),
      })
      cerrarPanel()
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  const guardarSaldoInicial = async (e) => {
    e.preventDefault()
    setError(null)

    setEnviando(true)
    try {
      const { error: err } = await supabase.rpc('set_opening_balance', {
        p_account_id: saldoInicial.cuenta.id,
        p_amount: Number(saldoInicial.monto) || 0,
      })
      if (err) throw err

      setAviso('Saldo inicial actualizado.')
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
              <div className="grupo-botones">
                <button
                  className="btn btn-secundario btn-accion"
                  onClick={() => setPanel('movimiento')}
                  disabled={cuentas.length === 0}
                >
                  Comisión o ajuste
                </button>
                <button
                  className="btn btn-primary btn-accion"
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
              </div>
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
                <div
                  key={c.id}
                  className="tarjeta-cuenta clicable"
                  onClick={() => setLibroCuenta(c.id)}
                >
                  <div className="cuenta-cabecera" onClick={(e) => e.stopPropagation()}>
                    <strong>{c.name}</strong>
                    {esAdmin && (
                      <MenuAcciones
                        acciones={[
                          {
                            icono: '📖',
                            texto: 'Ver movimientos',
                            onClick: () => setLibroCuenta(c.id),
                          },
                          {
                            icono: '🗑️',
                            texto: 'Eliminar',
                            peligro: true,
                            onClick: () => eliminarCuenta(c),
                            titulo: 'Solo si no tiene movimientos',
                          },
                          {
                            icono: c.is_active ? '🚫' : '✅',
                            texto: c.is_active ? 'Desactivar' : 'Reactivar',
                            peligro: c.is_active,
                            onClick: async () => {
                              await supabase
                                .from('accounts')
                                .update({ is_active: !c.is_active })
                                .eq('id', c.id)
                              cargar()
                            },
                          },
                          {
                            icono: '💰',
                            texto: 'Saldo inicial',
                            onClick: () => {
                              setSaldoInicial({ cuenta: c, monto: String(c.opening_balance || 0) })
                              setPanel('saldo-inicial')
                            },
                          },
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
                  <span className="cuenta-ver-mas">Ver movimientos →</span>
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
                className="btn btn-primary btn-accion"
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
                    <tr
                      key={g.id}
                      className="fila-clicable"
                      onClick={() => setGastoDetalle(g.id)}
                    >
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
                      <td className="der" onClick={(e) => e.stopPropagation()}>
                        <MenuAcciones
                          acciones={[
                            {
                              icono: '🔍',
                              texto: 'Ver detalle',
                              onClick: () => setGastoDetalle(g.id),
                            },
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
                className="btn btn-primary btn-accion"
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
                  {p.photo_url ? (
                    <img src={p.photo_url} alt="" className="persona-avatar" />
                  ) : (
                    <span className="usuario-avatar-vacio" aria-hidden="true">
                      {p.kind === 'empleado' ? '👷' : '🏪'}
                    </span>
                  )}
                  <div>
                    <strong>{p.full_name}</strong>
                    <small>
                      {etiqueta(p.kind)}
                      {p.role_title ? ` · ${p.role_title}` : ''}
                      {p.phone ? ` · ${p.phone}` : ''}
                      {p.email ? ` · ${p.email}` : ''}
                    </small>
                    {p.salary_amount && (
                      <small>
                        {fmtMoneda(p.salary_amount, p.salary_currency)} ·{' '}
                        {etiqueta(p.salary_period)}
                      </small>
                    )}
                  </div>
                  <div className="list-item-derecha">
                    {!p.is_active && <span className="chip chip-inactivo">Inactivo</span>}
                    {esAdmin && (
                      <MenuAcciones
                        acciones={[
                          {
                            icono: '💵',
                            texto: 'Registrar pago',
                            oculto: !p.is_active,
                            onClick: () => abrirPagoEmpleado(p),
                          },
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
                className="btn btn-primary btn-accion"
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
              >
                <option value="USD">Dólares (USD)</option>
                <option value="VES">Bolívares (Bs.)</option>
              </select>
              {editando && (
                <small className="texto-ayuda">
                  Solo puede cambiarse si la cuenta no tiene movimientos registrados.
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

      <Panel abierto={panel === 'gasto'} titulo="Registrar gasto" onCerrar={cerrarPanel} ancho={600}>
        <form onSubmit={guardarGasto}>
          <div className="form-group">
            <label>Concepto *</label>
            <input
              className="form-control"
              value={formGasto.description}
              onChange={(e) => setFormGasto({ ...formGasto, description: e.target.value })}
              placeholder="Compra de bombillos para la plaza"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Monto del gasto en dólares *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="form-control"
              value={formGasto.amount_usd}
              onChange={(e) => {
                const usd = e.target.value
                setFormGasto({
                  ...formGasto,
                  amount_usd: usd,
                  // Al cambiar el monto se recalcula el equivalente
                  amount:
                    formGasto.currency === 'VES' && tasaHoy?.tasa && usd
                      ? (Number(usd) * tasaHoy.tasa).toFixed(2)
                      : formGasto.amount,
                })
              }}
              placeholder="0.00"
            />
            <small className="texto-ayuda">
              La contabilidad del condominio se lleva en dólares. Indique aquí el valor del
              gasto, sin importar en qué moneda lo pague.
            </small>
          </div>

          <div className="form-group">
            <label>¿Con qué moneda se paga? *</label>
            <div className="opciones-moneda">
              {['USD', 'VES'].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`opcion-moneda ${formGasto.currency === m ? 'activa' : ''}`}
                  onClick={() =>
                    setFormGasto({
                      ...formGasto,
                      currency: m,
                      account_id: '',
                      amount:
                        m === 'VES' && tasaHoy?.tasa && formGasto.amount_usd
                          ? (Number(formGasto.amount_usd) * tasaHoy.tasa).toFixed(2)
                          : '',
                    })
                  }
                >
                  <strong>{m === 'USD' ? 'Dólares' : 'Bolívares'}</strong>
                  <small>{m === 'USD' ? 'USD' : 'Bs.'}</small>
                </button>
              ))}
            </div>
          </div>

          {formGasto.currency === 'VES' && (
            <>
              {!tasaHoy?.tasa ? (
                <Aviso tipo="error">
                  No hay tasa registrada. Cárguela en Ajustes antes de registrar pagos en
                  bolívares.
                </Aviso>
              ) : (
                <div className="conversion-bloque">
                  <div className="conversion-linea">
                    <span>Tasa del {fmtFecha(tasaHoy.fecha)}</span>
                    <strong>Bs. {fmtNumero(tasaHoy.tasa)}</strong>
                  </div>
                  <div className="conversion-linea destacada">
                    <span>Monto a pagar</span>
                    <strong>
                      {fmtMoneda(
                        Number(formGasto.amount) ||
                          Number(formGasto.amount_usd) * tasaHoy.tasa || 0,
                        'VES'
                      )}
                    </strong>
                  </div>
                  {tasaHoy.obsoleta && (
                    <small className="texto-aviso">
                      La tasa tiene {tasaHoy.dias_antiguedad} días de antigüedad.
                    </small>
                  )}
                </div>
              )}

              <div className="form-group">
                <label>Monto exacto pagado en bolívares</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-control"
                  value={formGasto.amount}
                  onChange={(e) => setFormGasto({ ...formGasto, amount: e.target.value })}
                />
                <small className="texto-ayuda">
                  Ajústelo si el pago real difiere del cálculo, por redondeo del banco.
                </small>
              </div>
            </>
          )}

          <div className="form-group">
            <label>Cuenta de origen *</label>
            <select
              className="form-control"
              value={formGasto.account_id}
              onChange={(e) => setFormGasto({ ...formGasto, account_id: e.target.value })}
            >
              <option value="">Seleccione…</option>
              {cuentas
                .filter((c) => c.is_active && c.currency === formGasto.currency)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {fmtMoneda(c.current_balance, c.currency)}
                  </option>
                ))}
            </select>
            {cuentas.filter((c) => c.is_active && c.currency === formGasto.currency).length ===
              0 && (
              <small className="texto-error">
                No hay cuentas en {formGasto.currency === 'USD' ? 'dólares' : 'bolívares'}.
                Créela en la pestaña Cuentas.
              </small>
            )}
          </div>

          <div className="grid-form">
            <div className="form-group">
              <label>Fecha *</label>
              <CampoFecha
                className="form-control"
                value={formGasto.expense_date}
                onChange={(v) => setFormGasto({ ...formGasto, expense_date: v })}
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
              <button
                type="button"
                className="btn-enlace-mini"
                onClick={() => setPanel('categorias')}
              >
                Administrar categorías
              </button>
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

          <div className="form-group">
            <label>Factura o recibo</label>
            <div className="zona-archivo">
              {reciboGasto ? (
                <div className="archivo-pdf">
                  <span aria-hidden="true">
                    {reciboGasto.type === 'application/pdf' ? '📄' : '🧾'}
                  </span>
                  <strong>{reciboGasto.name}</strong>
                </div>
              ) : (
                <div className="zona-archivo-vacia">
                  <span aria-hidden="true">📎</span>
                  <small>Foto de la factura o recibo</small>
                </div>
              )}

              <div className="grupo-botones" style={{ marginTop: 10 }}>
                <label className="btn-mini btn-primary" style={{ cursor: 'pointer' }}>
                  {reciboGasto ? 'Cambiar' : 'Seleccionar'}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setReciboGasto(e.target.files?.[0] || null)}
                    style={{ display: 'none' }}
                  />
                </label>
                {reciboGasto && (
                  <button
                    type="button"
                    className="btn-mini btn-secundario"
                    onClick={() => setReciboGasto(null)}
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>
            <small className="texto-ayuda">
              Las imágenes se comprimen a WebP automáticamente.
            </small>
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

      {/* ------------------------------------------------------ categorías */}
      <Panel
        abierto={panel === 'categorias'}
        titulo="Categorías de gasto"
        onCerrar={() => {
          setFormCategoria({ id: null, name: '' })
          setPanel('gasto')
        }}
      >
        <p className="texto-ayuda">
          Agrupan los gastos para el informe de transparencia: mantenimiento, servicios,
          personal, reparaciones.
        </p>

        <form onSubmit={guardarCategoria}>
          <div className="form-group">
            <label>{formCategoria.id ? 'Editar categoría' : 'Nueva categoría'}</label>
            <div className="input-con-boton">
              <input
                className="form-control"
                value={formCategoria.name}
                onChange={(e) => setFormCategoria({ ...formCategoria, name: e.target.value })}
                placeholder="Mantenimiento de áreas comunes"
              />
              <button type="submit" className="btn-sufijo" disabled={enviando}>
                {formCategoria.id ? 'Guardar' : 'Añadir'}
              </button>
            </div>
            {formCategoria.id && (
              <button
                type="button"
                className="btn-enlace-mini"
                onClick={() => setFormCategoria({ id: null, name: '' })}
              >
                Cancelar edición
              </button>
            )}
          </div>
        </form>

        {categorias.length === 0 ? (
          <Vacio
            icono="🏷️"
            titulo="Sin categorías"
            mensaje="Cree la primera para clasificar los gastos del condominio."
          />
        ) : (
          <ul className="list-group">
            {categorias.map((c) => (
              <li key={c.id} className="list-item">
                <div>
                  <strong>{c.name}</strong>
                  <small>
                    {gastos.filter((g) => g.category_id === c.id).length} gasto(s)
                  </small>
                </div>
                <div className="list-item-derecha">
                  <button
                    className="btn-mini btn-secundario"
                    onClick={() => setFormCategoria({ id: c.id, name: c.name })}
                  >
                    Editar
                  </button>
                  <button
                    className="btn-mini btn-danger"
                    onClick={() => eliminarCategoria(c)}
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="panel-acciones">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setFormCategoria({ id: null, name: '' })
              setPanel('gasto')
            }}
          >
            Volver al gasto
          </button>
        </div>
      </Panel>

      <Panel
        abierto={panel === 'persona'}
        titulo={editando ? `Editar · ${editando.full_name}` : 'Personal o proveedor'}
        onCerrar={cerrarPanel}
        ancho={620}
      >
        <div className="pestanas">
          {[
            { id: 'datos', texto: 'Datos' },
            { id: 'pago', texto: 'Formas de pago' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              className={`pestana ${pestanaPersona === t.id ? 'activa' : ''}`}
              onClick={() => setPestanaPersona(t.id)}
            >
              {t.texto}
            </button>
          ))}
        </div>

        <form onSubmit={guardarPersona}>
          {pestanaPersona === 'datos' && (
            <>
              <SelectorImagen
                etiqueta="Foto"
                valorActual={editando?.photo_url}
                onSeleccion={setFotoPersona}
                redonda
                ayuda="Se comprime a WebP automáticamente."
              />

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
                    onChange={(e) =>
                      setFormPersona({ ...formPersona, national_id: e.target.value })
                    }
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
                  <label>Correo electrónico</label>
                  <input
                    type="email"
                    className="form-control"
                    value={formPersona.email}
                    onChange={(e) => setFormPersona({ ...formPersona, email: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Cargo o servicio</label>
                  <input
                    className="form-control"
                    value={formPersona.role_title}
                    onChange={(e) =>
                      setFormPersona({ ...formPersona, role_title: e.target.value })
                    }
                    placeholder="Mantenimiento de áreas comunes"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Dirección</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={formPersona.address}
                  onChange={(e) => setFormPersona({ ...formPersona, address: e.target.value })}
                />
              </div>

              {formPersona.kind === 'empleado' && (
                <>
                  <div className="separador" />
                  <h4 className="subtitulo">Remuneración</h4>

                  <div className="grid-form">
                    <div className="form-group">
                      <label>Fecha de ingreso</label>
                      <CampoFecha
                className="form-control"
                        value={formPersona.hired_at}
                        onChange={(v) =>
                          setFormPersona({ ...formPersona, hired_at: v })
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label>Salario</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-control"
                        value={formPersona.salary_amount}
                        onChange={(e) =>
                          setFormPersona({ ...formPersona, salary_amount: e.target.value })
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label>Moneda</label>
                      <select
                        className="form-control"
                        value={formPersona.salary_currency}
                        onChange={(e) =>
                          setFormPersona({ ...formPersona, salary_currency: e.target.value })
                        }
                      >
                        <option value="USD">Dólares (USD)</option>
                        <option value="VES">Bolívares (Bs.)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Frecuencia de pago</label>
                      <select
                        className="form-control"
                        value={formPersona.salary_period}
                        onChange={(e) =>
                          setFormPersona({ ...formPersona, salary_period: e.target.value })
                        }
                      >
                        <option value="diario">Por días</option>
                        <option value="semanal">Semanal</option>
                        <option value="quincenal">Quincenal</option>
                        <option value="mensual">Mensual</option>
                      </select>
                    </div>
                  </div>

                  <p className="texto-ayuda">
                    El salario se usa para generar el pago con un clic. El sistema no calcula
                    prestaciones, vacaciones ni retenciones de ley.
                  </p>
                </>
              )}
            </>
          )}

          {pestanaPersona === 'pago' && (
            <>
              <h4 className="subtitulo">Cuentas bancarias</h4>

              <div className="bloque-cuenta">
                <div className="grid-form">
                  <div className="form-group">
                    <label>Banco</label>
                    <input
                      className="form-control"
                      value={formPersona.bank_1_name}
                      onChange={(e) =>
                        setFormPersona({ ...formPersona, bank_1_name: e.target.value })
                      }
                      placeholder="Banesco"
                    />
                  </div>
                  <div className="form-group">
                    <label>Número de cuenta</label>
                    <input
                      className="form-control"
                      value={formPersona.bank_1_account}
                      onChange={(e) =>
                        setFormPersona({ ...formPersona, bank_1_account: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Titular</label>
                    <input
                      className="form-control"
                      value={formPersona.bank_1_holder}
                      onChange={(e) =>
                        setFormPersona({ ...formPersona, bank_1_holder: e.target.value })
                      }
                      placeholder="Si difiere del nombre"
                    />
                  </div>
                </div>
              </div>

              <div className="bloque-cuenta">
                <div className="grid-form">
                  <div className="form-group">
                    <label>Segundo banco</label>
                    <input
                      className="form-control"
                      value={formPersona.bank_2_name}
                      onChange={(e) =>
                        setFormPersona({ ...formPersona, bank_2_name: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Número de cuenta</label>
                    <input
                      className="form-control"
                      value={formPersona.bank_2_account}
                      onChange={(e) =>
                        setFormPersona({ ...formPersona, bank_2_account: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Titular</label>
                    <input
                      className="form-control"
                      value={formPersona.bank_2_holder}
                      onChange={(e) =>
                        setFormPersona({ ...formPersona, bank_2_holder: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="separador" />
              <h4 className="subtitulo">Pago móvil</h4>

              <div className="bloque-cuenta">
                <div className="grid-form">
                  <div className="form-group">
                    <label>Banco</label>
                    <input
                      className="form-control"
                      value={formPersona.mobile_1_bank}
                      onChange={(e) =>
                        setFormPersona({ ...formPersona, mobile_1_bank: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Teléfono</label>
                    <input
                      className="form-control"
                      value={formPersona.mobile_1_phone}
                      onChange={(e) =>
                        setFormPersona({ ...formPersona, mobile_1_phone: e.target.value })
                      }
                      placeholder="0414-1234567"
                    />
                  </div>
                  <div className="form-group">
                    <label>Cédula</label>
                    <input
                      className="form-control"
                      value={formPersona.mobile_1_id}
                      onChange={(e) =>
                        setFormPersona({ ...formPersona, mobile_1_id: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="bloque-cuenta">
                <div className="grid-form">
                  <div className="form-group">
                    <label>Segundo banco</label>
                    <input
                      className="form-control"
                      value={formPersona.mobile_2_bank}
                      onChange={(e) =>
                        setFormPersona({ ...formPersona, mobile_2_bank: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Teléfono</label>
                    <input
                      className="form-control"
                      value={formPersona.mobile_2_phone}
                      onChange={(e) =>
                        setFormPersona({ ...formPersona, mobile_2_phone: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Cédula</label>
                    <input
                      className="form-control"
                      value={formPersona.mobile_2_id}
                      onChange={(e) =>
                        setFormPersona({ ...formPersona, mobile_2_id: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            </>
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
              <CampoFecha
                className="form-control"
                value={formCompromiso.next_due_date}
                onChange={(v) =>
                  setFormCompromiso({ ...formCompromiso, next_due_date: v })
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
                <CampoFecha
                className="form-control"
                  value={pagoCompromiso.payment_date}
                  onChange={(v) =>
                    setPagoCompromiso({ ...pagoCompromiso, payment_date: v })
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

      {/* ------------------------------------------------ pago a empleado */}
      <Panel
        abierto={panel === 'pagar-empleado'}
        titulo={`Pagar a ${pagoEmpleado.persona?.full_name || ''}`}
        onCerrar={cerrarPanel}
      >
        {pagoEmpleado.persona && (
          <form onSubmit={registrarPagoEmpleado}>
            {pagoEmpleado.persona.salary_amount && (
              <div className="detalle-pago">
                <div>
                  <small>Salario configurado</small>
                  <strong>
                    {fmtMoneda(
                      pagoEmpleado.persona.salary_amount,
                      pagoEmpleado.persona.salary_currency
                    )}
                  </strong>
                </div>
                <div>
                  <small>Frecuencia</small>
                  <strong>{etiqueta(pagoEmpleado.persona.salary_period)}</strong>
                </div>
              </div>
            )}

            {(pagoEmpleado.persona.bank_1_name || pagoEmpleado.persona.mobile_1_phone) && (
              <div className="datos-cobro">
                <strong>Formas de pago registradas</strong>
                {pagoEmpleado.persona.bank_1_name && (
                  <div>
                    {pagoEmpleado.persona.bank_1_name} · {pagoEmpleado.persona.bank_1_account}
                  </div>
                )}
                {pagoEmpleado.persona.bank_2_name && (
                  <div>
                    {pagoEmpleado.persona.bank_2_name} · {pagoEmpleado.persona.bank_2_account}
                  </div>
                )}
                {pagoEmpleado.persona.mobile_1_phone && (
                  <div>
                    Pago móvil · {pagoEmpleado.persona.mobile_1_bank} ·{' '}
                    {pagoEmpleado.persona.mobile_1_phone}
                  </div>
                )}
              </div>
            )}

            <div className="form-group">
              <label>Concepto *</label>
              <input
                className="form-control"
                value={pagoEmpleado.concepto}
                onChange={(e) => setPagoEmpleado({ ...pagoEmpleado, concepto: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Monto en dólares *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                value={pagoEmpleado.amount_usd}
                onChange={(e) => {
                  const usd = e.target.value
                  setPagoEmpleado({
                    ...pagoEmpleado,
                    amount_usd: usd,
                    amount:
                      pagoEmpleado.currency === 'VES' && tasaHoy?.tasa && usd
                        ? (Number(usd) * tasaHoy.tasa).toFixed(2)
                        : pagoEmpleado.amount,
                  })
                }}
              />
            </div>

            <div className="form-group">
              <label>¿Con qué moneda se paga? *</label>
              <div className="opciones-moneda">
                {['USD', 'VES'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`opcion-moneda ${pagoEmpleado.currency === m ? 'activa' : ''}`}
                    onClick={() =>
                      setPagoEmpleado({
                        ...pagoEmpleado,
                        currency: m,
                        account_id: '',
                        amount:
                          m === 'VES' && tasaHoy?.tasa && pagoEmpleado.amount_usd
                            ? (Number(pagoEmpleado.amount_usd) * tasaHoy.tasa).toFixed(2)
                            : '',
                      })
                    }
                  >
                    <strong>{m === 'USD' ? 'Dólares' : 'Bolívares'}</strong>
                    <small>{m === 'USD' ? 'USD' : 'Bs.'}</small>
                  </button>
                ))}
              </div>
            </div>

            {pagoEmpleado.currency === 'VES' && tasaHoy?.tasa && (
              <div className="conversion-bloque">
                <div className="conversion-linea">
                  <span>Tasa del {fmtFecha(tasaHoy.fecha)}</span>
                  <strong>Bs. {fmtNumero(tasaHoy.tasa)}</strong>
                </div>
                <div className="conversion-linea destacada">
                  <span>Monto a pagar</span>
                  <strong>
                    {fmtMoneda(
                      Number(pagoEmpleado.amount) ||
                        Number(pagoEmpleado.amount_usd) * tasaHoy.tasa || 0,
                      'VES'
                    )}
                  </strong>
                </div>
              </div>
            )}

            <div className="grid-form">
              <div className="form-group">
                <label>Fecha *</label>
                <CampoFecha
                className="form-control"
                  value={pagoEmpleado.payment_date}
                  onChange={(v) =>
                    setPagoEmpleado({ ...pagoEmpleado, payment_date: v })
                  }
                />
              </div>

              <div className="form-group">
                <label>Cuenta de origen *</label>
                <select
                  className="form-control"
                  value={pagoEmpleado.account_id}
                  onChange={(e) =>
                    setPagoEmpleado({ ...pagoEmpleado, account_id: e.target.value })
                  }
                >
                  <option value="">Seleccione…</option>
                  {cuentas
                    .filter((c) => c.is_active && c.currency === pagoEmpleado.currency)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {fmtMoneda(c.current_balance, c.currency)}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <p className="texto-ayuda">
              Al registrar el pago se descargará el recibo para firma del beneficiario.
            </p>

            <div className="panel-acciones">
              <button type="button" className="btn btn-secundario" onClick={cerrarPanel}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={enviando}>
                {enviando ? 'Registrando…' : 'Pagar y generar recibo'}
              </button>
            </div>
          </form>
        )}
      </Panel>

      {/* ------------------------------------------- comisiones y ajustes */}
      <Panel
        abierto={panel === 'movimiento'}
        titulo="Comisión o ajuste de cuenta"
        onCerrar={cerrarPanel}
      >
        <p className="texto-ayuda">
          Para movimientos que no son gastos operativos: comisiones bancarias, ajustes de
          arqueo o intereses.
        </p>

        <form onSubmit={guardarMovimiento}>
          <div className="form-group">
            <label>Cuenta *</label>
            <select
              className="form-control"
              value={formMovimiento.account_id}
              onChange={(e) => setFormMovimiento({ ...formMovimiento, account_id: e.target.value })}
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
            <label>Tipo de movimiento *</label>
            <select
              className="form-control"
              value={formMovimiento.kind}
              onChange={(e) => setFormMovimiento({ ...formMovimiento, kind: e.target.value })}
            >
              <option value="comision_bancaria">Comisión bancaria (resta)</option>
              <option value="ajuste_negativo">Ajuste de arqueo · faltante (resta)</option>
              <option value="ajuste_positivo">Ajuste de arqueo · sobrante (suma)</option>
              <option value="interes_ganado">Intereses ganados (suma)</option>
              <option value="otro">Otro (suma)</option>
            </select>
          </div>

          <div className="grid-form">
            <div className="form-group">
              <label>Concepto *</label>
              <input
                className="form-control"
                value={formMovimiento.description}
                onChange={(e) =>
                  setFormMovimiento({ ...formMovimiento, description: e.target.value })
                }
                placeholder="Mantenimiento de cuenta"
              />
            </div>

            <div className="form-group">
              <label>Monto *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                value={formMovimiento.amount}
                onChange={(e) => setFormMovimiento({ ...formMovimiento, amount: e.target.value })}
              />
              <small className="texto-ayuda">Siempre positivo; el tipo define el signo.</small>
            </div>

            <div className="form-group">
              <label>Fecha *</label>
              <CampoFecha
                className="form-control"
                value={formMovimiento.date}
                onChange={(v) => setFormMovimiento({ ...formMovimiento, date: v })}
              />
            </div>
          </div>

          <div className="panel-acciones">
            <button type="button" className="btn btn-secundario" onClick={cerrarPanel}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Registrando…' : 'Registrar movimiento'}
            </button>
          </div>
        </form>
      </Panel>

      {/* ---------------------------------------------------- saldo inicial */}
      <Panel
        abierto={panel === 'saldo-inicial'}
        titulo={`Saldo inicial · ${saldoInicial.cuenta?.name || ''}`}
        onCerrar={cerrarPanel}
      >
        <p className="texto-ayuda">
          Fondos con los que se abrió la cuenta. Solo puede modificarse mientras no haya
          movimientos registrados; después debe usarse un ajuste de arqueo.
        </p>

        <form onSubmit={guardarSaldoInicial}>
          <div className="form-group">
            <label>Saldo inicial ({saldoInicial.cuenta?.currency})</label>
            <input
              type="number"
              step="0.01"
              className="form-control"
              value={saldoInicial.monto}
              onChange={(e) => setSaldoInicial({ ...saldoInicial, monto: e.target.value })}
              autoFocus
            />
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

      <LibroCuenta
        cuentaId={libroCuenta}
        abierto={Boolean(libroCuenta)}
        onCerrar={() => setLibroCuenta(null)}
      />

      <DetalleGasto
        expenseId={gastoDetalle}
        abierto={Boolean(gastoDetalle)}
        onCerrar={() => setGastoDetalle(null)}
        onCambio={cargar}
        categorias={categorias}
        personal={personal}
      />

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

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase, mensajeError } from '../lib/supabase'

const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [unidades, setUnidades] = useState([])
  const [condominio, setCondominio] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [errorPerfil, setErrorPerfil] = useState(null)

  // Referencia al perfil vigente, para comparar sin re-suscribir efectos
  const perfilRef = useRef(null)

  const montado = useRef(true)
  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])

  /**
   * Carga el perfil y las unidades asociadas al usuario.
   *
   * El rol SIEMPRE viene de la base de datos, nunca del cliente: aunque
   * alguien manipule este estado en el navegador, las políticas RLS del
   * servidor siguen bloqueando el acceso a los datos.
   *
   * Esta función nunca lanza excepciones hacia afuera: cualquier fallo
   * queda registrado en errorPerfil para que la interfaz pueda mostrarlo.
   */
  const cargarPerfil = useCallback(async (userId) => {
    if (!userId) {
      setPerfil(null)
      setUnidades([])
      setCondominio(null)
      return
    }

    try {
      const { data: prof, error: errProf } = await supabase
        .from('profiles')
        .select('id, full_name, national_id, phone, role, is_active, condominium_id, avatar_url')
        .eq('id', userId)
        .maybeSingle()

      if (errProf) throw errProf

      if (!prof) {
        setErrorPerfil(
          'Su usuario no tiene un perfil asignado. Contacte al administrador del condominio.'
        )
        setPerfil(null)
        setUnidades([])
        return
      }

      if (!prof.is_active) {
        setErrorPerfil('Su cuenta ha sido desactivada. Contacte al administrador.')
        setPerfil(null)
        setUnidades([])
        await supabase.auth.signOut()
        return
      }

      // Las unidades no deben impedir el acceso: un administrador no tiene
      // ninguna asignada, y un fallo aquí no justifica bloquear el ingreso.
      let lista = []
      try {
        const { data: mems, error: errMems } = await supabase
          .from('unit_members')
          .select('relation, is_primary, units:unit_id (id, code, tower, floor, condominium_id)')
          .eq('user_id', userId)

        if (errMems) throw errMems

        lista = (mems || [])
          .filter((m) => m.units)
          .map((m) => ({ ...m.units, relation: m.relation, is_primary: m.is_primary }))
      } catch (errU) {
        console.warn('No se pudieron cargar las unidades:', errU)
      }

      // Configuración del condominio: transparencia y visibilidad de morosidad
      let cond = null
      if (prof.condominium_id) {
        try {
          const { data: c } = await supabase
            .from('condominiums')
            .select('id, name, base_currency, show_finances_to_all, delinquency_visibility, logo_url, default_billing_mode, default_fee, due_day, late_fee_mode, late_fee_value, late_fee_grace_days, invoice_notes, auto_billing, auto_billing_day, exemption_redistributes')
            .eq('id', prof.condominium_id)
            .maybeSingle()
          cond = c || null
        } catch (errC) {
          console.warn('No se pudo cargar la configuración del condominio:', errC)
        }
      }

      perfilRef.current = prof
      setPerfil(prof)
      setUnidades(lista)
      setCondominio(cond)
      setErrorPerfil(null)
    } catch (err) {
      console.error('Error cargando perfil:', err)
      setErrorPerfil(mensajeError(err))
      setPerfil(null)
      setUnidades([])
      setCondominio(null)
    }
  }, [])

  useEffect(() => {
    let activo = true

    // El bloque finally garantiza que el indicador de carga siempre se
    // apague, incluso si cargarPerfil falla de forma inesperada.
    const sincronizar = async (userId) => {
      try {
        await cargarPerfil(userId)
      } finally {
        if (activo && montado.current) setCargando(false)
      }
    }

    // Sesión inicial
    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        if (!activo) return
        setSession(s)
        sincronizar(s?.user?.id)
      })
      .catch((err) => {
        console.error('Error obteniendo la sesión:', err)
        if (activo && montado.current) {
          setErrorPerfil(mensajeError(err))
          setCargando(false)
        }
      })

    // Cambios de sesión.
    //
    // El callback NO puede ser async: el cliente de Supabase mantiene un
    // bloqueo interno mientras se ejecuta, y un await dentro lo congela.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((evento, s) => {
      if (!activo) return

      setSession(s)

      // INITIAL_SESSION duplica la carga inicial; TOKEN_REFRESHED solo
      // renueva el token y no cambia el perfil.
      if (evento === 'INITIAL_SESSION' || evento === 'TOKEN_REFRESHED') return

      // Al volver de otra aplicación, Supabase revalida la sesión y emite
      // SIGNED_IN de nuevo. Si se recargara el perfil aquí, la interfaz
      // se reiniciaría y el usuario perdería lo que estuviera haciendo.
      if (evento === 'SIGNED_IN' && perfilRef.current?.id === s?.user?.id) {
        return
      }

      if (evento === 'SIGNED_OUT') {
        perfilRef.current = null
        setPerfil(null)
        setUnidades([])
        setCondominio(null)
        setErrorPerfil(null)
        setCargando(false)
        return
      }

      setCargando(true)
      sincronizar(s?.user?.id)
    })

    return () => {
      activo = false
      subscription?.unsubscribe()
    }
  }, [cargarPerfil])

  const iniciarSesion = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) return { ok: false, error: mensajeError(error) }
    return { ok: true, data }
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
  }

  const recuperarContrasena = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/restablecer`,
    })
    if (error) return { ok: false, error: mensajeError(error) }
    return { ok: true }
  }

  const cambiarContrasena = async (nueva) => {
    const { error } = await supabase.auth.updateUser({ password: nueva })
    if (error) return { ok: false, error: mensajeError(error) }
    return { ok: true }
  }

  const valor = {
    session,
    usuario: session?.user ?? null,
    perfil,
    unidades,
    condominio,
    finanzasPublicas: Boolean(condominio?.show_finances_to_all),
    visibilidadMorosidad: condominio?.delinquency_visibility || 'oculto',
    cargando,
    errorPerfil,
    esAdmin: perfil?.role === 'admin',
    esResidente: perfil?.role === 'resident',
    autenticado: Boolean(session && perfil),
    iniciarSesion,
    cerrarSesion,
    recuperarContrasena,
    cambiarContrasena,
    recargarPerfil: () => cargarPerfil(session?.user?.id),
  }

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan variables de entorno. Defina VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'condominios-auth',
  },
})

/**
 * Traduce los errores de Supabase y Postgres a mensajes comprensibles
 * en español. Sin esto, el usuario final ve códigos crudos como "422".
 */
export function mensajeError(error) {
  if (!error) return 'Ocurrió un error inesperado.'

  const msg = error.message || String(error)

  const mapa = {
    'Invalid login credentials': 'Correo o contraseña incorrectos.',
    'Email not confirmed': 'Debe confirmar su correo antes de ingresar.',
    'User already registered': 'Este correo ya está registrado.',
    'Password should be at least': 'La contraseña es demasiado corta.',
    'Email rate limit exceeded': 'Demasiados intentos. Espere unos minutos.',
    'Failed to fetch': 'Sin conexión con el servidor. Verifique su internet.',
    'NetworkError': 'Sin conexión con el servidor. Verifique su internet.',
    'New password should be different': 'La contraseña nueva debe ser distinta a la actual.',
    'same_password': 'La contraseña nueva debe ser distinta a la actual.',
    'weak_password':
      'La contraseña es demasiado débil. Use al menos 10 caracteres con letras y números.',
    'Password is known to be weak': 'Esa contraseña es demasiado común. Elija otra.',
    'Unable to validate email address': 'El formato del correo no es válido.',
    'over_email_send_rate_limit': 'Se enviaron demasiados correos. Espere unos minutos.',
    'Token has expired': 'El enlace expiró. Solicite uno nuevo.',
    'Auth session missing': 'La sesión expiró. Inicie sesión nuevamente.',
    'JWT expired': 'La sesión expiró. Inicie sesión nuevamente.',
    'infinite recursion': 'Error de configuración en los permisos. Avise al administrador.',
  }

  for (const [clave, valor] of Object.entries(mapa)) {
    if (msg.includes(clave)) return valor
  }

  // Códigos HTTP sin coincidencia en el mapa anterior
  if (error.status === 422) {
    return 'La contraseña no cumple los requisitos o es igual a la anterior. Use una distinta de al menos 10 caracteres.'
  }
  if (error.status === 429) {
    return 'Demasiadas solicitudes. Espere un momento e intente de nuevo.'
  }

  // Errores de Postgres lanzados por las funciones RPC
  if (error.code === '42501') return 'No tiene permisos para realizar esta acción.'
  if (error.code === '23505') return 'Ya existe un registro con esos datos.'
  if (error.code === '23503') return 'El registro está siendo usado por otro elemento.'
  if (error.code === '42P17') {
    return 'Error de configuración en los permisos. Avise al administrador.'
  }

  return msg
}

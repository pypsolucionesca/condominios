// =====================================================================
// Edge Function: invitar-residente
// Despliegue:  supabase functions deploy invitar-residente
//
// Crea el usuario en auth, su perfil y lo vincula a un apartamento.
// Usa SERVICE_ROLE, que NUNCA debe exponerse en el navegador.
// Solo un administrador autenticado puede ejecutarla.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!url || !anonKey || !serviceKey) {
      console.error('Faltan variables de entorno en la función')
      return json({ error: 'Función mal configurada. Avise al administrador.' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error('Petición sin cabecera Authorization')
      return json({ error: 'No autenticado' }, 401)
    }

    // 1) Verificar que quien llama es un administrador activo
    const clienteUsuario = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: errUser,
    } = await clienteUsuario.auth.getUser()

    if (errUser || !user) {
      console.error('Token inválido:', errUser?.message)
      return json({ error: 'Sesión inválida. Vuelva a iniciar sesión.' }, 401)
    }

    console.log('Solicitud de:', user.email, user.id)

    // El perfil se lee con el cliente admin, que salta RLS. Es seguro:
    // user.id proviene del token ya validado por getUser(), no de datos
    // que el cliente pueda falsificar.
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: perfil, error: errPerfil } = await admin
      .from('profiles')
      .select('role, is_active, condominium_id')
      .eq('id', user.id)
      .maybeSingle()

    if (errPerfil) {
      console.error('Error leyendo el perfil:', errPerfil)
      return json({ error: `Error leyendo el perfil: ${errPerfil.message}` }, 500)
    }
    if (!perfil) {
      console.error('Sin perfil para el usuario', user.id)
      return json({ error: 'Su usuario no tiene un perfil asignado.' }, 403)
    }
    if (perfil.role !== 'admin' || !perfil.is_active) {
      console.error('Rol insuficiente:', perfil.role, 'activo:', perfil.is_active)
      return json({ error: 'Se requiere rol de administrador activo.' }, 403)
    }

    // 2) Validar la entrada
    const body = await req.json().catch(() => ({}))
    console.log('Datos recibidos:', JSON.stringify(body))

    const email = String(body.email || '').trim().toLowerCase()
    const nombre = String(body.full_name || '').trim()
    const unitId = body.unit_id
    const relacion = body.relation || 'propietario'
    const cedula = body.national_id ? String(body.national_id).trim() : null
    const telefono = body.phone ? String(body.phone).trim() : null
    const esPrincipal = Boolean(body.is_primary)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Correo electrónico inválido' }, 400)
    }
    if (!nombre) return json({ error: 'El nombre es obligatorio' }, 400)
    if (!unitId) return json({ error: 'Debe indicar el apartamento' }, 400)
    if (!['propietario', 'inquilino', 'autorizado'].includes(relacion)) {
      return json({ error: 'Tipo de relación inválido' }, 400)
    }

    // 3) Confirmar que el apartamento existe
    const { data: unidad, error: errUnidad } = await admin
      .from('units')
      .select('id, code, condominium_id')
      .eq('id', unitId)
      .maybeSingle()

    if (errUnidad) {
      console.error('Error buscando el apartamento:', errUnidad)
      return json({ error: `Error buscando el apartamento: ${errUnidad.message}` }, 500)
    }
    if (!unidad) return json({ error: 'El apartamento no existe' }, 404)

    // 4) Crear o reutilizar el usuario
    let userId
    let yaExistia = false

    const destino = body.origin || 'https://condominios.pypcloud.com'

    const { data: invitado, error: errInv } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: nombre, role: 'resident' },
      redirectTo: `${destino}/restablecer`,
    })

    if (errInv) {
      console.warn('inviteUserByEmail falló:', errInv.message)

      const { data: lista, error: errLista } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      })

      if (errLista) {
        console.error('Error listando usuarios:', errLista)
        return json({ error: `No se pudo invitar: ${errInv.message}` }, 400)
      }

      const existente = lista?.users?.find((u) => u.email?.toLowerCase() === email)

      if (!existente) {
        return json({ error: `No se pudo enviar la invitación: ${errInv.message}` }, 400)
      }

      userId = existente.id
      yaExistia = true
      console.log('Usuario ya existente, se vinculará:', userId)
    } else {
      userId = invitado.user.id
      console.log('Usuario invitado:', userId)
    }

    // 5) Asegurar el perfil (el trigger pudo crearlo ya)
    const { error: errUpsertPerfil } = await admin.from('profiles').upsert(
      {
        id: userId,
        full_name: nombre,
        national_id: cedula,
        phone: telefono,
        role: 'resident',
        condominium_id: unidad.condominium_id,
        is_active: true,
      },
      { onConflict: 'id' }
    )
    if (errUpsertPerfil) {
      console.error('Error guardando el perfil:', errUpsertPerfil)
      return json({ error: `Error guardando el perfil: ${errUpsertPerfil.message}` }, 400)
    }

    // 6) Vincular al apartamento
    const { error: errVinculo } = await admin.from('unit_members').upsert(
      { unit_id: unitId, user_id: userId, relation: relacion, is_primary: esPrincipal },
      { onConflict: 'unit_id,user_id' }
    )
    if (errVinculo) {
      console.error('Error vinculando al apartamento:', errVinculo)
      return json({ error: `Error vinculando al apartamento: ${errVinculo.message}` }, 400)
    }

    const { error: errAudit } = await admin.from('audit_log').insert({
      actor_id: user.id,
      action: 'invitar_residente',
      entity: 'unit_members',
      entity_id: unitId,
      payload: { email, unit_code: unidad.code, relation: relacion, ya_existia: yaExistia },
    })
    if (errAudit) console.warn('No se pudo registrar en auditoría:', errAudit.message)

    console.log('Invitación completada para', email)

    return json({
      ok: true,
      user_id: userId,
      ya_existia: yaExistia,
      mensaje: yaExistia
        ? `El usuario ya existía y fue vinculado al apartamento ${unidad.code}.`
        : `Invitación enviada a ${email} para el apartamento ${unidad.code}.`,
    })
  } catch (err) {
    console.error('Error no controlado:', err)
    return json({ error: err.message || 'Error interno' }, 500)
  }
})

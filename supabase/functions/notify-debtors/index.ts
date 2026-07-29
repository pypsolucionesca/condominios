import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { condominium_id } = await req.json()
    if (!condominium_id) throw new Error("ID de condominio requerido.")

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Validar que quien ejecuta es administrador
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) throw new Error("No autorizado.")

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') throw new Error("Permisos insuficientes. Solo el administrador puede enviar notificaciones masivas.")

    // 2. Obtener todas las unidades con deuda
    const { data: unitsWithDebt, error: dbError } = await supabase.rpc('units_with_debt', { p_condominium_id: condominium_id })
    if (dbError) throw dbError

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) throw new Error("Falta configurar la llave de Resend para los correos.")

    let notificados = 0

    // 3. Iterar sobre los deudores y enviar
    for (const unit of (unitsWithDebt || [])) {
      if (Number(unit.total_debt) <= 0) continue

      const { data: members } = await supabase
        .from('unit_members')
        .select('user_id, profiles!inner(email, full_name)')
        .eq('unit_id', unit.unit_id)

      if (!members || members.length === 0) continue

      for (const member of members) {
        const email = member.profiles?.email
        const nombre = member.profiles?.full_name

        if (email) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: 'P&P Admin <condominios@pypcloud.com>',
              to: [email],
              subject: `Recordatorio de Pago - Apto. ${unit.unit_code}`,
              html: `
                <div style="font-family: Arial, sans-serif; color: #333;">
                  <h2>Hola, ${nombre}</h2>
                  <p>Este es un recordatorio sobre el saldo pendiente de su unidad <strong>${unit.unit_code}</strong>.</p>
                  <p>Deuda actual: <strong style="font-size: 1.2rem; color: #b91c1c;">$${Number(unit.total_debt).toFixed(2)}</strong></p>
                  <p>Por favor, ingrese a la plataforma para ver los detalles de pago y reportar su transferencia o pago móvil.</p>
                  <p>Saludos cordiales,<br/>La Administración.</p>
                </div>
              `,
            }),
          })
        }

        // Insertar notificación in-app / push
        await supabase.from('notifications').insert({
          user_id: member.user_id,
          condominium_id: condominium_id,
          kind: 'recordatorio',
          title: 'Recordatorio de pago pendiente',
          body: `La unidad ${unit.unit_code} presenta un saldo de $${Number(unit.total_debt).toFixed(2)}.`,
          link: '/mi-cuenta'
        })

        notificados++
      }
    }

    return new Response(
      JSON.stringify({ usuariosNotificados: notificados }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
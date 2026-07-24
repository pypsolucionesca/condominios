// =====================================================================
// Edge Function: despachar-notificaciones
//
// Envía por correo (Resend) y push (Web Push nativo) las notificaciones
// pendientes. Se invoca desde un cron de Supabase cada pocos minutos.
//
// Variables de entorno necesarias:
//   RESEND_API_KEY        clave de Resend
//   NOTIF_FROM            remitente, ej. "Condominio <notificaciones@pypcloud.com>"
//   APP_URL               https://condominios.pypcloud.com
//   VAPID_PUBLIC_KEY      clave pública VAPID
//   VAPID_PRIVATE_KEY     clave privada VAPID
//   VAPID_SUBJECT         mailto:admin@pypcloud.com
//
// Despliegue:
//   supabase functions deploy despachar-notificaciones
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (b, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

const LOTE = 50

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // La función se despliega sin verificación de JWT porque la clave
    // service_role del proyecto usa el formato nuevo y no es un JWT
    // válido. Se protege con un secreto propio: sin él, cualquiera
    // podría disparar el envío de correos.
    const secreto = Deno.env.get('CRON_SECRET')

    if (secreto) {
      const recibido =
        req.headers.get('x-cron-secret') ||
        new URL(req.url).searchParams.get('secret')

      if (recibido !== secreto) {
        console.warn('Intento de invocación sin secreto válido')
        return json({ error: 'No autorizado' }, 401)
      }
    }

    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const remitente = Deno.env.get('NOTIF_FROM') || 'Condominio <onboarding@resend.dev>'
    const appUrl = Deno.env.get('APP_URL') || 'https://condominios.pypcloud.com'

    const vapidPublica = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivada = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSujeto = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@pypcloud.com'

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const resultado = { correos: 0, push: 0, errores: [] as string[] }

    // -----------------------------------------------------------------
    // CORREOS PENDIENTES
    // -----------------------------------------------------------------
    if (resendKey) {
      const { data: pendientes, error } = await admin
        .from('notifications')
        .select('id, user_id, kind, title, body, link, condominium_id, profiles:user_id (full_name)')
        .is('email_sent_at', null)
        .order('created_at')
        .limit(LOTE)

      if (error) {
        resultado.errores.push(`Consulta de correos: ${error.message}`)
      } else if (pendientes?.length) {
        // El correo no está en profiles: hay que leerlo de auth.users
        const ids = [...new Set(pendientes.map((n) => n.user_id))]
        const correos: Record<string, string> = {}

        for (const id of ids) {
          const { data } = await admin.auth.admin.getUserById(id)
          if (data?.user?.email) correos[id] = data.user.email
        }

        // Datos del condominio para personalizar la plantilla
        const condominios: Record<string, any> = {}
        const idsCondo = [...new Set(pendientes.map((n: any) => n.condominium_id))]
        for (const idc of idsCondo) {
          const { data: c } = await admin
            .from('condominiums')
            .select('name, logo_url, invoice_notes')
            .eq('id', idc)
            .maybeSingle()
          if (c) condominios[idc] = c
        }

        for (const n of pendientes) {
          const destino = correos[n.user_id]

          // Sin dirección no hay nada que enviar: se marca para no reintentar
          if (!destino) {
            await admin
              .from('notifications')
              .update({ email_sent_at: new Date().toISOString() })
              .eq('id', n.id)
            continue
          }

          try {
            const resp = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${resendKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: remitente,
                to: [destino],
                subject: `${condominios[n.condominium_id]?.name || 'Condominio'} · ${n.title}`,
                html: plantillaCorreo({
                  titulo: n.title,
                  cuerpo: n.body,
                  nombre: n.profiles?.full_name,
                  enlace: n.link ? `${appUrl}${n.link}` : appUrl,
                  appUrl,
                  condominio: condominios[n.condominium_id],
                }),
              }),
            })

            if (resp.ok) {
              await admin
                .from('notifications')
                .update({ email_sent_at: new Date().toISOString() })
                .eq('id', n.id)
              resultado.correos++
            } else {
              const detalle = await resp.text()
              resultado.errores.push(`Resend ${resp.status}: ${detalle.slice(0, 120)}`)
            }
          } catch (err) {
            resultado.errores.push(`Correo ${n.id}: ${err.message}`)
          }
        }
      }
    }

    // -----------------------------------------------------------------
    // PUSH PENDIENTES
    // -----------------------------------------------------------------
    if (vapidPublica && vapidPrivada) {
      webpush.setVapidDetails(vapidSujeto, vapidPublica, vapidPrivada)

      const { data: pendientes, error } = await admin
        .from('notifications')
        .select('id, user_id, title, body, link')
        .is('push_sent_at', null)
        .order('created_at')
        .limit(LOTE)

      if (error) {
        resultado.errores.push(`Consulta de push: ${error.message}`)
      } else if (pendientes?.length) {
        const ids = [...new Set(pendientes.map((n) => n.user_id))]

        const { data: subs } = await admin
          .from('push_subscriptions')
          .select('id, user_id, endpoint, p256dh, auth')
          .in('user_id', ids)

        const porUsuario: Record<string, any[]> = {}
        for (const s of subs || []) {
          ;(porUsuario[s.user_id] ||= []).push(s)
        }

        for (const n of pendientes) {
          const destinos = porUsuario[n.user_id] || []

          // Sin dispositivos registrados no hay push que enviar
          if (!destinos.length) {
            await admin
              .from('notifications')
              .update({ push_sent_at: new Date().toISOString() })
              .eq('id', n.id)
            continue
          }

          let alguno = false

          for (const s of destinos) {
            try {
              await webpush.sendNotification(
                {
                  endpoint: s.endpoint,
                  keys: { p256dh: s.p256dh, auth: s.auth },
                },
                JSON.stringify({
                  title: n.title,
                  body: n.body,
                  url: n.link || '/',
                  tag: n.id,
                })
              )
              alguno = true

              await admin
                .from('push_subscriptions')
                .update({ last_used_at: new Date().toISOString(), failed_count: 0 })
                .eq('id', s.id)
            } catch (err: any) {
              // 404 y 410 significan suscripción caducada: se elimina
              if (err.statusCode === 404 || err.statusCode === 410) {
                await admin.from('push_subscriptions').delete().eq('id', s.id)
              } else {
                await admin
                  .from('push_subscriptions')
                  .update({ failed_count: (s.failed_count || 0) + 1 })
                  .eq('id', s.id)
                resultado.errores.push(`Push ${s.id}: ${err.message}`)
              }
            }
          }

          if (alguno) resultado.push++

          await admin
            .from('notifications')
            .update({ push_sent_at: new Date().toISOString() })
            .eq('id', n.id)
        }
      }
    }

    return json({ ok: true, ...resultado })
  } catch (err) {
    console.error('Error no controlado:', err)
    return json({ error: err.message || 'Error interno' }, 500)
  }
})

/**
 * Plantilla HTML del correo.
 *
 * Los estilos van en línea porque los clientes de correo ignoran las
 * hojas de estilo. Se personaliza con el nombre y el logo del
 * condominio para que el residente reconozca de dónde viene.
 */
function plantillaCorreo({ titulo, cuerpo, nombre, enlace, appUrl, condominio }: {
  titulo: string
  cuerpo: string
  nombre?: string
  enlace: string
  appUrl: string
  condominio?: { name?: string; logo_url?: string; invoice_notes?: string }
}) {
  const nombreCondo = condominio?.name || 'Condominio'
  const logo = condominio?.logo_url

  const cabeceraLogo = logo
    ? `<img src="${logo}" alt="" width="46" height="46" style="display:block;border-radius:50%;background:#fff;object-fit:cover;">`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:28px 14px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">

        <tr><td style="background:#0f172a;padding:20px 26px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              ${cabeceraLogo ? `<td width="58" valign="middle">${cabeceraLogo}</td>` : ''}
              <td valign="middle">
                <div style="color:#ffffff;font-size:16px;font-weight:700;line-height:1.3;">${escapar(nombreCondo)}</div>
                <div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:2px;">Gestión y Finanzas</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:28px 26px;">
          ${nombre ? `<p style="margin:0 0 14px;color:#64748b;font-size:14px;">Hola, ${escapar(nombre)}:</p>` : ''}
          <h1 style="margin:0 0 14px;font-size:19px;color:#0f172a;font-weight:700;line-height:1.35;">${escapar(titulo)}</h1>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.65;color:#334155;">${escapar(cuerpo)}</p>
          <a href="${enlace}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">Ver en el sistema</a>
        </td></tr>

        ${
          condominio?.invoice_notes
            ? `<tr><td style="padding:0 26px 22px;">
                 <div style="padding:14px 16px;background:#f8fafc;border-left:3px solid #1d4ed8;border-radius:6px;font-size:13px;line-height:1.6;color:#475569;">
                   ${escapar(condominio.invoice_notes).replace(/\n/g, '<br>')}
                 </div>
               </td></tr>`
            : ''
        }

        <tr><td style="padding:18px 26px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:11.5px;color:#94a3b8;line-height:1.6;">
            Mensaje automático de ${escapar(nombreCondo)}.
            Puede desactivar estos avisos desde
            <a href="${appUrl}/perfil" style="color:#64748b;">su perfil</a>.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function escapar(t: string) {
  return String(t || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

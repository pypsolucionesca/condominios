// =====================================================================
// Edge Function: actualizar-tasa
//
// Obtiene la tasa oficial del BCV desde DolarApi y la registra.
// Adaptada de la implementación de Ciana, ya probada en producción.
//
// Fuente principal:  https://ve.dolarapi.com/v1/dolares/oficial
// Fuente secundaria: https://ve.dolarapi.com/v1/dolares  (lista completa)
//
// Si ambas fallan, conserva la última tasa y la marca como obsoleta,
// en lugar de escribir un valor inventado.
//
// Despliegue:  supabase functions deploy actualizar-tasa
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

interface EntradaDolarApi {
  fuente: string
  nombre: string
  compra: number | null
  venta: number | null
  promedio: number
  fechaActualizacion: string
}

interface Tasas {
  bcv: number
  paralela?: number
}

/** Petición con tiempo límite: una API colgada no debe bloquear la función. */
async function pedirConLimite(url: string, msLimite = 10000): Promise<Response> {
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), msLimite)
  try {
    return await fetch(url, {
      signal: control.signal,
      headers: {
        'User-Agent': 'CondominiosPyP/1.0',
        Accept: 'application/json',
      },
    })
  } finally {
    clearTimeout(temporizador)
  }
}

/** Descarta valores absurdos antes de escribirlos en la base. */
function tasaValida(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 100000
}

async function fuentePrincipal(): Promise<Tasas | null> {
  try {
    const res = await pedirConLimite('https://ve.dolarapi.com/v1/dolares/oficial')
    if (!res.ok) {
      console.log('DolarApi /oficial devolvió', res.status)
      return null
    }
    const datos: EntradaDolarApi = await res.json()
    if (!tasaValida(datos?.promedio)) {
      console.log('DolarApi /oficial: valor inválido', datos?.promedio)
      return null
    }
    return { bcv: datos.promedio }
  } catch (err) {
    console.error('DolarApi /oficial falló:', (err as Error).message)
    return null
  }
}

async function fuenteSecundaria(): Promise<Tasas | null> {
  try {
    const res = await pedirConLimite('https://ve.dolarapi.com/v1/dolares')
    if (!res.ok) {
      console.log('DolarApi /dolares devolvió', res.status)
      return null
    }
    const lista: EntradaDolarApi[] = await res.json()
    if (!Array.isArray(lista) || lista.length === 0) return null

    const oficial = lista.find(
      (e) =>
        e.nombre?.toLowerCase().includes('oficial') ||
        e.fuente?.toLowerCase().includes('oficial') ||
        e.fuente?.toLowerCase().includes('bcv')
    )

    const paralela = lista.find(
      (e) =>
        e.nombre?.toLowerCase().includes('paralelo') ||
        e.fuente?.toLowerCase().includes('paralelo')
    )

    if (!oficial || !tasaValida(oficial.promedio)) return null

    return {
      bcv: oficial.promedio,
      paralela: tasaValida(paralela?.promedio) ? paralela!.promedio : undefined,
    }
  } catch (err) {
    console.error('DolarApi /dolares falló:', (err as Error).message)
    return null
  }
}

/**
 * Notifica a los administradores que la tasa del día no se pudo obtener.
 * Se llama solo cuando el último intento del día falla, o en el
 * recordatorio del mediodía si sigue sin tasa. Usa la RPC notify_admins
 * a través de un insert directo en notifications por cada admin activo.
 */
async function notificarAdminSinTasa(admin: any, fecha: string, esRecordatorio: boolean) {
  try {
    const { data: condos } = await admin.from('condominiums').select('id')
    if (!condos?.length) return

    const titulo = esRecordatorio
      ? 'La tasa sigue sin actualizarse'
      : 'La tasa del día no se pudo actualizar'
    const cuerpo = esRecordatorio
      ? `Al mediodía aún no hay tasa del BCV para hoy (${fecha}). Cárguela manualmente en Ajustes para que los residentes puedan pagar en bolívares.`
      : `Los intentos automáticos de obtener la tasa del BCV fallaron hoy (${fecha}). Revise el sistema y, si hace falta, cargue la tasa manualmente en Ajustes.`

    for (const c of condos) {
      // notify_admins inserta una notificación para cada admin del condominio
      await admin.rpc('notify_admins', {
        p_condominium_id: c.id,
        p_kind: 'general',
        p_title: titulo,
        p_body: cuerpo,
        p_link: '/configuracion',
        p_payload: { motivo: 'tasa_no_actualizada', fecha },
      })
    }
  } catch (err) {
    console.error('No se pudo notificar a los admins:', (err as Error).message)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!url || !serviceKey) {
      return json({ error: 'Faltan variables de entorno en la función' }, 500)
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const hoy = new Date().toISOString().split('T')[0]

    // Parámetros opcionales del cron: qué intento es y si es el último
    // del día. Permite reintentos escalonados (4, 5, 6 AM) que solo
    // actúan si aún falta la tasa, y notificar al admin si el final falla.
    let intento = 1
    let esFinal = false
    let esRecordatorio = false
    try {
      const body = await req.json()
      intento = Number(body?.intento) || 1
      esFinal = Boolean(body?.es_final)
      esRecordatorio = Boolean(body?.recordatorio)
    } catch {
      /* sin body: ejecución normal */
    }

    // Si ya existe la tasa de hoy con estado válido, no se reintenta:
    // el intento anterior tuvo éxito. (No aplica al recordatorio, que
    // solo verifica y notifica.)
    const { data: yaHoy } = await admin
      .from('exchange_rates')
      .select('rate_date, status')
      .eq('rate_date', hoy)
      .in('status', ['active', 'fallback'])
      .maybeSingle()

    if (yaHoy && !esRecordatorio) {
      return json({ ok: true, ya_existia: true, fecha: hoy, mensaje: 'La tasa de hoy ya estaba registrada.' })
    }

    // El recordatorio del mediodía solo verifica y avisa; no consulta la API.
    if (esRecordatorio) {
      if (!yaHoy) {
        await notificarAdminSinTasa(admin, hoy, true)
        return json({ ok: false, sin_tasa: true, recordatorio: true, mensaje: 'Recordatorio enviado: aún sin tasa.' })
      }
      return json({ ok: true, ya_existia: true, mensaje: 'Al mediodía ya había tasa.' })
    }

    console.log('Consultando fuente principal…')
    let tasas = await fuentePrincipal()
    let origen = 'dolarapi-oficial'
    let estado = 'active'

    if (!tasas) {
      console.log('Principal sin respuesta, probando la lista completa…')
      tasas = await fuenteSecundaria()
      origen = 'dolarapi-lista'
      estado = 'fallback'
    } else {
      // La paralela solo está en el endpoint de lista; se intenta sin
      // que su fallo afecte al resultado principal.
      const extra = await fuenteSecundaria()
      if (extra?.paralela) tasas.paralela = extra.paralela
    }

    // Ninguna fuente respondió: se conserva la última y se marca obsoleta
    if (!tasas) {
      console.log('Ambas fuentes fallaron. Se conserva la última tasa.')

      const { data: ultima } = await admin
        .from('exchange_rates')
        .select('id, rate_bcv, rate_date')
        .order('rate_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (ultima) {
        await admin.from('exchange_rates').update({ status: 'stale' }).eq('id', ultima.id)
      }

      // Si este era el último intento del día y seguimos sin tasa de hoy,
      // se avisa al administrador para que la cargue manualmente.
      if (esFinal) {
        await notificarAdminSinTasa(admin, hoy, false)
      }

      return json(
        {
          error: 'Las fuentes de tasa no respondieron',
          intento,
          es_final: esFinal,
          tasa_vigente: ultima?.rate_bcv ?? null,
          fecha_vigente: ultima?.rate_date ?? null,
        },
        503
      )
    }

    // Variación desmedida: probablemente un error de la fuente.
    // Una tasa errónea corrompe todos los cobros del día, así que se
    // prefiere no escribir nada y avisar.
    const { data: anterior } = await admin
      .from('exchange_rates')
      .select('rate_bcv, rate_date')
      .lt('rate_date', new Date().toISOString().split('T')[0])
      .order('rate_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (anterior?.rate_bcv) {
      const variacion = Math.abs(tasas.bcv - anterior.rate_bcv) / anterior.rate_bcv
      if (variacion > 0.3) {
        console.warn(
          `Variación del ${(variacion * 100).toFixed(1)}% respecto al ${anterior.rate_date}. No se registra.`
        )
        return json(
          {
            error: 'Variación anómala en la tasa recibida',
            recibida: tasas.bcv,
            anterior: anterior.rate_bcv,
            variacion_pct: Number((variacion * 100).toFixed(2)),
            mensaje:
              'La tasa obtenida difiere demasiado de la anterior. Verifique y cárguela manualmente si es correcta.',
          },
          409
        )
      }
    }

    const { data, error } = await admin
      .from('exchange_rates')
      .upsert(
        {
          rate_date: hoy,
          rate_bcv: tasas.bcv,
          rate_parallel: tasas.paralela ?? null,
          source: origen,
          status: estado,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'rate_date' }
      )
      .select()
      .single()

    if (error) {
      console.error('Error guardando la tasa:', error)
      return json({ error: 'No se pudo guardar la tasa', detalle: error.message }, 500)
    }

    console.log(`Tasa registrada: ${tasas.bcv} (${origen})`)

    return json({
      ok: true,
      fecha: hoy,
      tasa_bcv: tasas.bcv,
      tasa_paralela: tasas.paralela ?? null,
      origen,
      estado,
      mensaje: `1 USD = ${tasas.bcv} Bs.`,
    })
  } catch (err) {
    console.error('Error no controlado:', err)
    return json({ error: 'Error interno', detalle: String(err) }, 500)
  }
})

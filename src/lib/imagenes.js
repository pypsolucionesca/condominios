import { supabase } from './supabase'

/**
 * Comprime una imagen a WebP directamente en el navegador.
 *
 * Se hace aquí y no en el servidor por tres razones: no consume cuota de
 * Edge Functions, el usuario sube menos datos (importante con conexiones
 * lentas o datos móviles), y no requiere dependencias externas[cite: 3].
 *
 * Un logo típico de 800 KB queda en unos 30 KB[cite: 3].
 */
export async function comprimirImagen(file, opciones = {}) {
  const {
    maxAncho = 512,
    maxAlto = 512,
    calidad = 0.85,
    formato = 'image/webp',
  } = opciones

  if (!file || !file.type.startsWith('image/')) {
    throw new Error('El archivo seleccionado no es una imagen.')
  }

  const bitmap = await crearBitmap(file)

  // Escala manteniendo la proporción; nunca amplía imágenes pequeñas[cite: 3]
  let { width, height } = bitmap
  const escala = Math.min(maxAncho / width, maxAlto / height, 1)
  width = Math.round(width * escala)
  height = Math.round(height * escala)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)

  if (bitmap.close) bitmap.close()

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen.'))),
      formato,
      calidad
    )
  })

  // Safari antiguo no soporta WebP en toBlob y devuelve PNG[cite: 3]
  const extension = blob.type === 'image/webp' ? 'webp' : 'png'

  return { blob, extension, tamanoOriginal: file.size, tamanoFinal: blob.size }
}

async function crearBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      /* algunos navegadores fallan con ciertos formatos; se usa el respaldo[cite: 3] */
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen.'))
    }
    img.src = url
  })
}

/**
 * Valida de forma segura si la empresa actual tiene suficiente
 * espacio en su cuota de almacenamiento para subir un nuevo archivo.
 */
async function verificarCuota(tamanoBytesNuevos) {
  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) return // Falla silenciosa si no hay sesión para dejar que las políticas RLS actúen.

  // Buscamos a qué condominio pertenece el usuario activo
  const { data: perfil } = await supabase
    .from('profiles')
    .select('condominium_id')
    .eq('id', authData.user.id)
    .single()

  if (!perfil?.condominium_id) return

  // Buscamos los valores de uso y límite en la tabla maestra
  const { data: condo } = await supabase
    .from('condominiums')
    .select('storage_used_bytes, storage_limit_bytes')
    .eq('id', perfil.condominium_id)
    .single()

  if (!condo) return

  const limite = Number(condo.storage_limit_bytes) || 1073741824 // 1 GB por defecto
  const usado = Number(condo.storage_used_bytes) || 0

  if (usado + tamanoBytesNuevos > limite) {
    throw new Error(
      `Límite de almacenamiento alcanzado (${formatearTamano(limite)}). Elimine archivos antiguos o contacte a P&P Soluciones.`
    )
  }
}

/**
 * Comprime y sube una imagen a Supabase Storage[cite: 3].
 * Devuelve la URL pública lista para guardar en la base de datos[cite: 3].
 */
export async function subirImagen(file, bucket, ruta, opciones = {}) {
  const { blob, extension, tamanoOriginal, tamanoFinal } = await comprimirImagen(file, opciones)

  // Verificamos el espacio antes de procesar la subida
  await verificarCuota(tamanoFinal)

  const nombre = `${ruta}-${Date.now()}.${extension}`

  const { error } = await supabase.storage.from(bucket).upload(nombre, blob, {
    contentType: blob.type,
    upsert: true,
    cacheControl: '3600',
  })

  if (error) throw error

  const { data } = supabase.storage.from(bucket).getPublicUrl(nombre)

  return {
    url: data.publicUrl,
    ruta: nombre,
    tamanoOriginal,
    tamanoFinal,
    reduccion: Math.round((1 - tamanoFinal / tamanoOriginal) * 100),
  }
}

/** Sube el logo de una unidad. Solo administradores[cite: 3]. */
export function subirLogoUnidad(file, unitId) {
  return subirImagen(file, 'logos', `unidad/${unitId}`, {
    maxAncho: 512,
    maxAlto: 512,
    calidad: 0.85,
  })
}

/**
 * Sube el logo del condominio (el que aparece en avisos, recibos y
 * reportes en PDF). Es distinto de la marca de la aplicación: cada
 * condominio personaliza sus documentos con su propia imagen[cite: 3].
 */
export function subirLogoCondominio(file, condominiumId) {
  return subirImagen(file, 'logos', `condominio/${condominiumId}`, {
    maxAncho: 512,
    maxAlto: 512,
    calidad: 0.85,
  })
}

/** Sube el avatar del usuario. La carpeta debe ser su propio id[cite: 3]. */
export function subirAvatar(file, userId) {
  return subirImagen(file, 'avatars', `${userId}/perfil`, {
    maxAncho: 400,
    maxAlto: 400,
    calidad: 0.85,
  })
}

/**
 * Sube un comprobante de pago. Se permite más resolución porque el
 * administrador necesita leer números de referencia[cite: 3].
 */
export async function subirComprobante(file, unitId) {
  // Los PDF se suben tal cual: comprimirlos como imagen los destruiría[cite: 3]
  if (file.type === 'application/pdf') {
    await verificarCuota(file.size)

    const nombre = `${unitId}/${Date.now()}.pdf`
    const { error } = await supabase.storage.from('receipts').upload(nombre, file, {
      contentType: 'application/pdf',
      upsert: false,
    })
    if (error) throw error
    return { ruta: nombre, tamanoFinal: file.size }
  }

  const { blob, extension } = await comprimirImagen(file, {
    maxAncho: 1400,
    maxAlto: 1400,
    calidad: 0.82,
  })

  await verificarCuota(blob.size)

  const nombre = `${unitId}/${Date.now()}.${extension}`

  const { error } = await supabase.storage.from('receipts').upload(nombre, blob, {
    contentType: blob.type,
    upsert: false,
  })
  if (error) throw error

  return { ruta: nombre, tamanoFinal: blob.size }
}

/**
 * Genera una URL temporal para ver un comprobante[cite: 3].
 * El bucket es privado, así que no sirve getPublicUrl[cite: 3].
 */
export async function urlComprobante(ruta, segundos = 3600) {
  if (!ruta) return null
  const { data, error } = await supabase.storage
    .from('receipts')
    .createSignedUrl(ruta, segundos)
  if (error) return null
  return data.signedUrl
}

export function formatearTamano(bytes) {
  if (!bytes) return '0 KB'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}
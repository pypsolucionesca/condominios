/* Formato y etiquetas compartidas por toda la aplicación. */

export const fmtUSD = (n) =>
  new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(n) || 0)

export const fmtVES = (n) =>
  `Bs. ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2 }).format(Number(n) || 0)}`

export const fmtMoneda = (n, moneda) => (moneda === 'VES' ? fmtVES(n) : fmtUSD(n))

export const fmtNumero = (n, decimales = 2) =>
  new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(Number(n) || 0)

export const fmtFecha = (f) => {
  if (!f) return '—'
  const d = typeof f === 'string' ? new Date(f.length === 10 ? f + 'T00:00:00' : f) : new Date(f)
  return isNaN(d)
    ? String(f)
    : d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export const fmtFechaLarga = (f) => {
  if (!f) return '—'
  const d = typeof f === 'string' ? new Date(f.length === 10 ? f + 'T00:00:00' : f) : new Date(f)
  return isNaN(d)
    ? String(f)
    : d.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })
}

export const fmtMesAno = (f) => {
  if (!f) return '—'
  const d = new Date(f.length === 10 ? f + 'T00:00:00' : f)
  if (isNaN(d)) return String(f)
  const t = d.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Fecha y hora en zona horaria de Venezuela, para sellos de actualización. */
export const fmtHoraLocal = (f) => {
  if (!f) return '—'
  const d = new Date(f)
  if (isNaN(d)) return String(f)

  const hoyStr = new Date().toDateString()
  const hora = d.toLocaleTimeString('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Caracas',
  })

  // Si es de hoy basta la hora; si no, se antepone la fecha
  if (d.toDateString() === hoyStr) return `Hoy ${hora}`

  return `${d.toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Caracas',
  })} ${hora}`
}

export const hoy = () => new Date().toISOString().slice(0, 10)

export const TIPOS_UNIDAD = [
  { valor: 'apartamento', etiqueta: 'Apartamento' },
  { valor: 'local_comercial', etiqueta: 'Local comercial' },
  { valor: 'oficina', etiqueta: 'Oficina' },
  { valor: 'deposito', etiqueta: 'Depósito' },
  { valor: 'estacionamiento', etiqueta: 'Estacionamiento' },
  { valor: 'otro', etiqueta: 'Otro' },
]

export const TIPOS_UBICACION = [
  { valor: 'torre', etiqueta: 'Torre' },
  { valor: 'edificio', etiqueta: 'Edificio' },
  { valor: 'parque', etiqueta: 'Parque' },
  { valor: 'modulo', etiqueta: 'Módulo' },
  { valor: 'nivel', etiqueta: 'Nivel' },
  { valor: 'calle', etiqueta: 'Calle' },
  { valor: 'otro', etiqueta: 'Otro' },
]

export const RELACIONES = [
  { valor: 'propietario', etiqueta: 'Propietario' },
  { valor: 'inquilino', etiqueta: 'Inquilino' },
  { valor: 'autorizado', etiqueta: 'Autorizado' },
]

export const FRECUENCIAS = [
  { valor: 'semanal', etiqueta: 'Semanal' },
  { valor: 'quincenal', etiqueta: 'Quincenal' },
  { valor: 'mensual', etiqueta: 'Mensual' },
  { valor: 'bimestral', etiqueta: 'Bimestral' },
  { valor: 'anual', etiqueta: 'Anual' },
]

export const TIPOS_BENEFICIARIO = [
  { valor: 'empleado', etiqueta: 'Empleado' },
  { valor: 'proveedor', etiqueta: 'Proveedor' },
  { valor: 'servicio', etiqueta: 'Servicio' },
  { valor: 'otro', etiqueta: 'Otro' },
]

const ETIQUETAS = {
  // Estados de avisos
  borrador: 'Borrador',
  emitido: 'Pendiente',
  parcial: 'Abonado',
  pagado: 'Pagado',
  exonerado: 'Exonerado',
  anulado: 'Anulado',
  // Estados de pagos
  reportado: 'Por verificar',
  confirmado: 'Confirmado',
  rechazado: 'Rechazado',
  // Tipos de cargo
  ordinaria: 'Cuota ordinaria',
  extraordinaria: 'Cuota extraordinaria',
  multa: 'Multa',
  consumo: 'Consumo',
  interes_mora: 'Interés de mora',
  otro: 'Otro',
  // Cuentas
  caja: 'Caja',
  banco: 'Banco',
  fondo_reserva: 'Fondo de reserva',
  // Unidades
  apartamento: 'Apartamento',
  local_comercial: 'Local comercial',
  oficina: 'Oficina',
  deposito: 'Depósito',
  estacionamiento: 'Estacionamiento',
  torre: 'Torre',
  edificio: 'Edificio',
  parque: 'Parque',
  modulo: 'Módulo',
  nivel: 'Nivel',
  calle: 'Calle',
  // Personas
  propietario: 'Propietario',
  inquilino: 'Inquilino',
  autorizado: 'Autorizado',
  empleado: 'Empleado',
  proveedor: 'Proveedor',
  servicio: 'Servicio',
  // Frecuencias
  semanal: 'Semanal',
  quincenal: 'Quincenal',
  mensual: 'Mensual',
  bimestral: 'Bimestral',
  anual: 'Anual',
}

export const etiqueta = (clave) => ETIQUETAS[clave] || clave || '—'

/** Nombre completo de la unidad: "Local comercial 4-A · Parque Central" */
export function nombreUnidad(u) {
  if (!u) return '—'
  const partes = [etiqueta(u.unit_type), u.code]
  if (u.location_type && u.location_name) {
    partes.push('·', etiqueta(u.location_type), u.location_name)
  } else if (u.location_name) {
    partes.push('·', u.location_name)
  }
  return partes.join(' ')
}

/** Versión corta: "4-A · Parque Central" */
export function nombreUnidadCorto(u) {
  if (!u) return '—'
  // En locales comerciales se destaca el nombre de la empresa junto al
  // identificador. En apartamentos se usa la ubicación si existe.
  const complemento =
    u.unit_type === 'local_comercial'
      ? u.business_name || u.location_name
      : u.location_name
  return complemento ? `${u.code} · ${complemento}` : u.code
}

/**
 * Normaliza texto para búsquedas: quita acentos y pasa a minúsculas.
 * Así "Farmácia", "FARMACIA" y "farmacia" se comparan igual, y el
 * buscador tolera acentos y mayúsculas.
 */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Distancia de Levenshtein acotada (número mínimo de ediciones —inserciones,
 * borrados o sustituciones— para transformar a en b). Se corta en cuanto
 * supera `max` para no gastar tiempo en cadenas muy distintas.
 * Se usa para tolerar errores de tipeo en el buscador.
 */
export function distanciaEdicion(a, b, max = 2) {
  a = String(a ?? '')
  b = String(b ?? '')
  if (a === b) return 0
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > max) return max + 1
  if (la === 0) return lb
  if (lb === 0) return la

  let fila = Array.from({ length: lb + 1 }, (_, i) => i)
  for (let i = 1; i <= la; i++) {
    let prev = fila[0]
    fila[0] = i
    let mejorEnFila = fila[0]
    for (let j = 1; j <= lb; j++) {
      const tmp = fila[j]
      const costo = a[i - 1] === b[j - 1] ? 0 : 1
      fila[j] = Math.min(
        fila[j] + 1,      // borrado
        fila[j - 1] + 1,  // inserción
        prev + costo      // sustitución
      )
      prev = tmp
      if (fila[j] < mejorEnFila) mejorEnFila = fila[j]
    }
    // Poda: si toda la fila ya supera max, no hay forma de mejorar.
    if (mejorEnFila > max) return max + 1
  }
  return fila[lb]
}

/**
 * Decide si `consulta` coincide con `candidato` de forma tolerante:
 *   1. ignora acentos y mayúsculas (vía normalizar),
 *   2. acepta coincidencia por prefijo o subcadena,
 *   3. si no, acepta pequeños errores de tipeo (distancia de edición).
 * Pensada para autocompletar conceptos ("manteni" → "Mantenimiento",
 * "farmasia" → "Farmacia").
 */
export function coincideDifuso(consulta, candidato, tolerancia = 2) {
  const q = normalizar(consulta)
  const c = normalizar(candidato)
  if (!q) return true
  if (c.includes(q)) return true
  // Comparar palabra por palabra del candidato para typos en términos largos.
  const palabras = c.split(/\s+/)
  for (const p of palabras) {
    if (p.startsWith(q)) return true
    if (Math.abs(p.length - q.length) <= tolerancia &&
        distanciaEdicion(q, p, tolerancia) <= tolerancia) {
      return true
    }
  }
  // Último recurso: typo contra la cadena completa (conceptos de una palabra).
  return distanciaEdicion(q, c, tolerancia) <= tolerancia
}

/**
 * Filtra y ORDENA una lista de sugerencias por relevancia respecto a la
 * consulta. Prioriza: coincidencia exacta de prefijo > subcadena > difusa.
 * Devuelve como máximo `limite` resultados. `getTexto` extrae el string a
 * comparar de cada elemento (por si son objetos).
 */
export function filtrarSugerencias(lista, consulta, opciones = {}) {
  const { limite = 8, tolerancia = 2, getTexto = (x) => x } = opciones
  const q = normalizar(consulta)

  const puntuar = (item) => {
    const c = normalizar(getTexto(item))
    if (!c) return -1
    if (!q) return 0                       // sin consulta: todos válidos
    if (c === q) return 100
    if (c.startsWith(q)) return 80
    if (c.includes(q)) return 60
    if (coincideDifuso(consulta, getTexto(item), tolerancia)) return 40
    return -1
  }

  return lista
    .map((item) => ({ item, score: puntuar(item) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
    .map((x) => x.item)
}

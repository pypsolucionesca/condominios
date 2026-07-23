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
  return u.location_name ? `${u.code} · ${u.location_name}` : u.code
}

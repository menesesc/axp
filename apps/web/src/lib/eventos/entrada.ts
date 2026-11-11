import { esFecha, esHora, esUuid, entero, numero, texto } from './db'
import { REGIMENES, type IvaModo, type PagoModo, type Regimen } from './constantes'

/**
 * Lectura de lo que llega de la pantalla. En un alta valen los defaults; en
 * una edición sólo viaja lo que se tocó, así que cada campo entra al objeto
 * únicamente si vino en el cuerpo. Eso es lo que después permite auditar
 * "qué cambió" sin inventar cambios.
 */

const IVA: IvaModo[] = ['FINAL', 'MAS_IVA', 'INCLUIDO']
const PAGO: PagoModo[] = ['SENA_PCT', 'SENA_MONTO', 'TOTAL', 'NINGUNA']

export interface DatosEvento {
  nombre?: string
  tipo?: string
  fecha?: string
  horaInicio?: string | null
  horaFin?: string | null
  cupo?: number | null
  precioAdulto?: number
  precioMenor?: number
  ivaModo?: IvaModo
  ivaAlicuota?: number
  pagoModo?: PagoModo
  senaPct?: number | null
  senaMonto?: number | null
  senaVence?: string | null
  saldoVence?: string | null
  observaciones?: string | null
  salonIds?: string[]
}

type Resultado<T> = { datos: T } | { error: string }

const tiene = (b: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(b, k)

export function leerEvento(body: unknown, alta: boolean): Resultado<DatosEvento & { nombre: string; fecha: string }> {
  if (!body || typeof body !== 'object') return { error: 'Faltan los datos' }
  const b = body as Record<string, unknown>
  const d: DatosEvento = {}

  if (alta || tiene(b, 'nombre')) {
    const n = texto(b.nombre, 160)
    if (!n) return { error: 'Poné un nombre al evento' }
    d.nombre = n
  }
  if (alta || tiene(b, 'fecha')) {
    if (!esFecha(b.fecha)) return { error: 'La fecha no es válida' }
    d.fecha = b.fecha
  }
  if (tiene(b, 'tipo')) d.tipo = texto(b.tipo, 40) ?? 'OTRO'
  for (const k of ['horaInicio', 'horaFin'] as const) {
    if (!tiene(b, k)) continue
    if (b[k] && !esHora(b[k])) return { error: 'La hora no es válida' }
    d[k] = (b[k] as string) || null
  }
  if (tiene(b, 'cupo')) {
    const c = entero(b.cupo)
    d.cupo = c > 0 ? c : null
  }
  for (const k of ['precioAdulto', 'precioMenor'] as const) {
    if (tiene(b, k)) d[k] = numero(b[k]) ?? 0
  }
  if (tiene(b, 'ivaModo')) {
    if (!IVA.includes(b.ivaModo as IvaModo)) return { error: 'Modo de IVA inválido' }
    d.ivaModo = b.ivaModo as IvaModo
  }
  if (tiene(b, 'ivaAlicuota')) {
    const a = numero(b.ivaAlicuota)
    if (a === null || a > 100) return { error: 'Alícuota inválida' }
    d.ivaAlicuota = a
  }
  if (tiene(b, 'pagoModo')) {
    if (!PAGO.includes(b.pagoModo as PagoModo)) return { error: 'Regla de pago inválida' }
    d.pagoModo = b.pagoModo as PagoModo
  }
  if (tiene(b, 'senaPct')) {
    const p = numero(b.senaPct)
    if (p !== null && p > 100) return { error: 'La seña no puede ser más del 100 %' }
    d.senaPct = p
  }
  if (tiene(b, 'senaMonto')) d.senaMonto = numero(b.senaMonto)
  for (const k of ['senaVence', 'saldoVence'] as const) {
    if (!tiene(b, k)) continue
    if (b[k] && !esFecha(b[k])) return { error: 'La fecha límite no es válida' }
    d[k] = (b[k] as string) || null
  }
  if (tiene(b, 'observaciones')) d.observaciones = texto(b.observaciones, 4000)
  if (tiene(b, 'salonIds')) {
    d.salonIds = Array.isArray(b.salonIds) ? b.salonIds.filter(esUuid) : []
  }
  return { datos: d as DatosEvento & { nombre: string; fecha: string } }
}

export interface RegimenEntrada {
  tipo: Regimen
  cantidad: number
  nota: string | null
}

export interface DatosReserva {
  eventoId?: string | null
  titularId?: string | null
  nombre?: string
  contactoNombre?: string | null
  contactoTelefono?: string | null
  contactoEmail?: string | null
  fecha?: string
  hora?: string | null
  sectorId?: string | null
  adultos?: number
  menores?: number
  bebes?: number
  liberados?: number
  precioAdulto?: number | null
  precioMenor?: number | null
  precioLiberado?: number | null
  ivaModo?: IvaModo | null
  ivaAlicuota?: number | null
  descuento?: number
  descuentoNota?: string | null
  origen?: string | null
  mesaInamovible?: boolean
  observaciones?: string | null
  notaServicio?: string | null
  regimenes?: RegimenEntrada[]
  mesaIds?: string[]
}

const TIPOS_REGIMEN = REGIMENES.map((r) => r.valor)

export function leerReserva(body: unknown, alta: boolean): Resultado<DatosReserva> {
  if (!body || typeof body !== 'object') return { error: 'Faltan los datos' }
  const b = body as Record<string, unknown>
  const d: DatosReserva = {}

  if (alta || tiene(b, 'nombre')) {
    const n = texto(b.nombre, 160)
    if (!n) return { error: 'Poné un nombre a la reserva' }
    d.nombre = n
  }
  for (const k of ['eventoId', 'titularId', 'sectorId'] as const) {
    if (!tiene(b, k)) continue
    if (b[k] && !esUuid(b[k])) return { error: 'Referencia inválida' }
    d[k] = (b[k] as string) || null
  }
  if (tiene(b, 'fecha')) {
    if (!esFecha(b.fecha)) return { error: 'La fecha no es válida' }
    d.fecha = b.fecha
  }
  if (tiene(b, 'hora')) {
    if (b.hora && !esHora(b.hora)) return { error: 'La hora no es válida' }
    d.hora = (b.hora as string) || null
  }
  if (tiene(b, 'contactoNombre')) d.contactoNombre = texto(b.contactoNombre, 120)
  if (tiene(b, 'contactoTelefono')) d.contactoTelefono = texto(b.contactoTelefono, 40)
  if (tiene(b, 'contactoEmail')) d.contactoEmail = texto(b.contactoEmail, 160)
  for (const k of ['adultos', 'menores', 'bebes', 'liberados'] as const) {
    if (tiene(b, k)) d[k] = entero(b[k])
  }
  for (const k of ['precioAdulto', 'precioMenor', 'precioLiberado'] as const) {
    if (tiene(b, k)) d[k] = numero(b[k])
  }
  if (tiene(b, 'ivaModo')) {
    if (b.ivaModo && !IVA.includes(b.ivaModo as IvaModo)) return { error: 'Modo de IVA inválido' }
    d.ivaModo = (b.ivaModo as IvaModo) || null
  }
  if (tiene(b, 'ivaAlicuota')) {
    const a = numero(b.ivaAlicuota)
    if (a !== null && a > 100) return { error: 'Alícuota inválida' }
    d.ivaAlicuota = a
  }
  if (tiene(b, 'descuento')) d.descuento = numero(b.descuento) ?? 0
  if (tiene(b, 'descuentoNota')) d.descuentoNota = texto(b.descuentoNota, 200)
  if (tiene(b, 'origen')) d.origen = texto(b.origen, 40)
  if (tiene(b, 'mesaInamovible')) d.mesaInamovible = b.mesaInamovible === true
  if (tiene(b, 'observaciones')) d.observaciones = texto(b.observaciones, 4000)
  if (tiene(b, 'notaServicio')) d.notaServicio = texto(b.notaServicio, 2000)
  if (tiene(b, 'regimenes')) {
    if (!Array.isArray(b.regimenes)) return { error: 'Regímenes inválidos' }
    d.regimenes = []
    for (const r of b.regimenes as Array<Record<string, unknown>>) {
      if (!TIPOS_REGIMEN.includes(r?.tipo as Regimen)) return { error: 'Régimen desconocido' }
      const cantidad = entero(r.cantidad)
      if (cantidad === 0) continue
      d.regimenes.push({ tipo: r.tipo as Regimen, cantidad, nota: texto(r.nota, 300) })
    }
  }
  if (tiene(b, 'mesaIds')) {
    d.mesaIds = Array.isArray(b.mesaIds) ? [...new Set(b.mesaIds.filter(esUuid))] : []
  }
  return { datos: d }
}

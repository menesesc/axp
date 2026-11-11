/**
 * Catálogos fijos, tipos y cuentas del módulo de eventos y reservas.
 *
 * Sin imports del servidor: lo usan las rutas y también las pantallas (la
 * ficha muestra el plan de cuotas con la misma cuenta que usan las alertas).
 *
 * Lo que puede cambiar cada casa (orígenes, tipos de evento) vive en la tabla
 * `evento_catalogos`; acá quedan sólo los valores por defecto con los que se
 * siembra la primera vez.
 */

// ---------------------------------------------------------------------------
// Estados y siglas
// ---------------------------------------------------------------------------

export type EstadoReserva = 'PRESUPUESTO' | 'APROBADO' | 'FINALIZADO' | 'CANCELADO'
export type EstadoCobro = 'SIN' | 'PARCIAL' | 'TOTAL'
export type Sigla = 'PRE' | 'ASC' | 'ACP' | 'ACT' | 'FCP' | 'FCT' | 'CAN'

export const ESTADOS: Array<{ valor: EstadoReserva; texto: string }> = [
  { valor: 'PRESUPUESTO', texto: 'Presupuesto' },
  { valor: 'APROBADO', texto: 'Aprobado' },
  { valor: 'FINALIZADO', texto: 'Finalizado' },
  { valor: 'CANCELADO', texto: 'Cancelado' },
]

export const ESTADO_TEXTO: Record<EstadoReserva, string> = {
  PRESUPUESTO: 'Presupuesto',
  APROBADO: 'Aprobado',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
}

export const COBRO_TEXTO: Record<EstadoCobro, string> = {
  SIN: 'Sin cobro',
  PARCIAL: 'Cobro parcial',
  TOTAL: 'Cobro total',
}

/**
 * La sigla junta el estado manual con el de cobro, que sale de los pagos.
 * Los colores van de frío (presupuesto) a verde (todo cobrado); el ámbar
 * marca plata pendiente en algo que ya está confirmado.
 */
export const SIGLAS: Record<Sigla, { texto: string; color: string; fondo: string; borde: string; punto: string }> = {
  PRE: { texto: 'Presupuesto', color: 'text-slate-700', fondo: 'bg-slate-100', borde: 'border-slate-300', punto: '#94a3b8' },
  ASC: { texto: 'Aprobado sin cobro', color: 'text-rose-800', fondo: 'bg-rose-50', borde: 'border-rose-300', punto: '#f43f5e' },
  ACP: { texto: 'Aprobado, cobro parcial', color: 'text-amber-800', fondo: 'bg-amber-50', borde: 'border-amber-300', punto: '#f59e0b' },
  ACT: { texto: 'Aprobado, cobro total', color: 'text-emerald-800', fondo: 'bg-emerald-50', borde: 'border-emerald-300', punto: '#10b981' },
  FCP: { texto: 'Finalizado, cobro parcial', color: 'text-orange-800', fondo: 'bg-orange-50', borde: 'border-orange-300', punto: '#ea580c' },
  FCT: { texto: 'Finalizado, cobro total', color: 'text-sky-800', fondo: 'bg-sky-50', borde: 'border-sky-300', punto: '#0ea5e9' },
  CAN: { texto: 'Cancelado', color: 'text-slate-500 line-through', fondo: 'bg-slate-50', borde: 'border-slate-200', punto: '#cbd5e1' },
}

export const ORDEN_SIGLAS: Sigla[] = ['PRE', 'ASC', 'ACP', 'ACT', 'FCP', 'FCT', 'CAN']

/** Misma regla que la vista `reserva_totales`, para previsualizar en pantalla. */
export function siglaDe(estado: EstadoReserva, cobro: EstadoCobro): Sigla {
  if (estado === 'CANCELADO') return 'CAN'
  if (estado === 'PRESUPUESTO') return 'PRE'
  if (estado === 'APROBADO') return cobro === 'TOTAL' ? 'ACT' : cobro === 'PARCIAL' ? 'ACP' : 'ASC'
  return cobro === 'TOTAL' ? 'FCT' : 'FCP'
}

/** Estados que ocupan lugar en el cupo: todo lo que no se canceló. */
export const OCUPAN_CUPO: EstadoReserva[] = ['PRESUPUESTO', 'APROBADO', 'FINALIZADO']

// ---------------------------------------------------------------------------
// Catálogos fijos
// ---------------------------------------------------------------------------

export type Regimen = 'CELIACO' | 'VEGETARIANO' | 'VEGANO' | 'SIN_LACTOSA' | 'ALERGIA' | 'OTRO'

export const REGIMENES: Array<{ valor: Regimen; texto: string; corto: string }> = [
  { valor: 'CELIACO', texto: 'Celíaco', corto: 'Cel' },
  { valor: 'VEGETARIANO', texto: 'Vegetariano', corto: 'Veg' },
  { valor: 'VEGANO', texto: 'Vegano', corto: 'Vgn' },
  { valor: 'SIN_LACTOSA', texto: 'Sin lactosa', corto: 'SL' },
  { valor: 'ALERGIA', texto: 'Alergia', corto: 'Alg' },
  { valor: 'OTRO', texto: 'Otro', corto: 'Otro' },
]

export const REGIMEN_TEXTO = Object.fromEntries(REGIMENES.map((r) => [r.valor, r.texto])) as Record<Regimen, string>

export type TipoAgenda = 'VISITA' | 'DEGUSTACION' | 'LLAMADO' | 'RECORDATORIO_SALDO' | 'REUNION' | 'NOVEDAD' | 'OTRO'

export const TIPOS_AGENDA: Array<{ valor: TipoAgenda; texto: string }> = [
  { valor: 'VISITA', texto: 'Visita previa' },
  { valor: 'DEGUSTACION', texto: 'Degustación' },
  { valor: 'LLAMADO', texto: 'Llamado / confirmación' },
  { valor: 'RECORDATORIO_SALDO', texto: 'Recordatorio de saldo' },
  { valor: 'REUNION', texto: 'Reunión' },
  { valor: 'NOVEDAD', texto: 'Novedad' },
  { valor: 'OTRO', texto: 'Otro' },
]

export const TIPO_AGENDA_TEXTO = Object.fromEntries(TIPOS_AGENDA.map((t) => [t.valor, t.texto])) as Record<TipoAgenda, string>

export type EstadoAgenda = 'PENDIENTE' | 'HECHA' | 'CANCELADA'

export type MedioPago = 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA' | 'MERCADOPAGO' | 'OTRO'

export const MEDIOS: Array<{ valor: MedioPago; texto: string }> = [
  { valor: 'TRANSFERENCIA', texto: 'Transferencia' },
  { valor: 'EFECTIVO', texto: 'Efectivo' },
  { valor: 'TARJETA', texto: 'Tarjeta' },
  { valor: 'MERCADOPAGO', texto: 'Mercado Pago' },
  { valor: 'OTRO', texto: 'Otro' },
]

export const MEDIO_TEXTO = Object.fromEntries(MEDIOS.map((m) => [m.valor, m.texto])) as Record<MedioPago, string>

export type IvaModo = 'FINAL' | 'MAS_IVA' | 'INCLUIDO'

export const IVA_MODOS: Array<{ valor: IvaModo; texto: string; hint: string }> = [
  { valor: 'FINAL', texto: 'Precio final', hint: 'Sin discriminar IVA' },
  { valor: 'MAS_IVA', texto: 'Más IVA', hint: 'El precio es neto; el IVA se suma' },
  { valor: 'INCLUIDO', texto: 'IVA incluido', hint: 'El precio ya trae el IVA' },
]

export type PagoModo = 'SENA_PCT' | 'SENA_MONTO' | 'TOTAL' | 'NINGUNA'

export const PAGO_MODOS: Array<{ valor: PagoModo; texto: string }> = [
  { valor: 'SENA_PCT', texto: 'Seña en % y saldo' },
  { valor: 'SENA_MONTO', texto: 'Seña fija y saldo' },
  { valor: 'TOTAL', texto: 'Pago total anticipado' },
  { valor: 'NINGUNA', texto: 'Sin regla (se cobra en el día)' },
]

export const CONDICIONES_IVA = [
  { valor: 'CF', texto: 'Consumidor final' },
  { valor: 'RI', texto: 'Responsable inscripto' },
  { valor: 'MT', texto: 'Monotributo' },
  { valor: 'EX', texto: 'Exento' },
] as const

export type CondicionIva = (typeof CONDICIONES_IVA)[number]['valor']

/** Con lo que se siembra `evento_catalogos` la primera vez que se abre el módulo. */
export const CATALOGO_INICIAL = {
  ORIGEN: [
    ['WHATSAPP', 'WhatsApp'],
    ['TELEFONO', 'Teléfono'],
    ['PRESENCIAL', 'Presencial'],
    ['EMAIL', 'Email'],
    ['INSTAGRAM', 'Instagram'],
    ['WEB', 'Web'],
    ['AGENCIA', 'Agencia'],
    ['OTRO', 'Otro'],
  ],
  TIPO_EVENTO: [
    ['CUMPLEANOS', 'Cumpleaños', '#ec4899'],
    ['CORPORATIVO', 'Corporativo', '#6366f1'],
    ['GRUPO_TURISTICO', 'Grupo turístico', '#0ea5e9'],
    ['CASAMIENTO', 'Casamiento', '#a855f7'],
    ['FIN_DE_ANIO', 'Fin de año', '#f59e0b'],
    ['OTRO', 'Otro', '#64748b'],
  ],
} as const

export type ListaCatalogo = keyof typeof CATALOGO_INICIAL

// ---------------------------------------------------------------------------
// Plan de cuotas
// ---------------------------------------------------------------------------

export interface CuotaDef {
  id?: string | undefined
  concepto: string
  monto: number | null
  porcentaje: number | null
  vencimiento: string | null
  orden: number
}

export type EstadoCuota = 'PAGADA' | 'PARCIAL' | 'PENDIENTE' | 'POR_VENCER' | 'VENCIDA'

export interface CuotaCalculada extends CuotaDef {
  /** Lo que vale hoy, con el total actual. */
  importe: number
  /** Lo cobrado que le toca, imputado en orden. */
  imputado: number
  pendiente: number
  estado: EstadoCuota
}

/**
 * Cuánto vale cada cuota y cuánto le toca de lo cobrado.
 *
 * Una cuota es un monto fijo, un % del total o "el resto" (las dos cosas
 * vacías): así el plan acompaña al total cuando cambian las personas. Lo
 * cobrado se imputa en orden, la seña primero: no importa a qué cuota se
 * cargó cada pago, importa cuánto entró.
 *
 * Una cuota con algo pendiente y el vencimiento pasado está VENCIDA; dentro
 * de los `diasAviso` próximos, POR_VENCER. Nunca libera nada sola: es aviso.
 */
export function calcularPlan(
  cuotas: CuotaDef[],
  total: number,
  cobrado: number,
  hoy: string,
  diasAviso = 3
): CuotaCalculada[] {
  const ordenadas = [...cuotas].sort((a, b) => a.orden - b.orden)
  const fijo = (c: CuotaDef) =>
    c.monto != null ? c.monto : c.porcentaje != null ? Math.round(total * c.porcentaje) / 100 : null
  const comprometido = ordenadas.reduce((s, c) => s + (fijo(c) ?? 0), 0)
  let restoLibre = Math.max(total - comprometido, 0)
  let disponible = Math.max(cobrado, 0)
  const limite = sumarDiasIso(hoy, diasAviso)

  return ordenadas.map((c) => {
    let importe = fijo(c)
    if (importe == null) {
      // El primer "resto" se lleva todo lo que falta; si hay otro, queda en 0.
      importe = restoLibre
      restoLibre = 0
    }
    importe = redondear(importe)
    const imputado = redondear(Math.min(disponible, importe))
    disponible = redondear(disponible - imputado)
    const pendiente = redondear(importe - imputado)
    let estado: EstadoCuota
    if (pendiente <= 0.009) estado = 'PAGADA'
    else if (c.vencimiento && c.vencimiento < hoy) estado = 'VENCIDA'
    else if (c.vencimiento && c.vencimiento <= limite) estado = 'POR_VENCER'
    else estado = imputado > 0 ? 'PARCIAL' : 'PENDIENTE'
    return { ...c, importe, imputado, pendiente, estado }
  })
}

/**
 * Cuotas que arma la regla de pago del evento al crear una reserva. Se
 * guardan como % o "resto", no como montos, para que sigan valiendo si
 * cambian las personas.
 */
export function cuotasDeRegla(ev: {
  pagoModo: PagoModo
  senaPct: number | null
  senaMonto: number | null
  senaVence: string | null
  saldoVence: string | null
  fecha: string
}): CuotaDef[] {
  const saldo = { concepto: 'Saldo', monto: null, porcentaje: null, vencimiento: ev.saldoVence ?? ev.fecha, orden: 1 }
  switch (ev.pagoModo) {
    case 'SENA_PCT':
      if (!ev.senaPct) return []
      return [{ concepto: 'Seña', monto: null, porcentaje: ev.senaPct, vencimiento: ev.senaVence, orden: 0 }, saldo]
    case 'SENA_MONTO':
      if (!ev.senaMonto) return []
      return [{ concepto: 'Seña', monto: ev.senaMonto, porcentaje: null, vencimiento: ev.senaVence, orden: 0 }, saldo]
    case 'TOTAL':
      return [{ concepto: 'Pago total', monto: null, porcentaje: null, vencimiento: ev.senaVence ?? ev.saldoVence ?? ev.fecha, orden: 0 }]
    default:
      return []
  }
}

/**
 * Total de una reserva con la misma cuenta que `reserva_totales`. Sirve para
 * mostrar el total mientras se edita, antes de guardar; lo que vale es lo
 * que devuelve la base.
 */
export function calcularTotal(r: {
  adultos: number
  menores: number
  liberados: number
  precioAdulto: number
  precioMenor: number
  precioLiberado: number
  descuento: number
  ivaModo: IvaModo
  ivaAlicuota: number
  /** Adicionales que paga el titular (los de cada pasajero no suman). */
  adicionales?: number | undefined
}) {
  const base = r.adultos * r.precioAdulto + r.menores * r.precioMenor + r.liberados * r.precioLiberado
  const neto = Math.max(base + (r.adicionales ?? 0) - r.descuento, 0)
  const a = r.ivaAlicuota / 100
  const iva = r.ivaModo === 'MAS_IVA' ? neto * a : r.ivaModo === 'INCLUIDO' ? neto - neto / (1 + a) : 0
  const total = r.ivaModo === 'MAS_IVA' ? neto + iva : neto
  return { neto: redondear(neto), iva: redondear(iva), total: redondear(total) }
}

const redondear = (n: number) => Math.round(n * 100) / 100

function sumarDiasIso(iso: string, dias: number) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + dias)).toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Formatos
// ---------------------------------------------------------------------------

/** "31/12" o "mié 31/12". Las fechas viajan como YYYY-MM-DD. */
export function fechaCorta(iso: string | null | undefined, conDia = false) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const base = `${d}/${m}`
  if (!conDia) return base
  const dia = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).toLocaleDateString('es-AR', { weekday: 'short', timeZone: 'UTC' })
  return `${dia.replace('.', '')} ${base}`
}

export function personasTexto(p: { adultos: number; menores: number; bebes: number; liberados: number }) {
  const partes = [
    p.adultos ? `${p.adultos} ad` : '',
    p.menores ? `${p.menores} men` : '',
    p.bebes ? `${p.bebes} beb` : '',
    p.liberados ? `${p.liberados} lib` : '',
  ].filter(Boolean)
  return partes.join(' · ') || 'sin personas'
}

/**
 * Importe tipeado a mano. Con coma, la coma es el decimal y los puntos son
 * miles ("1.234,50"). Sin coma, un punto seguido de tres dígitos son miles
 * ("85.000"); si no, es decimal ("85000.5", que es como llega un número de JS).
 */
export function parsearMonto(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim().replace(/\s|\$/g, '')
  if (!s) return null
  const n = s.includes(',')
    ? Number(s.replace(/\./g, '').replace(',', '.'))
    : /^\d{1,3}(\.\d{3})+$/.test(s)
      ? Number(s.replace(/\./g, ''))
      : Number(s)
  return Number.isFinite(n) ? n : null
}

// ---------------------------------------------------------------------------
// Alertas (las calcula lib/eventos/alertas.ts en el server)
// ---------------------------------------------------------------------------

export type TipoAlerta =
  | 'cuota_vencida'
  | 'cuota_proxima'
  | 'presupuesto_sin_respuesta'
  | 'agenda'
  | 'regimen_sin_nota'
  | 'evento_sin_finalizar'
  | 'finalizada_con_saldo'
  | 'cupo'

export interface Alerta {
  id: string
  tipo: TipoAlerta
  gravedad: 'alta' | 'media' | 'baja'
  titulo: string
  detalle: string
  /** Fecha que la origina (vencimiento, fecha del evento…), YYYY-MM-DD. */
  fecha: string | null
  href: string
  monto: number | null
}

export const TIPOS_ALERTA: Record<TipoAlerta, string> = {
  cuota_vencida: 'Seña o cuota vencida',
  cuota_proxima: 'Cuota por vencer',
  presupuesto_sin_respuesta: 'Presupuesto sin respuesta',
  agenda: 'Agenda pendiente',
  regimen_sin_nota: 'Régimen sin indicación',
  evento_sin_finalizar: 'Pasado sin finalizar',
  finalizada_con_saldo: 'Finalizada con saldo',
  cupo: 'Cupo casi lleno',
}

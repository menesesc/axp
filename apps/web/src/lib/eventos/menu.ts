import type { IvaModo } from './constantes'

/**
 * Menús de eventos: rendimiento de cada ítem, valor de carta por cubierto y
 * la comparación contra el precio que se cobra.
 *
 * Sin imports del servidor: lo usan las rutas (al armar el presupuesto y los
 * totales de cocina) y las pantallas (que recalculan en vivo mientras se
 * edita). Una sola cuenta para los dos lados.
 */

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------

/** Los pasos son fijos y van en este orden. */
export type Paso = 'BIENVENIDA' | 'ENTRADA' | 'PRINCIPAL' | 'POSTRE' | 'BEBIDA' | 'EXTRA'

export const PASOS: Array<{ valor: Paso; texto: string }> = [
  { valor: 'BIENVENIDA', texto: 'Bienvenida' },
  { valor: 'ENTRADA', texto: 'Entrada' },
  { valor: 'PRINCIPAL', texto: 'Plato principal' },
  { valor: 'POSTRE', texto: 'Postre' },
  { valor: 'BEBIDA', texto: 'Bebidas' },
  { valor: 'EXTRA', texto: 'Extras' },
]

export const PASO_TEXTO = Object.fromEntries(PASOS.map((p) => [p.valor, p.texto])) as Record<Paso, string>

export type ModoItem = 'PERSONA' | 'COMPARTIDO'
export type Aplica = 'TODOS' | 'ADULTOS' | 'MENORES'

export const APLICA: Array<{ valor: Aplica; texto: string }> = [
  { valor: 'TODOS', texto: 'Todos' },
  { valor: 'ADULTOS', texto: 'Sólo adultos' },
  { valor: 'MENORES', texto: 'Sólo menores' },
]

export type Modalidad = 'PERSONA' | 'FIJO'
export type Paga = 'TITULAR' | 'PASAJERO'

// ---------------------------------------------------------------------------
// Ítems
// ---------------------------------------------------------------------------

export interface ItemMenu {
  id?: string | undefined
  paso: Paso
  orden: number
  productoId: string | null
  nombre: string
  descripcion: string | null
  modo: ModoItem
  cantidad: number
  personasPorUnidad: number | null
  unidad: string | null
  aplica: Aplica
  /**
   * NULL = ítem fijo. Los ítems del mismo paso y grupo son opciones a
   * elección del cliente ("bife o sorrentinos"); se costean por la más cara.
   */
  opcionGrupo: number | null
  /** Lo cargado a mano. En un producto del POS, NULL = su precio vigente. */
  precioManual: number | null
  /** El precio de carta que vale: el manual, o el del POS. NULL = no se sabe. */
  precio: number | null
  /** Costo estimado de una unidad (receta o venta directa). NULL = sin costo. */
  costo: number | null
  /** El costo salió de una receta con todos los ingredientes costeados. */
  costoCompleto: boolean
  /** Nombre actual en el POS, para avisar si cambió. */
  productoNombre?: string | null | undefined
}

/** Cuántas unidades hacen falta para `personas` (redondeo hacia arriba: no se sirve media picada). */
export function unidades(item: Pick<ItemMenu, 'modo' | 'cantidad' | 'personasPorUnidad'>, personas: number): number {
  if (personas <= 0) return 0
  if (item.modo === 'COMPARTIDO') {
    const n = Math.max(item.personasPorUnidad ?? 1, 1)
    return Math.ceil(personas / n) * item.cantidad
  }
  // El épsilon evita que 3 × 0,333 dé 0,999 → 1 y 6 × 0,5 = 3,0000001 → 4.
  return Math.ceil(personas * item.cantidad - 1e-6)
}

/** A cuántas personas del grupo les toca el ítem. Los liberados comen como adultos. */
export function comensales(aplica: Aplica, g: { adultos: number; menores: number }) {
  return aplica === 'ADULTOS' ? g.adultos : aplica === 'MENORES' ? g.menores : g.adultos + g.menores
}

const FRACCIONES: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾', '0.333': '⅓', '0.667': '⅔' }

function cantidadTexto(n: number) {
  const k = String(Math.round(n * 1000) / 1000)
  if (FRACCIONES[k]) return FRACCIONES[k]!
  return Number.isInteger(n) ? String(n) : String(+n.toFixed(2)).replace('.', ',')
}

function plural(palabra: string, n: number) {
  if (n <= 1) return palabra
  return /[aeiouáéó]$/i.test(palabra) ? `${palabra}s` : `${palabra}es`
}

/**
 * Cómo se lee la porción, para el editor y el presupuesto:
 *   "para 4"                  picada para compartir
 *   "½ botella por persona"   vino
 *   ""                        un plato por persona (no hace falta decirlo)
 */
export function porcionTexto(item: Pick<ItemMenu, 'modo' | 'cantidad' | 'personasPorUnidad' | 'unidad'>): string {
  if (item.modo === 'COMPARTIDO') {
    const n = item.personasPorUnidad ?? 2
    return item.cantidad === 1 ? `para ${n}` : `${cantidadTexto(item.cantidad)} cada ${n} personas`
  }
  if (item.cantidad === 1 && !item.unidad) return ''
  const u = item.unidad ? ` ${plural(item.unidad, item.cantidad)}` : ''
  return `${cantidadTexto(item.cantidad)}${u} por persona`
}

/** "Picada de campo para 4", "Malbec (½ botella por persona)". */
export function itemTexto(item: Pick<ItemMenu, 'nombre' | 'modo' | 'cantidad' | 'personasPorUnidad' | 'unidad'>) {
  const p = porcionTexto(item)
  if (!p) return item.nombre
  return item.modo === 'COMPARTIDO' && item.cantidad === 1 ? `${item.nombre} ${p}` : `${item.nombre} (${p})`
}

// ---------------------------------------------------------------------------
// Valor de carta y costo
// ---------------------------------------------------------------------------

export interface ValorCubierto {
  /** Lo que valen a precio de carta las cosas que come una persona de esta categoría. */
  carta: number
  /** Costo estimado por cubierto (sólo de los ítems con costo). */
  costo: number
  /** Ítems que aplican sin precio de carta: el valor queda corto. */
  sinPrecio: number
  /** Ítems que aplican sin costo, o con receta a medias: el costo es parcial. */
  sinCosto: number
  items: number
}

const aplicaA = (aplica: Aplica, categoria: 'ADULTOS' | 'MENORES') => aplica === 'TODOS' || aplica === categoria

/** Clave de un grupo de opciones dentro del menú. */
export const claveGrupo = (i: Pick<ItemMenu, 'paso' | 'opcionGrupo'>) => `${i.paso}|${i.opcionGrupo}`

/** Clave con la que se guarda cuántos eligen una opción en una reserva. */
export const claveOpcion = (i: { paso: string; nombre: string }) => `${i.paso}|${i.nombre.trim().toLowerCase()}`

/**
 * Valor de carta por cubierto de una categoría, para un grupo de `personas`
 * de esa categoría. Con porciones compartidas el grupo importa: una picada
 * para 4 en un grupo de 6 son 2 picadas, que repartidas dan 1/3 por cabeza.
 *
 * Un grupo de opciones vale lo de su opción más cara (y cuesta lo de la más
 * costosa), con la cuenta de porciones hecha antes en cada opción: se
 * presupuesta como si todos eligieran la más cara.
 */
export function valorCubierto(items: ItemMenu[], categoria: 'ADULTOS' | 'MENORES', personas: number): ValorCubierto {
  const v: ValorCubierto = { carta: 0, costo: 0, sinPrecio: 0, sinCosto: 0, items: 0 }
  const n = Math.max(personas, 1)
  const grupos = new Map<string, ItemMenu[]>()
  for (const it of items) {
    if (!aplicaA(it.aplica, categoria)) continue
    if (it.opcionGrupo != null) {
      const k = claveGrupo(it)
      const arr = grupos.get(k)
      if (arr) arr.push(it)
      else grupos.set(k, [it])
      continue
    }
    v.items++
    const u = unidades(it, n)
    if (it.precio == null) v.sinPrecio++
    else v.carta += (it.precio * u) / n
    if (it.costo == null || !it.costoCompleto) v.sinCosto++
    if (it.costo != null) v.costo += (it.costo * u) / n
  }
  for (const opciones of grupos.values()) {
    v.items++
    let carta = 0
    let costo = 0
    for (const it of opciones) {
      const u = unidades(it, n)
      if (it.precio != null) carta = Math.max(carta, (it.precio * u) / n)
      if (it.costo != null) costo = Math.max(costo, (it.costo * u) / n)
    }
    v.carta += carta
    v.costo += costo
    if (opciones.some((it) => it.precio == null)) v.sinPrecio++
    if (opciones.some((it) => it.costo == null || !it.costoCompleto)) v.sinCosto++
  }
  v.carta = redondear(v.carta)
  v.costo = redondear(v.costo)
  return v
}

/**
 * Qué opción de cada grupo fija el valor de carta (la más cara por cubierto)
 * para una categoría. Para marcarla en el editor ("costea").
 */
export function opcionesQueCostean<T extends ItemMenu>(items: T[], categoria: 'ADULTOS' | 'MENORES', personas: number): Set<T> {
  const n = Math.max(personas, 1)
  const mejor = new Map<string, { item: T; valor: number }>()
  for (const it of items) {
    if (it.opcionGrupo == null || !aplicaA(it.aplica, categoria) || it.precio == null) continue
    const valor = (it.precio * unidades(it, n)) / n
    const k = claveGrupo(it)
    const m = mejor.get(k)
    if (!m || valor > m.valor) mejor.set(k, { item: it, valor })
  }
  return new Set([...mejor.values()].map((m) => m.item))
}

export interface Comparacion {
  /** El precio por cubierto llevado a precio final (con IVA), como la carta. */
  precioFinal: number
  carta: number
  diferencia: number
  pct: number | null
  tipo: 'ESPECIAL' | 'SOBREPRECIO' | 'IGUAL'
  texto: string
}

/**
 * Precio por cubierto contra valor de carta. La carta del POS es precio
 * final (con IVA), así que un precio "más IVA" se lleva a final antes de
 * comparar; si no, un precio neto parecería siempre un descuento.
 */
export function comparar(precio: number, ivaModo: IvaModo, alicuota: number, carta: number): Comparacion | null {
  if (!(carta > 0)) return null
  const precioFinal = redondear(ivaModo === 'MAS_IVA' ? precio * (1 + alicuota / 100) : precio)
  const diferencia = redondear(precioFinal - carta)
  const pct = Math.round((diferencia / carta) * 1000) / 10
  const tipo = Math.abs(diferencia) < 0.5 ? 'IGUAL' : diferencia < 0 ? 'ESPECIAL' : 'SOBREPRECIO'
  const pctTxt = `${Math.abs(pct).toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`
  const texto = tipo === 'IGUAL' ? 'igual a la carta' : tipo === 'ESPECIAL' ? `precio especial (−${pctTxt})` : `sobreprecio (+${pctTxt})`
  return { precioFinal, carta, diferencia, pct, tipo, texto }
}

export interface Margen {
  precioNeto: number
  costo: number
  margen: number
  pct: number | null
}

/**
 * Margen por cubierto. El costo sale de facturas de compra, que están sin
 * IVA, así que se compara contra el precio neto: con precio final o IVA
 * incluido se le saca la alícuota del evento.
 */
export function margen(precio: number, ivaModo: IvaModo, alicuota: number, costo: number): Margen | null {
  if (!(costo > 0) || !(precio > 0)) return null
  const precioNeto = redondear(ivaModo === 'MAS_IVA' ? precio : precio / (1 + alicuota / 100))
  const m = redondear(precioNeto - costo)
  return { precioNeto, costo, margen: m, pct: precioNeto > 0 ? Math.round((m / precioNeto) * 1000) / 10 : null }
}

/** A cuántas personas les toca un grupo de opciones: la unión de a quiénes aplica cada una. */
function comensalesGrupo(opciones: ItemMenu[], g: { adultos: number; menores: number }) {
  const a = opciones.some((o) => o.aplica !== 'MENORES')
  const m = opciones.some((o) => o.aplica !== 'ADULTOS')
  return (a ? g.adultos : 0) + (m ? g.menores : 0)
}

export type LineaCocina =
  | { tipo: 'item'; item: ItemMenu; personas: number; unidades: number }
  /** Lo de un grupo de opciones que todavía no se sabe qué eligen. */
  | { tipo: 'aElegir'; paso: Paso; opciones: ItemMenu[]; personas: number }

/**
 * Lo que tiene que preparar la cocina para una reserva, con las opciones.
 *
 * Los ítems fijos, como siempre. En un grupo de opciones, si la reserva
 * cargó cuántos eligen cada una, cada opción se cuenta con su cantidad; lo
 * que falte para llegar a las personas del grupo queda "a elegir". Si las
 * cantidades no suman las personas, avisa.
 */
export function cocinaReserva(
  items: ItemMenu[],
  g: { adultos: number; menores: number },
  elegidas?: Map<string, number> | undefined
): { lineas: LineaCocina[]; avisos: string[] } {
  const lineas: LineaCocina[] = []
  const avisos: string[] = []
  const grupos = new Map<string, ItemMenu[]>()
  for (const it of items) {
    if (it.opcionGrupo == null) {
      const personas = comensales(it.aplica, g)
      lineas.push({ tipo: 'item', item: it, personas, unidades: unidades(it, personas) })
      continue
    }
    const k = claveGrupo(it)
    const arr = grupos.get(k)
    if (arr) arr.push(it)
    else grupos.set(k, [it])
  }
  for (const opciones of grupos.values()) {
    const personas = comensalesGrupo(opciones, g)
    let cargadas = 0
    let hay = false
    for (const it of opciones) {
      const n = elegidas?.get(claveOpcion(it))
      if (n == null) continue
      hay = true
      cargadas += n
      if (n > 0) lineas.push({ tipo: 'item', item: it, personas: n, unidades: unidades(it, n) })
    }
    if (hay && cargadas !== personas) {
      avisos.push(`${PASO_TEXTO[opciones[0]!.paso]}: eligieron ${cargadas} de ${personas} (${opciones.map((o) => o.nombre).join(' o ')})`)
    }
    if (personas - cargadas > 0) lineas.push({ tipo: 'aElegir', paso: opciones[0]!.paso, opciones, personas: personas - cargadas })
  }
  return { lineas, avisos }
}

/**
 * Los ítems de un paso como se leen: cada fijo solo, y cada grupo de
 * opciones junto, en el lugar de su primera opción.
 */
export function bloquesDePaso<T extends Pick<ItemMenu, 'paso' | 'opcionGrupo'>>(items: T[]): Array<{ grupo: number | null; items: T[] }> {
  const out: Array<{ grupo: number | null; items: T[] }> = []
  const vistos = new Map<number, { grupo: number | null; items: T[] }>()
  for (const it of items) {
    if (it.opcionGrupo == null) {
      out.push({ grupo: null, items: [it] })
      continue
    }
    const b = vistos.get(it.opcionGrupo)
    if (b) b.items.push(it)
    else {
      const nuevo = { grupo: it.opcionGrupo, items: [it] }
      vistos.set(it.opcionGrupo, nuevo)
      out.push(nuevo)
    }
  }
  return out
}

/** Ítems agrupados por paso, en el orden de los pasos y después el propio. */
export function porPaso<T extends Pick<ItemMenu, 'paso' | 'orden'>>(items: T[]): Array<{ paso: Paso; items: T[] }> {
  return PASOS.map((p) => ({ paso: p.valor, items: items.filter((i) => i.paso === p.valor).sort((a, b) => a.orden - b.orden) })).filter(
    (g) => g.items.length > 0
  )
}

// ---------------------------------------------------------------------------
// Adicionales
// ---------------------------------------------------------------------------

export interface Adicional {
  id?: string | undefined
  descripcion: string
  modalidad: Modalidad
  aplica: Aplica
  /** PERSONA: NULL = las personas a las que aplica. FIJO: NULL = 1. */
  cantidad: number | null
  precioUnitario: number
  paga: Paga
  nota: string | null
  orden: number
  /** Viene del evento (en la ficha de una reserva). */
  delEvento?: boolean | undefined
}

/**
 * Cantidad efectiva de un adicional en una reserva. Por persona cuentan
 * adultos y menores (o sólo una de las dos): liberados y bebés no pagan.
 * Misma regla que la vista `reserva_totales`.
 */
export function cantidadAdicional(a: Pick<Adicional, 'modalidad' | 'aplica' | 'cantidad'>, g: { adultos: number; menores: number }) {
  if (a.modalidad === 'FIJO') return a.cantidad ?? 1
  return a.cantidad ?? comensales(a.aplica, g)
}

export function importeAdicional(a: Pick<Adicional, 'modalidad' | 'aplica' | 'cantidad' | 'precioUnitario'>, g: { adultos: number; menores: number }) {
  return redondear(a.precioUnitario * cantidadAdicional(a, g))
}

/** Lo que suman los adicionales del titular (entran en la cuenta) y los de cada pasajero (informativos). */
export function sumaAdicionales(xs: Adicional[], g: { adultos: number; menores: number }) {
  let titular = 0
  let pasajero = 0
  for (const a of xs) {
    const m = importeAdicional(a, g)
    if (a.paga === 'TITULAR') titular += m
    else pasajero += m
  }
  return { titular: redondear(titular), pasajero: redondear(pasajero) }
}

/** Cómo se describe la modalidad: "por persona", "por persona (adultos)", "monto fijo". */
export function modalidadTexto(a: Pick<Adicional, 'modalidad' | 'aplica'>) {
  if (a.modalidad === 'FIJO') return 'monto fijo'
  return a.aplica === 'ADULTOS' ? 'por adulto' : a.aplica === 'MENORES' ? 'por menor' : 'por persona'
}

/** Los que se sugieren si la casa todavía no cargó ninguno. */
export const ADICIONALES_SUGERIDOS: Array<Pick<Adicional, 'descripcion' | 'modalidad' | 'aplica'>> = [
  { descripcion: 'Copa de bienvenida', modalidad: 'PERSONA', aplica: 'ADULTOS' },
  { descripcion: 'Show de Tango', modalidad: 'PERSONA', aplica: 'TODOS' },
  { descripcion: 'DJ', modalidad: 'FIJO', aplica: 'TODOS' },
]

const redondear = (n: number) => Math.round(n * 100) / 100

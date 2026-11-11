import type { IvaModo } from './constantes'
import type { Aplica, Paso } from './menu'

/**
 * El presupuesto como dato: lo que se arma en el servidor, lo que se guarda
 * congelado en cada versión (`evento_presupuestos.datos`) y lo que dibujan la
 * hoja imprimible y el texto para WhatsApp. Las dos salidas leen esto mismo,
 * así que nunca dicen cosas distintas.
 *
 * Sin imports del servidor.
 */

export interface PresupuestoDatos {
  tipo: 'RESERVA' | 'EVENTO'
  casa: { nombre: string; pie: string | null; validezDias: number | null }
  /** Número de reserva ("la 214"). */
  numero: number | null
  titulo: string
  cliente: string | null
  contacto: { nombre: string | null; telefono: string | null; email: string | null }
  evento: { nombre: string; tipo: string | null } | null
  fecha: string
  horario: string | null
  salon: string | null
  personas: { adultos: number; menores: number; bebes: number; liberados: number }
  menu: {
    nombre: string
    descripcion: string | null
    pasos: Array<{
      paso: Paso
      /** "Plato principal", o "Plato principal (a elección)" si el paso es sólo un grupo de opciones. */
      titulo: string
      /**
       * Un ítem fijo, o un grupo de opciones: `texto` ya viene armado
       * ("Bife de chorizo o Sorrentinos") y `opciones` trae cada una. Las
       * versiones anteriores a las opciones no lo tienen.
       */
      items: Array<{ texto: string; descripcion: string | null; aplica: Aplica; compartido: boolean; opciones?: string[] | null | undefined }>
    }>
  } | null
  /** NULL = se omitieron (lo normal antes de confirmar). */
  regimenes: Array<{ texto: string; cantidad: number | null; nota: string | null; menu: string | null; items: string[] }> | null
  /** NULL = quien lo armó no ve importes. */
  importes: {
    ivaModo: IvaModo
    ivaAlicuota: number
    precioAdulto: number
    precioMenor: number
    precioLiberado: number | null
    /** Cubiertos por categoría y adicionales del titular: lo que forma el total. */
    lineas: Array<{ tipo: 'CUBIERTO' | 'ADICIONAL'; concepto: string; detalle: string | null; cantidad: number; unitario: number; importe: number }>
    descuento: number
    descuentoNota: string | null
    /** NULL en un evento sin reservas todavía: sólo se cotiza por persona. */
    neto: number | null
    iva: number | null
    total: number | null
    /** A cargo de cada pasajero: se informa, no suma. */
    pasajero: Array<{ descripcion: string; detalle: string; unitario: number; importe: number | null }>
    cuotas: Array<{ concepto: string; importe: number | null; porcentaje: number | null; vencimiento: string | null }>
  } | null
  observaciones: string | null
  emitido: { fecha: string; version: number | null; usuario: string | null }
}

export interface VersionPresupuesto {
  id: string
  version: number
  total: number | null
  incluyeRegimenes: boolean
  usuarioNombre: string | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Formatos
// ---------------------------------------------------------------------------

export function plata(n: number) {
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`
}

/** "miércoles 31 de diciembre de 2026". Las fechas viajan como YYYY-MM-DD. */
export function fechaLarga(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function personasLargo(p: PresupuestoDatos['personas']) {
  const s = (n: number, uno: string, varios: string) => (n ? `${n} ${n === 1 ? uno : varios}` : '')
  return (
    [
      s(p.adultos, 'adulto', 'adultos'),
      s(p.menores, 'menor', 'menores'),
      s(p.bebes, 'bebé', 'bebés'),
      s(p.liberados, 'liberado', 'liberados'),
    ]
      .filter(Boolean)
      .join(', ') || 'a confirmar'
  )
}

export function ivaTexto(modo: IvaModo, alicuota: number) {
  return modo === 'MAS_IVA' ? `más IVA ${alicuota} %` : modo === 'INCLUIDO' ? 'IVA incluido' : 'precio final'
}

export const APLICA_SUFIJO: Record<Aplica, string> = { TODOS: '', ADULTOS: ' · adultos', MENORES: ' · menores' }

// ---------------------------------------------------------------------------
// Texto para WhatsApp
// ---------------------------------------------------------------------------

/**
 * Versión en texto plano, para pegar en WhatsApp: *negrita* y _cursiva_ son
 * las marcas que WhatsApp entiende; nada de tablas ni emojis que otros
 * teléfonos muestran como cuadraditos.
 */
export function textoWhatsApp(p: PresupuestoDatos): string {
  const l: string[] = []
  const t = p.importes
  l.push(`*Presupuesto · ${p.casa.nombre}*`)
  l.push(`${p.titulo}${p.numero ? ` (reserva ${p.numero})` : ''}${p.emitido.version ? ` · v${p.emitido.version}` : ''}`)
  if (p.evento && p.evento.nombre !== p.titulo) l.push(p.evento.nombre)
  l.push('')
  l.push(`Fecha: ${fechaLarga(p.fecha)}${p.horario ? ` · ${p.horario} h` : ''}`)
  if (p.salon) l.push(`Salón: ${p.salon}`)
  l.push(`Personas: ${personasLargo(p.personas)}`)

  if (p.menu) {
    l.push('', `*Menú${p.menu.nombre ? `: ${p.menu.nombre}` : ''}*`)
    if (p.menu.descripcion) l.push(`_${p.menu.descripcion}_`)
    for (const g of p.menu.pasos) {
      const linea = (i: (typeof g.items)[number]) => `${i.texto}${APLICA_SUFIJO[i.aplica]}${i.descripcion ? ` — ${i.descripcion}` : ''}`
      // Un paso que es sólo un grupo de opciones va en una línea:
      // "Plato principal (a elección): Bife de chorizo o Sorrentinos".
      if (g.items.length === 1 && g.items[0]!.opciones?.length) {
        l.push(`_${g.titulo}:_ ${linea(g.items[0]!)}`)
        continue
      }
      l.push(`_${g.titulo}_`)
      for (const i of g.items) l.push(`• ${i.opciones?.length ? 'A elección: ' : ''}${linea(i)}`)
    }
  }

  if (p.regimenes?.length) {
    l.push('', '*Regímenes especiales*')
    for (const r of p.regimenes) {
      l.push(`• ${r.texto}${r.cantidad ? ` (${r.cantidad})` : ''}${r.menu ? `: ${r.menu}` : ''}${r.nota ? ` — ${r.nota}` : ''}`)
      for (const i of r.items) l.push(`   - ${i}`)
    }
  }

  if (t) {
    l.push('', `*Precio por cubierto:* ${plata(t.precioAdulto)} adulto${t.precioMenor ? ` · ${plata(t.precioMenor)} menor` : ''} (${ivaTexto(t.ivaModo, t.ivaAlicuota)})`)
    const adicionales = t.lineas.filter((x) => x.tipo === 'ADICIONAL')
    if (adicionales.length) {
      l.push('', '*Adicionales*')
      for (const a of adicionales) l.push(`• ${a.concepto}${a.detalle ? ` (${a.detalle})` : ''}: ${a.cantidad} × ${plata(a.unitario)} = ${plata(a.importe)}`)
    }
    if (t.pasajero.length) {
      l.push('', '*A cargo de cada pasajero* _(no incluido en el total)_')
      for (const a of t.pasajero) l.push(`• ${a.descripcion}: ${plata(a.unitario)} ${a.detalle}`)
    }
    if (t.total != null) {
      l.push('')
      for (const x of t.lineas.filter((y) => y.tipo === 'CUBIERTO')) l.push(`${x.concepto}: ${x.cantidad} × ${plata(x.unitario)} = ${plata(x.importe)}`)
      if (t.descuento > 0) l.push(`Descuento${t.descuentoNota ? ` (${t.descuentoNota})` : ''}: −${plata(t.descuento)}`)
      if (t.ivaModo === 'MAS_IVA') {
        l.push(`Subtotal: ${plata(t.neto ?? 0)}`)
        l.push(`IVA ${t.ivaAlicuota} %: ${plata(t.iva ?? 0)}`)
      }
      l.push(`*Total: ${plata(t.total)}*${t.ivaModo === 'INCLUIDO' ? ` (IVA incluido: ${plata(t.iva ?? 0)})` : ''}`)
    }
    if (t.cuotas.length) {
      l.push('', '*Condiciones de pago*')
      for (const c of t.cuotas) {
        const cuanto = c.importe != null ? plata(c.importe) : c.porcentaje != null ? `${c.porcentaje} %` : 'el saldo'
        l.push(`• ${c.concepto}: ${cuanto}${c.porcentaje != null && c.importe != null ? ` (${c.porcentaje} %)` : ''}${c.vencimiento ? ` hasta el ${fechaCortaAnio(c.vencimiento)}` : ''}`)
      }
    }
  }

  if (p.observaciones) l.push('', '*Observaciones*', p.observaciones)
  if (p.casa.pie) l.push('', p.casa.pie)
  if (p.casa.validezDias) l.push('', `_Presupuesto válido por ${p.casa.validezDias} días desde el ${fechaCortaAnio(p.emitido.fecha)}._`)
  return l.join('\n')
}

export function fechaCortaAnio(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d}/${m}/${y}`
}

/**
 * Parser de cierres de caja Maxirest (POS gastronómico).
 *
 * Entrada: texto plano extraído del PDF (typical: pdf-parse).
 * Salida: estructura tipada con totales, ventas por artículo, mozos, formas de pago, etc.
 *
 * El formato del PDF es monoespaciado y bastante estable. Parseo es line-based con regex.
 * Si Maxirest cambia el layout, romper temprano con error claro para que el ingest loguee.
 */

export type TurnoNombre = 'ALMUERZO' | 'CENA' | 'OTRO'
export type MovimientoTipo = 'INGRESO' | 'EGRESO'
export type AuditFuente = 'CAJERO' | 'MOZO'
export type AuditTipo = 'EMISION' | 'DESCUENTO' | 'ELIMINACION' | 'ESPECIFICACION' | 'OTRO'

export interface ParsedAuditEvent {
  fuente: AuditFuente
  tipo: AuditTipo
  mesa: string | null
  mozo: string | null
  comprobante: string | null
  importeMesa: number | null
  horaApertura: string | null
  hora: string | null
  detalle: string
  monto: number | null
  porcentaje: number | null
  productoCodigo: string | null
  productoNombre: string | null
}

export interface ParsedClosure {
  empresa: string
  cuit: string // normalizado: 11 dígitos sin guiones
  cuitFormateado: string // original con guiones (para mostrar)
  sucursal: string | null
  domicilio: string | null
  fecha: Date // 00:00 UTC del día del cierre
  fechaTexto: string // ej: "Domingo 24 de Mayo de 2026"
  turnoNombre: TurnoNombre
  turnoNumero: number
  nroCierre: number
  apertura: { hora: string; usuario: string } | null
  cierre: { hora: string; usuario: string } | null
  movimientos: ParsedMovimiento[]
  resumen: ParsedResumen
  pagos: ParsedPago[]
  articulos: ParsedArticulo[]
  mozos: ParsedMozo[]
  auditoria: ParsedAuditEvent[]
  rawText: string
}

export interface ParsedMovimiento {
  tipo: MovimientoTipo
  conceptoCodigo: string
  detalle: string
  total: number
}

export interface ParsedResumen {
  totalVentas: number | null
  cantTickets: number | null
  efectivo: number | null
  ctaCte: number | null
  tarjetas: number | null
  descuentoTotal: number | null
  cantCubiertos: number | null
  promedioCubierto: number | null
  netoGravado: number | null
  ivaTotal: number | null
}

export interface ParsedPago {
  formaCobro: string
  sigla: string | null
  total: number
  cantidad: number
}

export interface ParsedArticulo {
  rubroCodigo: string | null
  rubroNombre: string | null
  codigo: string
  nombre: string
  unidades: number
  importe: number
}

export interface ParsedMozo {
  codigo: string
  nombre: string
  importe: number
  cantVentas: number
  cantCubiertos: number
}

const MESES: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
}

/** Devuelve grupo N de un match, o '' si no existe. Evita ruido por noUncheckedIndexedAccess. */
function g(m: RegExpMatchArray | null, idx: number): string {
  if (!m) return ''
  const v = m[idx]
  return v == null ? '' : v
}

/**
 * Parsea número con formato Maxirest: usa punto como decimal y NO usa separador de miles.
 * Tolera coma decimal por las dudas. Permite negativos.
 */
function parseNumber(s: string): number {
  const trimmed = s.trim().replace(/,/g, '.')
  const n = parseFloat(trimmed)
  return isNaN(n) ? 0 : n
}

function normalizarCuit(cuitConGuiones: string): string {
  return cuitConGuiones.replace(/\D/g, '')
}

function parseFechaTexto(texto: string): Date | null {
  // "Domingo 24 de Mayo de 2026" → 2026-05-24
  const m = texto.match(/(\d+)\s+de\s+([A-Za-zñÑ]+)\s+de\s+(\d{4})/i)
  if (!m) return null
  const dia = parseInt(g(m, 1), 10)
  const mesNombre = g(m, 2).toLowerCase()
  const mes = MESES[mesNombre]
  const anio = parseInt(g(m, 3), 10)
  if (mes === undefined || isNaN(dia) || isNaN(anio)) return null
  return new Date(Date.UTC(anio, mes, dia))
}

function turnoFromTexto(texto: string): TurnoNombre {
  const t = texto.toLowerCase()
  if (t.includes('almuerzo')) return 'ALMUERZO'
  if (t.includes('cena')) return 'CENA'
  return 'OTRO'
}

interface SectionBounds {
  movimientos: number
  resumen: number
  pagos: number
  articulos: number
  empleados: number
  auditoria: number
}

function findSectionBounds(text: string): SectionBounds {
  return {
    movimientos: text.indexOf('MOVIMIENTOS DE CAJA'),
    resumen: text.indexOf('RESUMEN DE VENTAS'),
    pagos: text.indexOf('VENTAS POR FORMA DE COBRO'),
    articulos: text.indexOf('VENTAS POR ARTICULO'),
    empleados: text.indexOf('VENTAS POR EMPLEADO'),
    auditoria: text.indexOf('AUDITORIA'),
  }
}

function sliceBetween(text: string, start: number, end: number): string {
  if (start < 0) return ''
  const real = end < 0 ? text.length : end
  return text.slice(start, real)
}

type Apertura = { hora: string; usuario: string }

interface HeaderResult {
  empresa: string
  cuit: string
  cuitFormateado: string
  sucursal: string | null
  domicilio: string | null
  fecha: Date
  fechaTexto: string
  turnoNombre: TurnoNombre
  turnoNumero: number
  nroCierre: number
  apertura: Apertura | null
  cierre: Apertura | null
}

function parseHeader(text: string): HeaderResult {
  const headerEnd = text.indexOf('MOVIMIENTOS DE CAJA')
  const header = headerEnd > 0 ? text.slice(0, headerEnd) : text.slice(0, 1500)
  const lines = header.split(/\r?\n/).map((l) => l.replace(/\s+$/, ''))

  const empresa = (lines.find((l) => l.trim().length > 0) ?? '').trim()

  const cuitMatch = header.match(/CUIT:\s*([\d-]+)/i)
  if (!cuitMatch) throw new Error('No se encontró CUIT en el cierre Maxirest')
  const cuitFormateado = g(cuitMatch, 1).trim()
  const cuit = normalizarCuit(cuitFormateado)
  if (cuit.length !== 11) {
    throw new Error(`CUIT con formato inválido: ${cuitFormateado}`)
  }

  const sucursalMatch = header.match(/Sucursal:\s*(.+?)\s*$/m)
  const sucursal = sucursalMatch ? g(sucursalMatch, 1).trim() : null

  let domicilio: string | null = null
  for (const l of lines) {
    const t = l.trim()
    if (!t) continue
    if (t === empresa) continue
    if (/^(Sucursal|IVA|CUIT|TOTALES|Turno|Cierre|Apertura)/i.test(t)) break
    if (t.length > 5 && /[A-Za-z]/.test(t)) {
      domicilio = t
      break
    }
  }

  const fechaLine = lines.find((l) => /\d+\s+de\s+[A-Za-zñÑ]+\s+de\s+\d{4}/.test(l)) ?? ''
  const fecha = parseFechaTexto(fechaLine)
  if (!fecha) throw new Error(`No se pudo parsear la fecha del cierre: "${fechaLine}"`)

  const turnoMatch = header.match(/Turno\s+(\d+)\s*[(\[]([^)\]]+)[)\]]/i)
  const turnoNumero = turnoMatch ? parseInt(g(turnoMatch, 1), 10) : 0
  const turnoNombre: TurnoNombre = turnoMatch ? turnoFromTexto(g(turnoMatch, 2)) : 'OTRO'

  const cierreMatch = header.match(/Cierre\s+n\S{0,2}\s*(\d+)/i)
  if (!cierreMatch) throw new Error('No se encontró número de cierre')
  const nroCierre = parseInt(g(cierreMatch, 1), 10)

  const aperturaMatch = header.match(/Apertura:\s*(\d{1,2}:\d{2})\s*-\s*Usuario:\s*(\S+)/i)
  const apertura: Apertura | null = aperturaMatch
    ? { hora: g(aperturaMatch, 1), usuario: g(aperturaMatch, 2) }
    : null

  const cierreOpMatch = header.match(/Cierre:\s*(\d{1,2}:\d{2})\s*-\s*Usuario:\s*(\S+)/i)
  const cierreOp: Apertura | null = cierreOpMatch
    ? { hora: g(cierreOpMatch, 1), usuario: g(cierreOpMatch, 2) }
    : null

  return {
    empresa,
    cuit,
    cuitFormateado,
    sucursal,
    domicilio,
    fecha,
    fechaTexto: fechaLine.trim(),
    turnoNombre,
    turnoNumero,
    nroCierre,
    apertura,
    cierre: cierreOp,
  }
}

function parseMovimientos(section: string): ParsedMovimiento[] {
  const lines = section.split(/\r?\n/)
  const movs: ParsedMovimiento[] = []
  let tipo: MovimientoTipo | null = null

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^INGRESOS\b/.test(trimmed)) { tipo = 'INGRESO'; continue }
    if (/^EGRESOS\b/.test(trimmed)) { tipo = 'EGRESO'; continue }
    if (!tipo) continue
    if (/^[~=]+/.test(trimmed)) continue
    if (/SUBTOTAL|TOTAL|^Turno:|MOVIMIENTOS DE CAJA|Conc\./i.test(trimmed)) continue
    if (/:\s+-?\d/.test(line)) continue

    const m = line.match(/^\s*(\S+(?:\.\S+)?)\s+(.+?)\s+(-?\d+(?:\.\d+)?)\s*$/)
    if (!m) continue
    movs.push({
      tipo,
      conceptoCodigo: g(m, 1).trim(),
      detalle: g(m, 2).trim(),
      total: parseNumber(g(m, 3)),
    })
  }
  return movs
}

function parseResumen(section: string): ParsedResumen {
  const out: ParsedResumen = {
    totalVentas: null,
    cantTickets: null,
    efectivo: null,
    ctaCte: null,
    tarjetas: null,
    descuentoTotal: null,
    cantCubiertos: null,
    promedioCubierto: null,
    netoGravado: null,
    ivaTotal: null,
  }

  function matchSingle(rx: RegExp): number | null {
    const m = section.match(rx)
    if (!m) return null
    return parseNumber(g(m, 1))
  }

  const totalLine = section.match(/^\s*TOTAL\s+(\d+(?:\.\d+)?)\s+(\d+)\s*$/m)
  if (totalLine) {
    out.totalVentas = parseNumber(g(totalLine, 1))
    out.cantTickets = parseInt(g(totalLine, 2), 10)
  }

  out.efectivo = matchSingle(/^\s*Efectivo\s+(\d+(?:\.\d+)?)\s+\d+\s*$/m)
  out.ctaCte = matchSingle(/^\s*Cta\.?\s*Cte\.?\s+(\d+(?:\.\d+)?)\s+\d+\s*$/m)
  out.tarjetas = matchSingle(/^\s*Tarjetas\s+(\d+(?:\.\d+)?)\s+\d+\s*$/m)
  out.descuentoTotal = matchSingle(/^\s*\d+\.Descuento\s+(\d+(?:\.\d+)?)\s+\d+\s*$/m)
  out.cantCubiertos = matchSingle(/^\s*TOTAL CUBIERTOS\s+(\d+(?:\.\d+)?)\s+\d+\s*$/m)
  out.promedioCubierto = matchSingle(/^\s*Promedio por cubiert\S*\s+(\d+(?:\.\d+)?)\s+\d+\s*$/m)
  out.netoGravado = matchSingle(/^\s*Neto\s+ACF\s+[\d.]+%\s+(\d+(?:\.\d+)?)\s+\d+\s*$/m)
  out.ivaTotal = matchSingle(/^\s*Iva\s+ACF\s+[\d.]+%\s+(\d+(?:\.\d+)?)\s+\d+\s*$/m)

  return out
}

function parsePagos(section: string): ParsedPago[] {
  const lines = section.split(/\r?\n/)
  const pagos: ParsedPago[] = []
  let started = false

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    const trimmed = line.trim()
    if (!trimmed) continue
    if (!started) {
      if (/^Forma de cobro/i.test(trimmed)) started = true
      continue
    }
    if (/^[~=]+/.test(trimmed)) continue
    if (/^TOTAL\b/i.test(trimmed)) break
    if (/^RESUMEN\b/i.test(trimmed)) break

    const m = line.match(/^\s*(.+?)\s*[(\[]([^)\]]+)[)\]]\s+(\d+(?:\.\d+)?)\s+(\d+)\s*$/)
    if (!m) continue
    pagos.push({
      formaCobro: g(m, 1).trim(),
      sigla: g(m, 2).trim() || null,
      total: parseNumber(g(m, 3)),
      cantidad: parseInt(g(m, 4), 10),
    })
  }
  return pagos
}

function parseArticulos(section: string): ParsedArticulo[] {
  const lines = section.split(/\r?\n/)
  const items: ParsedArticulo[] = []
  let rubroCodigo: string | null = null
  let rubroNombre: string | null = null

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^[~=-]+$/.test(trimmed)) continue
    if (/^Cód\./i.test(trimmed)) continue
    if (/^TOTAL RUBRO|^TOTALES:/i.test(trimmed)) continue
    if (/^VENTAS POR ARTICULO/i.test(trimmed)) continue

    const rubroM = trimmed.match(/^Rubro:\s*(\d+)\s*-\s*(.+?)\s*$/i)
    if (rubroM) {
      rubroCodigo = g(rubroM, 1)
      rubroNombre = g(rubroM, 2).trim()
      continue
    }

    const m = line.match(/^\s*(\S+)\s+(.+?)\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*$/)
    if (!m) continue

    items.push({
      rubroCodigo,
      rubroNombre,
      codigo: g(m, 1).trim(),
      nombre: g(m, 2).trim(),
      unidades: parseNumber(g(m, 3)),
      importe: parseNumber(g(m, 4)),
    })
  }
  return items
}

function parseMozos(section: string): ParsedMozo[] {
  const lines = section.split(/\r?\n/)
  const mozos: ParsedMozo[] = []
  let started = false

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    const trimmed = line.trim()
    if (!trimmed) continue
    if (!started) {
      if (/^Cód\s+Nombre/i.test(trimmed)) started = true
      continue
    }
    if (/^[~=]+/.test(trimmed)) continue
    if (/^TOTAL:/i.test(trimmed)) break

    const m = line.match(/^\s*(\d+)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(\d+)\s+(\d+)\s*$/)
    if (!m) continue
    mozos.push({
      codigo: g(m, 1),
      nombre: g(m, 2).trim(),
      importe: parseNumber(g(m, 3)),
      cantVentas: parseInt(g(m, 4), 10),
      cantCubiertos: parseInt(g(m, 5), 10),
    })
  }
  return mozos
}

interface BloqueMesa {
  mesa: string | null
  mozo: string | null
  horaApertura: string | null
  comprobante: string | null
  importeMesa: number | null
}

function classifyAuditTipo(detalle: string): AuditTipo {
  if (/Emisi[oó]n de control/i.test(detalle)) return 'EMISION'
  if (/^\s*DEL\s*:/i.test(detalle)) return 'ELIMINACION'
  if (/Especif\.?\s*Manual/i.test(detalle)) return 'ESPECIFICACION'
  if (/con\s+descue|Descuent|%/i.test(detalle)) return 'DESCUENTO'
  return 'OTRO'
}

function extractMonto(detalle: string): number | null {
  // "...$ 58800" o "...$ 58800.00" — capturamos último $ seguido de número
  const matches = detalle.match(/\$\s*(\d+(?:[.,]\d+)?)/g)
  if (!matches || matches.length === 0) return null
  const last = matches[matches.length - 1]
  if (!last) return null
  const m = last.match(/\$\s*(\d+(?:[.,]\d+)?)/)
  if (!m) return null
  return parseNumber(g(m, 1))
}

function extractPorcentaje(detalle: string): number | null {
  const m = detalle.match(/(\d+(?:\.\d+)?)\s*%/)
  if (!m) return null
  return parseNumber(g(m, 1))
}

function extractProductoFromEspecif(detalle: string): { codigo: string | null; nombre: string | null; nota: string | null } {
  // "Especif.Manual de 00302.MILANESA WEISS: sin sals"
  const m = detalle.match(/Especif\.?\s*Manual\s+de\s+(\d+)\.([^:]+):\s*(.*)/i)
  if (!m) return { codigo: null, nombre: null, nota: null }
  return {
    codigo: g(m, 1),
    nombre: g(m, 2).trim(),
    nota: g(m, 3).trim() || null,
  }
}

function extractProductoFromDel(detalle: string): { cantidad: number | null; nombre: string | null } {
  // "DEL: 1 ESPINACA A LA CREMA [-" → cantidad=1, nombre="ESPINACA A LA CREMA"
  const m = detalle.match(/DEL\s*:\s*(\d+(?:\.\d+)?)?\s*(.+?)(?:\s*[\[(]|\s*$)/i)
  if (!m) return { cantidad: null, nombre: null }
  return {
    cantidad: g(m, 1) ? parseNumber(g(m, 1)) : null,
    nombre: g(m, 2).trim() || null,
  }
}

function parseAuditoria(section: string): ParsedAuditEvent[] {
  if (!section) return []
  const lines = section.split(/\r?\n/)
  const out: ParsedAuditEvent[] = []
  let fuente: AuditFuente | null = null
  let bloque: BloqueMesa | null = null
  let eventoIdx = -1 // índice en out del evento actual (para continuación de líneas)

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^[~=]+$/.test(trimmed)) continue
    if (/^-{4,}/.test(trimmed)) {
      // separador entre secciones JOHAN/MOZOS
      bloque = null
      eventoIdx = -1
      continue
    }

    // Cambio de "Usuario:"
    const userM = trimmed.match(/^Usuario:\s*(\S+)/i)
    if (userM) {
      const u = g(userM, 1).toUpperCase()
      fuente = u === 'JOHAN' || u === 'CAJERO' ? 'CAJERO' : u === 'MOZOS' ? 'MOZO' : null
      bloque = null
      eventoIdx = -1
      continue
    }
    if (/^Fecha\s+\d/i.test(trimmed)) continue
    if (/^\*\*\s*FIN/i.test(trimmed)) break
    if (/^Auditorias\s+varias/i.test(trimmed)) {
      bloque = null
      eventoIdx = -1
      continue
    }
    if (/^Ultima\s+comanda/i.test(trimmed)) {
      // "16:27 Ultima comanda emitida:      1\n79" — ignorar, no es relevante
      bloque = null
      eventoIdx = -1
      continue
    }
    if (!fuente) continue

    // Inicio de bloque "Mesa..."
    const mesaM = line.match(/^\s*Mesa(\S+)\s+Mozo\s+(\S+)\s+Aper\.(\d{1,2}:\d{2})/i)
    if (mesaM) {
      bloque = {
        mesa: g(mesaM, 1),
        mozo: g(mesaM, 2),
        horaApertura: g(mesaM, 3),
        comprobante: null,
        importeMesa: null,
      }
      eventoIdx = -1
      continue
    }

    // Línea de comprobante (con o sin Cli.X prefix)
    if (bloque && !bloque.comprobante) {
      const cm = line.match(/(?:Cli\.\S+\s+)?(?:FCB\s+)?(\d{1,4})-(\d{1,8})\s+\$\s+([\d.,]+)/)
      if (cm) {
        bloque.comprobante = `FCB ${g(cm, 1)}-${g(cm, 2)}`
        bloque.importeMesa = parseNumber(g(cm, 3))
        eventoIdx = -1
        continue
      }
    }

    // Inicio de evento por timestamp HH:MM
    const evM = line.match(/^\s*(\d{1,2}:\d{2})\s+(.+)$/)
    if (evM) {
      const hora = g(evM, 1)
      const detalleInicial = g(evM, 2).trim()
      out.push({
        fuente,
        tipo: 'OTRO',
        mesa: bloque?.mesa ?? null,
        mozo: bloque?.mozo ?? null,
        comprobante: bloque?.comprobante ?? null,
        importeMesa: bloque?.importeMesa ?? null,
        horaApertura: bloque?.horaApertura ?? null,
        hora,
        detalle: detalleInicial,
        monto: null,
        porcentaje: null,
        productoCodigo: null,
        productoNombre: null,
      })
      eventoIdx = out.length - 1
      continue
    }

    // Continuación de evento (líneas siguientes sin timestamp)
    if (eventoIdx >= 0) {
      const ev = out[eventoIdx]
      if (ev) ev.detalle = (ev.detalle + ' ' + trimmed).trim()
    }
  }

  // Clasificar + extraer campos derivados
  for (const ev of out) {
    ev.tipo = classifyAuditTipo(ev.detalle)
    if (ev.tipo === 'DESCUENTO') {
      ev.monto = extractMonto(ev.detalle)
      ev.porcentaje = extractPorcentaje(ev.detalle)
    } else if (ev.tipo === 'EMISION') {
      ev.monto = extractMonto(ev.detalle)
    } else if (ev.tipo === 'ELIMINACION') {
      const { nombre } = extractProductoFromDel(ev.detalle)
      ev.productoNombre = nombre
    } else if (ev.tipo === 'ESPECIFICACION') {
      const { codigo, nombre } = extractProductoFromEspecif(ev.detalle)
      ev.productoCodigo = codigo
      ev.productoNombre = nombre
    }
  }

  return out
}

/**
 * Función principal: texto plano del PDF Maxirest → estructura tipada.
 * Lanza Error si falla el parseo del header.
 */
export function parseMaxirestClosure(rawText: string): ParsedClosure {
  if (!rawText || rawText.trim().length < 50) {
    throw new Error('Texto del cierre Maxirest vacío o demasiado corto')
  }

  const text = rawText.replace(/\r\n/g, '\n')
  const header = parseHeader(text)
  const sections = findSectionBounds(text)
  const movimientos = parseMovimientos(
    sliceBetween(text, sections.movimientos, sections.resumen)
  )
  const resumen = parseResumen(sliceBetween(text, sections.resumen, sections.pagos))
  const pagos = parsePagos(sliceBetween(text, sections.pagos, sections.articulos))
  const articulos = parseArticulos(
    sliceBetween(text, sections.articulos, sections.empleados)
  )
  const mozos = parseMozos(
    sliceBetween(
      text,
      sections.empleados,
      sections.auditoria > 0 ? sections.auditoria : -1
    )
  )
  const auditoria = sections.auditoria > 0
    ? parseAuditoria(text.slice(sections.auditoria))
    : []

  return {
    ...header,
    movimientos,
    resumen,
    pagos,
    articulos,
    mozos,
    auditoria,
    rawText,
  }
}

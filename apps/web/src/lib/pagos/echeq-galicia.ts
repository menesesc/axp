import fs from 'fs/promises'
import path from 'path'
import * as XLSX from 'xlsx'

/**
 * Emisión masiva de eCheq en Banco Galicia (Office Banking).
 *
 * Se completa la plantilla OFICIAL del banco (public/plantillas/
 * Plantilla_Emision250.xlsx) en vez de generar un Excel nuevo: así se
 * conservan la hoja de instrucciones, los formatos y las validaciones que el
 * banco espera. Solo se reemplazan las filas de datos de la hoja
 * "Plantilla para emision" (xl/worksheets/sheet2.xml).
 *
 * Columnas (máx. 250 cheques):
 *   A Tipo de documento  CUIT | CUIL | CDI
 *   B Nro. de documento  11 dígitos, numérico
 *   C Monto              numérico
 *   D Fecha de pago      texto DD/MM/AAAA
 *   E Motivo de pago     Varios | Factura | Orden de Pago | Alquiler | Expensas | Servicios
 *   F Descripción 1      opcional (100); si va la 2, va la 1
 *   G Descripción 2      opcional (50); si va la 1, va la 2
 *   H Mail               opcional, un solo destinatario (el banco le manda el detalle)
 *   I Cláusula           A la orden | No a la orden
 *   J Nro de cheque      opcional: si va vacío lo asigna el banco
 */

export const ECHEQ_MAX_FILAS = 250
export const ECHEQ_MOTIVOS = ['Orden de Pago', 'Factura', 'Varios', 'Servicios', 'Alquiler', 'Expensas'] as const
export const ECHEQ_CLAUSULAS = ['A la orden', 'No a la orden'] as const

export type EcheqMotivo = (typeof ECHEQ_MOTIVOS)[number]
export type EcheqClausula = (typeof ECHEQ_CLAUSULAS)[number]

export interface EcheqFila {
  cuit: string
  monto: number
  fecha: string // YYYY-MM-DD
  motivo: EcheqMotivo
  descripcion1: string
  descripcion2: string
  mail: string | null
  clausula: EcheqClausula
}

const PLANTILLA = path.join(process.cwd(), 'public', 'plantillas', 'Plantilla_Emision250.xlsx')
const HOJA = '/xl/worksheets/sheet2.xml'

// Estilos (índices de cellXfs de la plantilla) de las celdas de datos.
const S_TEXTO = 10 // texto (@)
const S_DOC = 11 // número #0
const S_MONTO = 12 // número 0.00
const S_MAIL = 13 // texto
const S_CLAUSULA = 14

function xmlEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const texto = (ref: string, s: number, v: string) =>
  v ? `<c r="${ref}" s="${s}" t="inlineStr"><is><t>${xmlEsc(v)}</t></is></c>` : `<c r="${ref}" s="${s}"/>`
const numero = (ref: string, s: number, v: number) => `<c r="${ref}" s="${s}"><v>${v}</v></c>`

function fechaDDMMAAAA(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function filaXml(r: number, f: EcheqFila): string {
  const cuit = f.cuit.replace(/\D/g, '')
  // Descripción 1 y 2 van juntas: si falta una, se completa con la otra.
  const d1 = f.descripcion1.trim().slice(0, 100)
  const d2 = f.descripcion2.trim().slice(0, 50)
  const desc1 = d1 || d2
  const desc2 = d2 || d1.slice(0, 50)
  return (
    `<row r="${r}" spans="1:10" x14ac:dyDescent="0.25">` +
    texto(`A${r}`, S_TEXTO, 'CUIT') +
    numero(`B${r}`, S_DOC, Number(cuit)) +
    numero(`C${r}`, S_MONTO, Math.round(f.monto * 100) / 100) +
    texto(`D${r}`, S_TEXTO, fechaDDMMAAAA(f.fecha)) +
    texto(`E${r}`, S_TEXTO, f.motivo) +
    texto(`F${r}`, S_TEXTO, desc1) +
    texto(`G${r}`, S_TEXTO, desc2) +
    texto(`H${r}`, S_MAIL, f.mail?.trim() ?? '') +
    texto(`I${r}`, S_CLAUSULA, f.clausula) +
    `</row>`
  )
}

/** Devuelve el .xlsx de la plantilla de Galicia con los cheques cargados. */
export async function generarPlantillaEcheq(filas: EcheqFila[]): Promise<Buffer> {
  if (filas.length === 0) throw new Error('No hay eCheq para emitir')
  if (filas.length > ECHEQ_MAX_FILAS) throw new Error(`La plantilla admite hasta ${ECHEQ_MAX_FILAS} cheques`)
  for (const f of filas) {
    if (!/^\d{11}$/.test(f.cuit.replace(/\D/g, ''))) throw new Error('El proveedor no tiene un CUIT válido de 11 dígitos')
    if (!(f.monto > 0)) throw new Error('Hay un eCheq sin importe')
  }

  const CFB = (XLSX as unknown as { CFB: any }).CFB
  const cfb = CFB.read(await fs.readFile(PLANTILLA), { type: 'buffer' })
  const hoja = CFB.find(cfb, HOJA)
  if (!hoja) throw new Error('Plantilla de eCheq inválida')

  let xml = Buffer.from(hoja.content).toString('utf8')
  // Reemplaza las filas vacías 2..N por las de los cheques (la 1 es el encabezado).
  for (const [i, f] of filas.entries()) {
    const r = i + 2
    const re = new RegExp(`<row r="${r}"[^>]*?(?:/>|>.*?</row>)`)
    if (!re.test(xml)) throw new Error('Plantilla de eCheq inválida')
    xml = xml.replace(re, filaXml(r, f))
  }
  hoja.content = Buffer.from(xml, 'utf8')
  // SheetJS agrega una entrada propia al leer: no debe viajar en el archivo.
  CFB.utils.cfb_del?.(cfb, '/\u0001Sh33tJ5')

  return CFB.write(cfb, { fileType: 'zip', type: 'buffer' }) as Buffer
}

// ---------------------------------------------------------------------------
// Lectura de los PDF de eCheq emitidos
// ---------------------------------------------------------------------------

export interface EcheqLeido {
  montos: number[]
  fechas: string[] // YYYY-MM-DD, todas las que aparecen
  numero: string | null
}

/** "1.234.567,89" → 1234567.89 */
function parseMontoAR(s: string): number {
  return Number(s.replace(/\./g, '').replace(',', '.'))
}

/**
 * Extrae del texto de un eCheq lo que sirve para reconocerlo: importes, fechas
 * y número de cheque. Se toman todos los importes y fechas porque el PDF trae
 * varias (emisión, pago) sin etiquetas confiables; el reparto decide.
 */
export function leerEcheq(textoPdf: string): EcheqLeido {
  const montos = [...textoPdf.matchAll(/(?<![\d.,])(\d{1,3}(?:\.\d{3})*,\d{2})(?![\d])/g)].map((m) => parseMontoAR(m[1]!))
  const fechas = [...textoPdf.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)].map((m) => `${m[3]}-${m[2]}-${m[1]}`)
  const numero =
    textoPdf.match(/(?:N[°ºo]\.?\s*(?:de\s*)?cheque|cheque\s*N[°ºo]\.?|N[uú]mero\s*de\s*cheque)\s*:?\s*(\d{4,12})/i)?.[1] ?? null
  return { montos: [...new Set(montos)], fechas: [...new Set(fechas)], numero }
}

export interface LineaEcheq {
  id: string
  monto: number
  fecha: string // YYYY-MM-DD
}

export interface AsignacionEcheq {
  metodoId: string | null
  coincidencia: 'exacta' | 'probable' | 'ninguna'
  motivo: string
}

/**
 * Reparte PDFs de eCheq entre las líneas eCheq de la orden:
 *  - exacta: coincide importe y fecha de pago
 *  - probable: coincide solo el importe (si hay una sola línea libre con ese importe)
 * Cada línea recibe a lo sumo un PDF.
 */
export function repartirEcheqs(leidos: EcheqLeido[], lineas: LineaEcheq[]): AsignacionEcheq[] {
  const out: AsignacionEcheq[] = leidos.map(() => ({ metodoId: null, coincidencia: 'ninguna', motivo: 'Ningún eCheq de la orden coincide' }))
  const tomadas = new Set<string>()
  const mismoMonto = (l: EcheqLeido, m: number) => l.montos.some((x) => Math.abs(x - m) < 0.01)

  leidos.forEach((l, i) => {
    const c = lineas.filter((x) => !tomadas.has(x.id) && mismoMonto(l, x.monto) && l.fechas.includes(x.fecha))
    if (c.length >= 1) {
      tomadas.add(c[0]!.id)
      out[i] = { metodoId: c[0]!.id, coincidencia: 'exacta', motivo: 'Coincide importe y fecha de pago' }
    }
  })
  leidos.forEach((l, i) => {
    if (out[i]!.metodoId) return
    const c = lineas.filter((x) => !tomadas.has(x.id) && mismoMonto(l, x.monto))
    if (c.length === 1) {
      tomadas.add(c[0]!.id)
      out[i] = { metodoId: c[0]!.id, coincidencia: 'probable', motivo: 'Coincide el importe (revisá la fecha)' }
    } else if (c.length > 1) {
      out[i] = { metodoId: null, coincidencia: 'ninguna', motivo: 'Varios eCheq con el mismo importe: elegí cuál es' }
    }
  })
  return out
}

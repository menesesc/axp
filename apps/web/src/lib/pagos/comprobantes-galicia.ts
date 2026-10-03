/**
 * Lectura de comprobantes de transferencia de Banco Galicia.
 *
 * Formatos vistos (texto extraído con pdf-parse, sin separadores entre celdas):
 *  - "Detalle de la operación": transferencia individual.
 *      08/07/2026LR78GA8733 … Walpina S. A. S.$ 4.900.500,00 … Truchas Bariloche Srl30711363382
 *      … 0070031320000004568944Banco Galicia
 *  - "COMPROBANTE DE LA OPERACIÓN": pago a proveedores / archivo.
 *      Identificador de la operación: LRA2CLo646 … 02/10/2026$ 602.272,91 …
 *      30719238692WALPINA S. A. S. (pagador) … 30581106234Transportes Imaz Srl … 0720285020000000003454
 *
 * Ninguno trae etiquetas separadas del valor, así que se extrae por forma: CBU =
 * 22 dígitos aislados, CUIT = 11 dígitos aislados (descartando el del pagador),
 * importe = "$ 1.234,56". Se procesa de a una página: un PDF puede traer varias
 * transferencias.
 */

export interface ComprobanteLeido {
  cbu: string | null
  cuit: string | null
  monto: number | null
  operacion: string | null
  fecha: string | null // YYYY-MM-DD
}

/** "4.900.500,00" → 4900500 */
function parseMontoAR(s: string): number {
  return Number(s.replace(/\./g, '').replace(',', '.'))
}

export function leerComprobanteGalicia(texto: string, cuitPagador?: string | null): ComprobanteLeido {
  const cbu = texto.match(/(?<!\d)(\d{22})(?!\d)/)?.[1] ?? null

  const cuits = [...texto.matchAll(/(?<!\d)(\d{11})(?!\d)/g)].map((m) => m[1]!)
  const cuit = cuits.find((c) => c !== cuitPagador) ?? null

  const montos = [...texto.matchAll(/\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})(?!\d)/g)].map((m) => parseMontoAR(m[1]!))
  const monto = montos[0] ?? null

  const operacion =
    texto.match(/Identificador de la operaci[oó]n:\s*([A-Za-z0-9]+)/)?.[1] ??
    texto.match(/N[uú]mero de operaci[oó]n\s*\d{2}\/\d{2}\/\d{4}([A-Za-z0-9]{6,16})/)?.[1] ??
    null

  const f = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  const fecha = f ? `${f[3]}-${f[2]}-${f[1]}` : null

  return { cbu, cuit, monto, operacion, fecha }
}

export interface OrdenParaConciliar {
  id: string
  cbu: string | null
  cuit: string | null
  monto: number
}

export type Coincidencia = 'exacta' | 'probable' | 'ninguna'

export interface Asignacion {
  pagoId: string | null
  coincidencia: Coincidencia
  motivo: string
}

const mismoMonto = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 0.01

/**
 * Reparte comprobantes entre órdenes. Primero las coincidencias exactas
 * (cuenta o CUIT + importe), después las probables (solo importe, o solo
 * cuenta/CUIT con importe distinto). Una orden recibe a lo sumo un comprobante;
 * si dos comprobantes compiten por la misma orden, ninguno se asigna solo.
 */
export function repartirComprobantes(leidos: ComprobanteLeido[], ordenes: OrdenParaConciliar[]): Asignacion[] {
  const out: Asignacion[] = leidos.map(() => ({ pagoId: null, coincidencia: 'ninguna', motivo: 'Sin orden que coincida' }))
  const tomadas = new Set<string>()

  const pasada = (
    coincidencia: Coincidencia,
    candidatas: (l: ComprobanteLeido) => Array<{ orden: OrdenParaConciliar; motivo: string }>
  ) => {
    const propuestas = new Map<number, { orden: OrdenParaConciliar; motivo: string }>()
    const conteo = new Map<string, number>()
    leidos.forEach((l, i) => {
      if (out[i]!.pagoId) return
      const c = candidatas(l).filter((x) => !tomadas.has(x.orden.id))
      if (c.length === 1) {
        propuestas.set(i, c[0]!)
        conteo.set(c[0]!.orden.id, (conteo.get(c[0]!.orden.id) ?? 0) + 1)
      } else if (c.length > 1) {
        out[i] = { pagoId: null, coincidencia: 'ninguna', motivo: `${c.length} órdenes posibles` }
      }
    })
    for (const [i, p] of propuestas) {
      if (conteo.get(p.orden.id)! > 1) {
        out[i] = { pagoId: null, coincidencia: 'ninguna', motivo: 'Otro comprobante apunta a la misma orden' }
        continue
      }
      out[i] = { pagoId: p.orden.id, coincidencia, motivo: p.motivo }
      tomadas.add(p.orden.id)
    }
  }

  pasada('exacta', (l) =>
    ordenes.flatMap((o) => {
      if (!mismoMonto(l.monto, o.monto)) return []
      if (l.cbu && o.cbu && l.cbu === o.cbu) return [{ orden: o, motivo: 'CBU e importe' }]
      if (l.cuit && o.cuit && l.cuit === o.cuit) return [{ orden: o, motivo: 'CUIT e importe' }]
      return []
    })
  )
  pasada('probable', (l) =>
    ordenes.flatMap((o) => {
      const cuenta = (l.cbu && o.cbu && l.cbu === o.cbu) || (l.cuit && o.cuit && l.cuit === o.cuit)
      if (cuenta) return [{ orden: o, motivo: 'Mismo destinatario, importe distinto' }]
      return []
    })
  )
  pasada('probable', (l) =>
    ordenes.filter((o) => mismoMonto(l.monto, o.monto)).map((o) => ({ orden: o, motivo: 'Solo coincide el importe' }))
  )

  return out
}

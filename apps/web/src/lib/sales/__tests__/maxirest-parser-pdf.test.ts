import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseMaxirestClosure } from '../maxirest-parser'

// pdf-parse v1 API: default export es una función async (buffer) → { text, numpages, ... }
async function pdfToText(buffer: Buffer): Promise<string> {
  const mod = await import('pdf-parse')
  const pdfParse = (mod as { default?: (b: Buffer) => Promise<{ text: string }> }).default
    ?? (mod as unknown as (b: Buffer) => Promise<{ text: string }>)
  const result = await pdfParse(buffer)
  return result.text
}

describe('parseMaxirestClosure - PDF real (extracción via pdf-parse)', () => {
  test('parsea el PDF "maxirest 20260525-mediodia.PDF" correctamente', async () => {
    const pdfPath = join(__dirname, '../../../../../..', 'maxirest 20260525-mediodia.PDF')
    const buffer = readFileSync(pdfPath)
    const text = await pdfToText(buffer)
    const parsed = parseMaxirestClosure(text)

    expect(parsed.cuit).toBe('30719238692')
    expect(parsed.sucursal).toBe('WEISS')
    expect(parsed.nroCierre).toBe(1543)
    expect(parsed.turnoNombre).toBe('ALMUERZO')
    expect(parsed.resumen.totalVentas).toBe(3878100)
    expect(parsed.resumen.cantTickets).toBe(38)
    expect(parsed.pagos.length).toBeGreaterThanOrEqual(7)
    expect(parsed.mozos).toHaveLength(4)
    expect(parsed.articulos.length).toBeGreaterThan(60)
  })
})

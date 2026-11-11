import { describe, expect, test } from 'bun:test'
import { calculateMissingFields, determineEstadoRevision } from './documento-estado'

// Un F.931 como lo deja el OCR: proveedor ARCA, período como número, sin letra.
const f931 = {
  clienteId: 'c',
  proveedorId: 'arca',
  fechaEmision: '2026-11-10',
  total: 32490710.25,
  letra: null,
  numeroCompleto: '202610',
  subtotal: 32490710.25,
  iva: 0,
  pdfRawKey: 'x.pdf',
}

describe('documentos de impuestos', () => {
  test('sin letra queda pendiente si el proveedor no es un impuesto', () => {
    expect(determineEstadoRevision(f931)).toBe('PENDIENTE')
    expect(calculateMissingFields(f931)).toContain('letra')
  })

  test('con proveedor de impuestos se confirma sin letra', () => {
    expect(determineEstadoRevision({ ...f931, sinLetra: true })).toBe('CONFIRMADO')
    expect(calculateMissingFields({ ...f931, sinLetra: true })).toEqual([])
  })

  test('total 0 (saldo a favor) también se confirma', () => {
    expect(determineEstadoRevision({ ...f931, total: 0, subtotal: 0, sinLetra: true })).toBe('CONFIRMADO')
  })

  test('sinLetra no exime del resto de los campos', () => {
    expect(determineEstadoRevision({ ...f931, sinLetra: true, proveedorId: null })).toBe('PENDIENTE')
    expect(determineEstadoRevision({ ...f931, sinLetra: true, numeroCompleto: null })).toBe('PENDIENTE')
  })
})

import { describe, expect, test } from 'bun:test'
import { completarNombre } from '../completar-nombre'

// Todos los pares salen de datos reales: el nombre corto es el que llegó de
// Maxirest y la descripción, la de una factura de compra.

describe('completa la palabra cortada y nada más', () => {
  test('ALAMOS CABERNET S', () => {
    expect(completarNombre('ALAMOS CABERNET S', 'CZ ALAMOS CABERNET SAUVIGNON 750CC 2024')).toBe(
      'ALAMOS CABERNET SAUVIGNON'
    )
  })

  test('ALA COLORADA TANN, con la variedad adelante en la factura', () => {
    expect(completarNombre('ALA COLORADA TANN', 'AC-TANNAT 6X750 ALA COLORADA')).toBe('ALA COLORADA TANNAT')
  })

  test('CHANDON EXTRA BRU', () => {
    expect(completarNombre('CHANDON EXTRA BRU', 'CHANDON EXTRA BRUT 6 X 75 CL')).toBe('CHANDON EXTRA BRUT')
  })

  test('ALAMBRADO SAUVIGN', () => {
    expect(completarNombre('ALAMBRADO SAUVIGN', 'ALAMBRADO SAUVIGNON BLANC CAJ 6X750 ML')).toBe(
      'ALAMBRADO SAUVIGNON'
    )
  })

  test('AGUA MINERAL CON, sin arrastrar el envase', () => {
    expect(completarNombre('AGUA MINERAL CON', 'AGUA MINERAL CON GAS 1.5 LT')).toBeNull()
  })
})

describe('no inventa', () => {
  test('si no falta nada, no propone nada', () => {
    expect(completarNombre('LATITUD 33 MALBEC', 'B CH LATITUD33 MALBEC 23 750ML (6)')).toBeNull()
  })

  test('no agrega palabras que el nombre no tenía', () => {
    // "RESERVA" está en la factura pero el nombre corto no la empezó: no se
    // puede saber si Maxirest la cortó o si nunca estuvo.
    expect(completarNombre('ALAMOS MALBEC', 'CZ ALAMOS MALBEC RESERVA 750CC 2025')).toBeNull()
  })

  test('no toma la presentación como palabra', () => {
    expect(completarNombre('KILLKA MALBEC', 'KILLKA MALBEC 6X750CC')).toBeNull()
  })

  test('no toma la añada', () => {
    expect(completarNombre('LOS NOBLES MALBEC', 'LOS NOBLES MALBEC DOC 2021')).toBeNull()
  })

  test('una inicial suelta en el medio no se completa', () => {
    // La "S" del medio podría ser cualquier cosa; sólo la última palabra, que
    // es donde cae el corte, se arriesga.
    expect(completarNombre('FINCA S MALBEC', 'FINCA SOPHENIA MALBEC 750')).toBeNull()
  })

  test('descripción sin nada útil', () => {
    expect(completarNombre('ALAMOS MALBEC', '6X750 ML CAJA')).toBeNull()
  })
})

describe('respeta cómo está escrito', () => {
  test('en minúsculas mantiene lo de la factura', () => {
    expect(completarNombre('Chandon extra bru', 'Chandon Extra Brut 6 x 75 cl')).toBe('Chandon extra Brut')
  })
})

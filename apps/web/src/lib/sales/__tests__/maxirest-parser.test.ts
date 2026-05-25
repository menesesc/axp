import { describe, expect, test } from 'bun:test'
import { parseMaxirestClosure } from '../maxirest-parser'
import { MAXIREST_SAMPLE_TEXT } from './maxirest-fixture'

describe('parseMaxirestClosure', () => {
  const parsed = parseMaxirestClosure(MAXIREST_SAMPLE_TEXT)

  test('header: empresa, CUIT y sucursal', () => {
    expect(parsed.empresa).toBe('WALPINA S. A. S.')
    expect(parsed.cuit).toBe('30719238692')
    expect(parsed.cuitFormateado).toBe('30-71923869-2')
    expect(parsed.sucursal).toBe('WEISS')
    expect(parsed.domicilio).toBe('VICE ALTE OCONNOR 401')
  })

  test('header: fecha 24 de mayo 2026 (UTC)', () => {
    expect(parsed.fecha.toISOString()).toBe('2026-05-24T00:00:00.000Z')
  })

  test('header: turno almuerzo número 1', () => {
    expect(parsed.turnoNombre).toBe('ALMUERZO')
    expect(parsed.turnoNumero).toBe(1)
  })

  test('header: nro de cierre 1543', () => {
    expect(parsed.nroCierre).toBe(1543)
  })

  test('header: apertura y cierre con usuario', () => {
    expect(parsed.apertura).toEqual({ hora: '12:03', usuario: 'JOHAN' })
    expect(parsed.cierre).toEqual({ hora: '16:27', usuario: 'JOHAN' })
  })

  test('movimientos: 1 ingreso + 3 egresos', () => {
    const ingresos = parsed.movimientos.filter((m) => m.tipo === 'INGRESO')
    const egresos = parsed.movimientos.filter((m) => m.tipo === 'EGRESO')
    expect(ingresos).toHaveLength(1)
    expect(ingresos[0].detalle).toBe('Recaudación')
    expect(ingresos[0].total).toBe(1054800)
    expect(egresos).toHaveLength(3)
    expect(egresos[0].total).toBe(-866025)
  })

  test('resumen: totales principales', () => {
    expect(parsed.resumen.totalVentas).toBe(3878100)
    expect(parsed.resumen.cantTickets).toBe(38)
    expect(parsed.resumen.efectivo).toBe(1054800)
    expect(parsed.resumen.ctaCte).toBe(19600)
    expect(parsed.resumen.tarjetas).toBe(2803700)
    expect(parsed.resumen.cantCubiertos).toBe(78)
    expect(parsed.resumen.promedioCubierto).toBe(46057.69)
    expect(parsed.resumen.netoGravado).toBe(3205041.32)
    expect(parsed.resumen.ivaTotal).toBe(673058.68)
    expect(parsed.resumen.descuentoTotal).toBe(122400)
  })

  test('resumen: tipos de facturación (A elec, B elec, B)', () => {
    expect(parsed.resumen.facturaAElectronica).toBeNull()
    expect(parsed.resumen.cantFacturaAElectronica).toBeNull()
    expect(parsed.resumen.facturaBElectronica).toBe(2785700)
    expect(parsed.resumen.cantFacturaBElectronica).toBe(23)
    expect(parsed.resumen.facturaB).toBe(1092400)
    expect(parsed.resumen.cantFacturaB).toBe(15)
  })

  test('pagos: 7 formas de cobro', () => {
    expect(parsed.pagos).toHaveLength(7)
    const efectivo = parsed.pagos.find((p) => p.formaCobro === 'Efectivo')
    expect(efectivo).toBeDefined()
    expect(efectivo!.sigla).toBe('*')
    expect(efectivo!.total).toBe(1054800)
    expect(efectivo!.cantidad).toBe(14)

    const qr = parsed.pagos.find((p) => p.sigla === 'P')
    expect(qr).toBeDefined()
    expect(qr!.formaCobro).toBe('QR - MP')
    expect(qr!.total).toBe(532200)
  })

  test('articulos: rubros y conteo total', () => {
    // No incluye CUBIERTOS (****) sin rubro como "rubro real". Pero sí lo capturamos.
    const conRubro = parsed.articulos.filter((a) => a.rubroCodigo !== null)
    const sinRubro = parsed.articulos.filter((a) => a.rubroCodigo === null)
    expect(sinRubro.length).toBeGreaterThanOrEqual(1) // CUBIERTOS al principio
    expect(conRubro.length).toBeGreaterThan(60)

    const bife = parsed.articulos.find((a) => a.codigo === '154')
    expect(bife).toBeDefined()
    expect(bife!.nombre).toBe('BIFE CHORIZO PAPA')
    expect(bife!.unidades).toBe(6)
    expect(bife!.importe).toBe(228000)
    expect(bife!.rubroNombre).toBe('CARNE PARRILLA')

    // Caso con unidades pegadas al nombre
    const empanada = parsed.articulos.find((a) => a.codigo === '6')
    expect(empanada).toBeDefined()
    expect(empanada!.unidades).toBe(10)
    expect(empanada!.importe).toBe(55000)

    // Caso de código numérico largo
    const cafe = parsed.articulos.find((a) => a.codigo === '1001')
    expect(cafe).toBeDefined()
    expect(cafe!.unidades).toBe(4)
    expect(cafe!.importe).toBe(12000)

    // Suma de importes por rubro debe coincidir con totales del fixture
    const carneParrilla = parsed.articulos
      .filter((a) => a.rubroCodigo === '4')
      .reduce((sum, a) => sum + a.importe, 0)
    expect(carneParrilla).toBe(568000)
  })

  test('mozos: 4 empleados', () => {
    expect(parsed.mozos).toHaveLength(4)
    const andres = parsed.mozos.find((m) => m.codigo === '101')
    expect(andres).toBeDefined()
    expect(andres!.nombre).toBe('ANDRES')
    expect(andres!.importe).toBe(1465500)
    expect(andres!.cantVentas).toBe(17)
    expect(andres!.cantCubiertos).toBe(25)

    const totalMozos = parsed.mozos.reduce((s, m) => s + m.importe, 0)
    expect(totalMozos).toBe(3878100)
  })

  test('rawText se preserva tal cual', () => {
    expect(parsed.rawText).toBe(MAXIREST_SAMPLE_TEXT)
  })
})

describe('parseMaxirestClosure - errores', () => {
  test('texto vacío lanza error', () => {
    expect(() => parseMaxirestClosure('')).toThrow(/vacío/i)
  })

  test('sin CUIT lanza error', () => {
    expect(() =>
      parseMaxirestClosure(
        'WALPINA S. A. S.\nDomingo 24 de Mayo de 2026\nTurno 1 (Almuerzo)\nCierre nº 1543.'
      )
    ).toThrow(/CUIT/i)
  })
})

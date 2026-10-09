import { describe, expect, test } from 'bun:test'
import { periodoDe, vencimientosEntre } from '../obligaciones'

describe('vencimientosEntre', () => {
  test('mensual: uno por mes', () => {
    expect(vencimientosEntre({ periodicidad: 'MENSUAL', diaVencimiento: 15 }, '2026-10-01', '2026-12-31')).toEqual([
      '2026-10-15',
      '2026-11-15',
      '2026-12-15',
    ])
  })

  test('mensual: el 31 se corre al último día del mes corto', () => {
    expect(vencimientosEntre({ periodicidad: 'MENSUAL', diaVencimiento: 31 }, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  test('febrero bisiesto', () => {
    expect(vencimientosEntre({ periodicidad: 'MENSUAL', diaVencimiento: 30 }, '2028-02-01', '2028-02-29')).toEqual([
      '2028-02-29',
    ])
  })

  test('respeta los bordes del rango', () => {
    expect(vencimientosEntre({ periodicidad: 'MENSUAL', diaVencimiento: 10 }, '2026-10-11', '2026-11-09')).toEqual([])
    expect(vencimientosEntre({ periodicidad: 'MENSUAL', diaVencimiento: 10 }, '2026-10-10', '2026-10-10')).toEqual([
      '2026-10-10',
    ])
  })

  test('bimestral desde el mes ancla', () => {
    expect(
      vencimientosEntre({ periodicidad: 'BIMESTRAL', diaVencimiento: 20, mesAncla: 1 }, '2026-01-01', '2026-12-31')
    ).toEqual(['2026-01-20', '2026-03-20', '2026-05-20', '2026-07-20', '2026-09-20', '2026-11-20'])
  })

  test('bimestral con ancla en febrero cae en los meses pares', () => {
    expect(
      vencimientosEntre({ periodicidad: 'BIMESTRAL', diaVencimiento: 5, mesAncla: 2 }, '2026-01-01', '2026-06-30')
    ).toEqual(['2026-02-05', '2026-04-05', '2026-06-05'])
  })

  test('anual: una sola vez, en su mes', () => {
    expect(
      vencimientosEntre({ periodicidad: 'ANUAL', diaVencimiento: 30, mesAncla: 6 }, '2026-01-01', '2027-12-31')
    ).toEqual(['2026-06-30', '2027-06-30'])
  })

  test('trimestral cruzando el año', () => {
    expect(
      vencimientosEntre({ periodicidad: 'TRIMESTRAL', diaVencimiento: 10, mesAncla: 11 }, '2026-10-01', '2027-06-30')
    ).toEqual(['2026-11-10', '2027-02-10', '2027-05-10'])
  })

  test('sin mes ancla arranca en enero', () => {
    expect(
      vencimientosEntre({ periodicidad: 'SEMESTRAL', diaVencimiento: 1, mesAncla: null }, '2026-01-01', '2026-12-31')
    ).toEqual(['2026-01-01', '2026-07-01'])
  })

  test('rango invertido no devuelve nada', () => {
    expect(vencimientosEntre({ periodicidad: 'MENSUAL', diaVencimiento: 1 }, '2026-12-01', '2026-01-01')).toEqual([])
  })
})

describe('periodoDe', () => {
  test('agrupa por mes', () => expect(periodoDe('2026-09-24')).toBe('2026-09'))
})

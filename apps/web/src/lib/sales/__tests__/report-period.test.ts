import { describe, expect, test } from 'bun:test'
import { computeReportRange, formatRangeHuman } from '../report-period'

describe('computeReportRange', () => {
  test('DIARIA: devuelve día anterior', () => {
    const ref = new Date(2026, 4, 27) // 27/05/2026 (mes 0-indexed)
    expect(computeReportRange('DIARIA', ref)).toEqual({ from: '2026-05-26', to: '2026-05-26' })
  })

  test('DIARIA: cruzar mes', () => {
    const ref = new Date(2026, 4, 1) // 01/05/2026
    expect(computeReportRange('DIARIA', ref)).toEqual({ from: '2026-04-30', to: '2026-04-30' })
  })

  test('SEMANAL: semana anterior cerrada (refDate=miércoles)', () => {
    const ref = new Date(2026, 4, 27) // miércoles 27/05/2026
    // Semana anterior cerrada: lun 18 a dom 24
    expect(computeReportRange('SEMANAL', ref)).toEqual({ from: '2026-05-18', to: '2026-05-24' })
  })

  test('SEMANAL: refDate=lunes', () => {
    const ref = new Date(2026, 4, 25) // lunes 25/05/2026
    // Semana anterior cerrada: lun 18 a dom 24
    expect(computeReportRange('SEMANAL', ref)).toEqual({ from: '2026-05-18', to: '2026-05-24' })
  })

  test('SEMANAL: refDate=domingo', () => {
    const ref = new Date(2026, 4, 24) // domingo 24/05/2026
    // dow=7, ultimoDom = d - 7 = 17, primerLun = d - 13 = 11
    expect(computeReportRange('SEMANAL', ref)).toEqual({ from: '2026-05-11', to: '2026-05-17' })
  })

  test('MENSUAL: mes anterior completo', () => {
    const ref = new Date(2026, 4, 15)
    expect(computeReportRange('MENSUAL', ref)).toEqual({ from: '2026-04-01', to: '2026-04-30' })
  })

  test('MENSUAL: enero apunta a diciembre del año anterior', () => {
    const ref = new Date(2026, 0, 5)
    expect(computeReportRange('MENSUAL', ref)).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })

  test('MENSUAL: febrero bisiesto', () => {
    const ref = new Date(2024, 2, 10) // marzo/2024
    expect(computeReportRange('MENSUAL', ref)).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })
})

describe('formatRangeHuman', () => {
  test('mismo día', () => {
    expect(formatRangeHuman('2026-05-26', '2026-05-26')).toBe('26/05/2026')
  })
  test('rango', () => {
    expect(formatRangeHuman('2026-05-18', '2026-05-24')).toBe('18/05/2026 al 24/05/2026')
  })
})

import { describe, expect, test } from 'bun:test'
import { cierra, diagnosticar, mediana } from '../revision-lineas'

// Los números salen de comprobantes reales de producción; están acá para que
// un cambio en los umbrales no vuelva a dar por buena una línea rota ni rompa
// una sana.

describe('cantidad leída con el separador de miles', () => {
  test('SAL CELUSAL: 90.000 paquetes a $1,07 son 90 a $1.071', () => {
    const d = diagnosticar({ cantidad: 90000, precioUnitario: 1.07, subtotal: 96396.3 }, 1071.07)
    expect(d.diagnostico).toBe('cantidad_x1000')
    expect(d.cantidad).toBe(90)
    expect(d.precioUnitario).toBeCloseTo(1071.07, 1)
    expect(d.confianza).toBe('alta')
  })

  test('sin precio de referencia la confianza baja a media', () => {
    const d = diagnosticar({ cantidad: 2000, precioUnitario: 9.5, subtotal: 19003.3 }, null)
    expect(d.diagnostico).toBe('cantidad_x1000')
    expect(d.cantidad).toBe(2)
    expect(d.confianza).toBe('media')
  })

  test('si el precio guardado ya es el habitual, no se toca a ciegas', () => {
    // LECHE TREGAR: la cantidad vino x1000 pero el precio se leyó bien, así que
    // el precio corregido sería el mismo y no hay con qué confirmar.
    const d = diagnosticar({ cantidad: 96000, precioUnitario: 1652.07, subtotal: 158598.72 }, 1652.07)
    expect(d.confianza).toBe('baja')
  })

  test('una cantidad grande que no es múltiplo de mil pasa', () => {
    expect(diagnosticar({ cantidad: 1200, precioUnitario: 50, subtotal: 60000 }, 50).diagnostico).toBe('ok')
  })
})

describe('líneas que no cierran', () => {
  test('un descuento del 10% no se corrige y se separa del resto', () => {
    const d = diagnosticar({ cantidad: 2, precioUnitario: 19522.94, subtotal: 35141.64 }, 19522.94)
    expect(d.diagnostico).toBe('descuento_probable')
    expect(d.precioUnitario).toBeNull()
  })

  test('un descuento del 20% tampoco', () => {
    const d = diagnosticar({ cantidad: 5, precioUnitario: 1000, subtotal: 4000 }, 1000)
    expect(d.diagnostico).toBe('descuento_probable')
    expect(d.precioUnitario).toBeNull()
  })

  test('un recargo chico también cuenta como diferencia de factura', () => {
    // B CH LATITUD33: 4 x 5.327,87 da 21.311,48 y el subtotal dice 22.303,11
    const d = diagnosticar({ cantidad: 4, precioUnitario: 5327.87, subtotal: 22303.11 }, 5327.87)
    expect(d.diagnostico).toBe('descuento_probable')
  })

  test('un precio a 1/1000 del real sí: eso no es descuento', () => {
    const d = diagnosticar({ cantidad: 15.82, precioUnitario: 11.1, subtotal: 173322.9 }, 10955.94)
    expect(d.diagnostico).toBe('no_cierra')
    expect(d.precioUnitario).toBe(10955.94)
  })
})

describe('cierra', () => {
  test('tolera el redondeo del precio unitario', () => {
    expect(cierra({ cantidad: 90, precioUnitario: 1071.07, subtotal: 96398.3 })).toBe(true)
  })
  test('no tolera una diferencia real', () => {
    expect(cierra({ cantidad: 2, precioUnitario: 19522.94, subtotal: 35141.64 })).toBe(false)
  })
})

describe('mediana', () => {
  test('impar', () => expect(mediana([3, 1, 2])).toBe(2))
  test('par', () => expect(mediana([1, 2, 3, 4])).toBe(2.5))
  test('ignora los no positivos', () => expect(mediana([0, -5, 4])).toBe(4))
  test('vacía', () => expect(mediana([])).toBeNull())
})

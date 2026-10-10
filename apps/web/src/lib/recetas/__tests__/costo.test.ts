import { describe, expect, test } from 'bun:test'
import { cantidadBruta, costoDeReceta } from '../costo-calculo'

describe('cantidadBruta', () => {
  // El caso que motivó la merma: la receta dice 1,6 kg de bife para 8
  // porciones, pero del depósito salen 2 kg porque 0,400 se van en recorte.
  test('1,6 kg con 20% de merma son 2 kg del depósito', () => {
    expect(cantidadBruta(1.6, 20)).toBe(2)
  })
  test('sin merma no cambia nada', () => {
    expect(cantidadBruta(1.6, 0)).toBe(1.6)
    expect(cantidadBruta(1.6, null)).toBe(1.6)
    expect(cantidadBruta(1.6, undefined)).toBe(1.6)
  })
  test('una merma imposible no divide por cero', () => {
    expect(cantidadBruta(1.6, 100)).toBe(1.6)
    expect(cantidadBruta(1.6, 150)).toBe(1.6)
    expect(cantidadBruta(1.6, -5)).toBe(1.6)
  })
  test('30%', () => {
    expect(cantidadBruta(1.6, 30)).toBeCloseTo(2.2857, 4)
  })
})

describe('costoDeReceta', () => {
  const precios = new Map([['i1', 10000]]) // $10.000 el kg
  const bife = (mermaPct: number | null) => ({
    nombre: 'Bife',
    cantidad: 1.6,
    unidad: 'kg',
    insumoId: 'i1',
    insumo: { unidadBase: 'kg' },
    mermaPct,
  })

  test('aplica la merma: 1,6 kg netos cuestan 2 kg', () => {
    const r = costoDeReceta([bife(20)], precios)
    expect(r.total).toBe(20000)
    expect(r.porIngrediente['Bife']).toBe(20000)
    expect(r.costeados).toBe(1)
  })

  test('sin merma cuesta lo que dice la receta', () => {
    expect(costoDeReceta([bife(0)], precios).total).toBe(16000)
  })

  test('convierte la unidad y después aplica la merma', () => {
    // 200 g con 20% son 0,25 kg -> $2.500
    const r = costoDeReceta(
      [{ nombre: 'X', cantidad: 200, unidad: 'g', insumoId: 'i1', insumo: { unidadBase: 'kg' }, mermaPct: 20 }],
      precios
    )
    expect(r.total).toBeCloseTo(2500, 2)
  })

  test('dimensiones incompatibles siguen sin costearse, no se inventa un número', () => {
    const r = costoDeReceta(
      [{ nombre: 'Y', cantidad: 1, unidad: 'ml', insumoId: 'i1', insumo: { unidadBase: 'kg' }, mermaPct: 20 }],
      precios
    )
    expect(r.total).toBe(0)
    expect(r.faltantes).toContain('Y')
  })

  test('un ingrediente sin insumo vinculado se informa', () => {
    const r = costoDeReceta([{ nombre: 'Sal', cantidad: 10, unidad: 'g', insumoId: null }], precios)
    expect(r.faltantes).toEqual(['Sal'])
    expect(r.costeados).toBe(0)
  })
})

/**
 * Diagnóstico de líneas de comprobante con números mal leídos.
 *
 * El extractor lee el PDF y a veces se equivoca con el formato argentino. El
 * caso más frecuente y más dañino: la cantidad viene impresa con tres
 * decimales ("120,000" son 120 unidades) y se guarda como 120000, con lo cual
 * el precio unitario queda dividido por mil. Eso rompe tres cosas a la vez:
 * el stock (la cantidad entra x1000), el costo por insumo y el análisis de
 * precios, donde una compra de $945 aparece como $0,95 y la siguiente marca
 * +99.900%.
 *
 * Acá vive sólo la lógica, sin base ni red, para poder probarla sola.
 */

export type Diagnostico = 'cantidad_x1000' | 'no_cierra' | 'descuento_probable' | 'ok'
export type Confianza = 'alta' | 'media' | 'baja'

export interface LineaCruda {
  cantidad: number | null
  precioUnitario: number | null
  subtotal: number | null
}

export interface Propuesta {
  diagnostico: Diagnostico
  confianza: Confianza
  motivo: string
  cantidad: number | null
  precioUnitario: number | null
}

const redondear = (n: number, decimales = 2) => {
  const f = 10 ** decimales
  return Math.round(n * f) / f
}

/** ¿La línea cierra? cantidad x precio tiene que dar el subtotal. */
export function cierra(l: LineaCruda, tolerancia = 0.01): boolean {
  if (!l.cantidad || !l.precioUnitario || l.subtotal == null) return true
  const esperado = l.cantidad * l.precioUnitario
  return Math.abs(esperado - l.subtotal) <= Math.max(Math.abs(l.subtotal) * tolerancia, 1)
}

/**
 * Diagnostica una línea y, cuando se puede, propone la corrección.
 *
 * `referencia` es el precio típico del item (la mediana de sus compras sanas).
 * Es lo que permite pasar de "esto no cierra" a "esto es el error de los
 * miles": si al dividir la cantidad por mil el precio cae justo donde el item
 * siempre estuvo, no hay mucho más que discutir.
 */
export function diagnosticar(l: LineaCruda, referencia?: number | null): Propuesta {
  const { cantidad, precioUnitario, subtotal } = l

  if (!cantidad || cantidad <= 0 || !subtotal) {
    return { diagnostico: 'ok', confianza: 'baja', motivo: '', cantidad: null, precioUnitario: null }
  }

  // 1. Cantidad múltiplo exacto de mil: el patrón del separador de miles.
  //    Una factura de restaurante no trae 120.000 paquetes de sal.
  if (cantidad % 1000 === 0 && cantidad >= 1000) {
    const cantidadNueva = cantidad / 1000
    const precioNuevo = redondear(subtotal / cantidadNueva)
    const cerca = (a: number, b: number) => Math.abs(a - b) <= b * 0.5

    let confianza: Confianza = 'media'
    let motivo = `La cantidad es múltiplo exacto de mil: en el PDF dice "${cantidad.toLocaleString('es-AR')}" y son ${cantidadNueva.toLocaleString('es-AR')}.`

    if (referencia && referencia > 0) {
      if (cerca(precioNuevo, referencia) && !cerca(precioUnitario ?? 0, referencia)) {
        confianza = 'alta'
        motivo += ` Corregido, el precio queda en el orden del habitual de este item.`
      } else if (cerca(precioUnitario ?? 0, referencia)) {
        // El precio guardado ya coincide con el habitual: probablemente la
        // cantidad sea de verdad grande y no haya nada que corregir.
        confianza = 'baja'
        motivo = 'La cantidad es múltiplo de mil pero el precio ya coincide con el habitual del item: revisar antes de tocar.'
      }
    }

    return { diagnostico: 'cantidad_x1000', confianza, motivo, cantidad: cantidadNueva, precioUnitario: precioNuevo }
  }

  // 2. La línea no cierra. Puede ser un descuento legítimo o un número mal
  //    leído; sin mirar el PDF no se puede decidir, así que no se propone
  //    nada salvo que el precio recalculado caiga sobre la referencia.
  if (!cierra(l)) {
    const precioCalculado = redondear(subtotal / cantidad)
    const motivo = `No cierra: ${cantidad.toLocaleString('es-AR')} × ${(precioUnitario ?? 0).toLocaleString('es-AR')} da ${redondear(
      cantidad * (precioUnitario ?? 0)
    ).toLocaleString('es-AR')} y el subtotal dice ${subtotal.toLocaleString('es-AR')}.`

    // Un descuento de línea deja el precio guardado a un 10 o 20% del que sale
    // del subtotal, y eso no hay que tocarlo. Un número mal leído lo deja a un
    // factor de diez o de mil. Sólo se propone corregir en el segundo caso.
    const factor = precioUnitario && precioUnitario > 0 ? precioCalculado / precioUnitario : 0
    const esError = factor >= 5 || (factor > 0 && factor <= 0.2)
    const coincideConElHabitual =
      !referencia || referencia <= 0 || Math.abs(precioCalculado - referencia) <= referencia * 0.35

    // Diferencias chicas son descuentos, recargos o redondeos de la factura:
    // la línea no cierra pero no hay ningún número mal leído que corregir.
    if (factor >= 0.5 && factor <= 1.5) {
      return {
        diagnostico: 'descuento_probable',
        confianza: 'baja',
        motivo: `${motivo} La diferencia es de un ${Math.abs(Math.round((factor - 1) * 100))}%: parece un descuento o un recargo de la línea, no un número mal leído.`,
        cantidad: null,
        precioUnitario: null,
      }
    }

    if (esError && coincideConElHabitual) {
      return {
        diagnostico: 'no_cierra',
        confianza: referencia ? 'media' : 'baja',
        motivo: `${motivo} El precio guardado está a un factor de ${
          factor >= 5 ? Math.round(factor) : `1/${Math.round(1 / factor)}`
        } del que sale del subtotal: no es un descuento, es un número mal leído.`,
        cantidad: null,
        precioUnitario: precioCalculado,
      }
    }

    return {
      diagnostico: 'no_cierra',
      confianza: 'baja',
      motivo: `${motivo} Puede ser un descuento de la línea; conviene mirar el comprobante.`,
      cantidad: null,
      precioUnitario: null,
    }
  }

  return { diagnostico: 'ok', confianza: 'alta', motivo: '', cantidad: null, precioUnitario: null }
}

/** Mediana, para el precio de referencia de un item. */
export function mediana(xs: number[]): number | null {
  const ys = xs.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b)
  if (ys.length === 0) return null
  const m = Math.floor(ys.length / 2)
  return ys.length % 2 ? ys[m]! : (ys[m - 1]! + ys[m]!) / 2
}

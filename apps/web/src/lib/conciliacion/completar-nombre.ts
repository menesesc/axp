/**
 * Completar un nombre que Maxirest cortó.
 *
 * Los nombres de venta llegan recortados a lo que entra en la comanda:
 * "ALAMOS CABERNET S", "CHANDON EXTRA BRU", "ALA COLORADA TANN". En las
 * facturas de compra el producto aparece entero, pero con cosas que no
 * queremos en el nombre del insumo: el código del proveedor adelante
 * ("CZ ", "B CH "), la presentación ("6X750 ML", "CAJA X 6", "750CC") y la
 * añada ("2024").
 *
 * Así que no se adopta la descripción de la factura: se usa sólo para
 * terminar las palabras que quedaron cortadas, respetando el orden y el
 * resto del nombre tal como está. "ALAMOS CABERNET S" + "CZ ALAMOS CABERNET
 * SAUVIGNON 750CC 2024" da "ALAMOS CABERNET SAUVIGNON", y nada más.
 *
 * Sin base ni red, para poder probarlo solo.
 */

const sinTildes = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

/** Tokens de presentación y añada: no son parte del nombre del producto. */
function esRuido(token: string): boolean {
  const t = sinTildes(token)
  if (/^\d{4}$/.test(t) && Number(t) >= 1980 && Number(t) <= 2100) return true // añada
  if (/^\d+$/.test(t)) return true // cantidades sueltas: "6", "12"
  if (/^\d+X\d*$/.test(t) || /^X\d+$/.test(t)) return true // 6X750, X6
  if (/^\d+([.,]\d+)?(ML|CC|LT|L|CL|KG|GR|G|UN|U)$/.test(t)) return true // 750CC, 1.5LT
  if (/^(ML|CC|LT|LTS|L|CL|KG|GR|G|UN|UNI|U|CAJ|CAJA|CJ|PACK|BOTELLA|BOT|BLS|BOLSA|DOC)$/.test(t)) return true
  return false
}

/** Palabras del texto que pueden completar algo, ya sin ruido. */
function candidatas(descripcion: string): string[] {
  return descripcion
    .split(/[\s/()\-,.]+/)
    .filter(Boolean)
    .filter((t) => !esRuido(t))
    .map((t) => t.trim())
    .filter((t) => t.length > 1)
}

/**
 * Devuelve el nombre con las palabras cortadas terminadas, o null si no hay
 * nada que completar.
 *
 * Una palabra se completa cuando es prefijo estricto de alguna de la factura.
 * No se agregan palabras nuevas ni se cambia el orden: si Maxirest se comió
 * una palabra entera no hay forma de saber cuál era, y arriesgarla sería peor
 * que dejar el nombre como está.
 */
export function completarNombre(corto: string, descripcion: string): string | null {
  const palabras = corto.split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return null

  const opciones = candidatas(descripcion)
  if (opciones.length === 0) return null

  let cambio = false
  const completadas = palabras.map((p) => {
    const pn = sinTildes(p)
    // Una palabra corta en el medio es demasiado ambigua: la "S" de "FINCA S
    // MALBEC" sería prefijo de cualquier cosa. La última es la excepción,
    // porque es justo donde cae el corte y suele quedar en una sola letra.
    const esUltima = p === palabras[palabras.length - 1]
    if (pn.length < (esUltima ? 1 : 3)) return p

    const match = opciones.find((o) => {
      const on = sinTildes(o)
      if (on.length <= pn.length || !on.startsWith(pn)) return false
      // Lo que se agrega tiene que ser texto. "LATITUD" contra "LATITUD33" es
      // la misma palabra con el número pegado, no una palabra cortada.
      return /[A-Z]/.test(on.slice(pn.length))
    })
    if (!match) return p
    cambio = true
    // Se respeta cómo viene escrita la palabra en la factura, pero si el
    // nombre corto está en mayúsculas se mantiene así.
    return corto === corto.toUpperCase() ? match.toUpperCase() : match
  })

  if (!cambio) return null
  const nuevo = completadas.join(' ')
  return nuevo === corto ? null : nuevo
}

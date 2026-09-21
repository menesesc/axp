import { NextResponse } from 'next/server'

/**
 * Sanitizado de importes para usuarios "solo cantidades".
 *
 * Un usuario puede tener acceso a un módulo sin ver la plata: el ranking de
 * ventas en unidades, los documentos sin totales. El candado no puede vivir en
 * la UI (bastaría con abrir la API a mano), así que el payload se limpia acá,
 * en el servidor, antes de salir.
 *
 * Criterio: se ponen en 0 (o null, si ya lo eran) los valores numéricos cuya
 * clave sea de dinero. Los conteos se dejan intactos — `totalPages` o
 * `totalTickets` no son plata. Ante la duda se oculta: es preferible un 0 de
 * más que filtrar un importe.
 */

/** Claves que son dinero aunque no matcheen ningún prefijo obvio. */
const CLAVES_DINERO = new Set(
  [
    'importe',
    'importes',
    'importeTotal',
    'importeMesa',
    'monto',
    'montos',
    'montoPorMes',
    'precio',
    'precios',
    'precioUnitario',
    'precioPromedio',
    'costo',
    'costos',
    'saldo',
    'deuda',
    'subtotal',
    'iva',
    'ivaTotal',
    'neto',
    'netoGravado',
    'bruto',
    'gasto',
    'gastos',
    'total',
    'totalMonto',
    'totalImporte',
    'totalVentas',
    'totalFacturado',
    'totalNeto',
    'totalBruto',
    'totalPagado',
    'totalPendiente',
    'totalNotasCredito',
    'totalMes',
    'totalAnterior',
    'totalGasto',
    'totalDeuda',
    'ticketPromedio',
    'promedio',
    'promedioDiario',
    'promedioCubierto',
    'promedioPorTurno',
    'variacion',
    'facturado',
    'facturacion',
  ].map((k) => k.toLowerCase())
)

/** Conteos que empiezan con "total" pero no son plata. */
const CLAVES_CONTEO = new Set(
  ['totalPages', 'totalTickets', 'totalFacturas', 'totalItems', 'totalCount', 'totalRegistros', 'totalDocumentos', 'totalUnidades'].map(
    (k) => k.toLowerCase()
  )
)

const PREFIJOS_DINERO = ['importe', 'monto', 'precio', 'costo', 'saldo', 'deuda', 'gasto', 'facturad']

/** ¿La clave nombra un valor en pesos? */
export function esClaveDinero(clave: string): boolean {
  const k = clave.toLowerCase()
  if (CLAVES_CONTEO.has(k)) return false
  if (CLAVES_DINERO.has(k)) return true
  if (PREFIJOS_DINERO.some((p) => k.startsWith(p))) return true
  // Convención del ranking por turno: ALMUERZO_i / CENA_i son los importes.
  if (k.endsWith('_i')) return true
  return false
}

/**
 * Devuelve una copia del payload con los importes neutralizados.
 * Recorre objetos y arrays; deja intactos strings, fechas y conteos.
 */
export function stripImportes<T>(data: T): T {
  return limpiar(data, false) as T
}

function limpiar(valor: unknown, heredaDinero: boolean): unknown {
  if (Array.isArray(valor)) {
    return valor.map((v) => limpiar(v, heredaDinero))
  }

  if (valor && typeof valor === 'object') {
    if (valor instanceof Date) return valor
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      out[k] = limpiar(v, esClaveDinero(k))
    }
    return out
  }

  if (!heredaDinero) return valor
  if (typeof valor === 'number') return 0
  // Decimal de Prisma serializado como string numérico.
  if (typeof valor === 'string' && valor !== '' && !Number.isNaN(Number(valor))) return '0'
  return valor
}

/**
 * Respuesta JSON que respeta el permiso de importes del usuario.
 *
 *   const { clienteId, verImportes, error } = await requireModulo(MODULO.VENTAS)
 *   ...
 *   return jsonImportes({ ranking, total }, verImportes)
 */
export function jsonImportes<T>(data: T, verImportes: boolean, init?: ResponseInit) {
  return NextResponse.json(verImportes ? data : stripImportes(data), init)
}

/**
 * Variante currificada, cómoda cuando una ruta responde en varios puntos:
 *
 *   const json = importesJson(verImportes)
 *   return json({ items, total })
 */
export function importesJson(verImportes: boolean) {
  return <T>(data: T, init?: ResponseInit) => jsonImportes(data, verImportes, init)
}

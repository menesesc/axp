import * as XLSX from 'xlsx'

/**
 * Archivo de transferencias masivas para Banco Galicia (Office Banking).
 *
 * Mismo formato que el de sueldos de Presentia, ajustado a las instrucciones
 * de la plantilla oficial (Plantilla-Galicia.xls): XLS 97-2003 (biff8), hoja
 * "Formulario", encabezados EXACTOS (con los espacios finales de la columna
 * CBU), máximo 50 pagos por archivo y descripción de hasta 12 caracteres. Para
 * pagos a proveedores el concepto es "Factura".
 */

export const GALICIA_FILAS_POR_ARCHIVO = 50
export const GALICIA_MAX_DESCRIPCION = 12

export interface GaliciaFila {
  cbu: string
  monto: number
  descripcion: string
}

const COL_CBU = 'CBU/CVU/Alias/Nro cuenta            '
const COL_MONTO = 'Monto'
const COL_CONCEPTO = 'Concepto'
const COL_DESC = 'Descripción\n(opcional)'
const COL_EMAIL = 'Email destinatario\n(opcional)'
const COL_MSG = 'Mensaje del email\n(opcional)'

export const GALICIA_CONCEPTO = 'Factura'

export function cantidadPartes(filas: number): number {
  return Math.max(1, Math.ceil(filas / GALICIA_FILAS_POR_ARCHIVO))
}

/** Genera la parte `parte` (1-based) del archivo. */
export function generarGaliciaXls(filas: GaliciaFila[], parte = 1): Buffer {
  const desde = (parte - 1) * GALICIA_FILAS_POR_ARCHIVO
  const lote = filas.slice(desde, desde + GALICIA_FILAS_POR_ARCHIVO)

  const aoa: Array<Array<string | number>> = [
    [COL_CBU, COL_MONTO, COL_CONCEPTO, COL_DESC, COL_EMAIL, COL_MSG],
    ...lote.map((f) => [
      f.cbu,
      Math.round(f.monto * 100) / 100,
      GALICIA_CONCEPTO,
      f.descripcion.substring(0, GALICIA_MAX_DESCRIPCION),
      '',
      '',
    ]),
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  // El CBU tiene que quedar como texto: como número pierde los ceros iniciales
  // (los CVU empiezan con 0000003…) y la precisión pasados los 15 dígitos.
  for (let r = 1; r <= lote.length; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: 0 })
    const cell = ws[addr]
    if (cell) {
      cell.t = 's'
      cell.v = String(cell.v)
    }
  }
  ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 35 }, { wch: 30 }, { wch: 25 }, { wch: 25 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Formulario')
  return XLSX.write(wb, { type: 'buffer', bookType: 'biff8' }) as Buffer
}

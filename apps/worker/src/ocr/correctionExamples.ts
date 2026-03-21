/**
 * Módulo de learning: obtiene correcciones previas del usuario
 * para inyectar como few-shot examples en el prompt de OCR.
 *
 * Esto permite que Claude aprenda de los errores corregidos
 * por el usuario para cada cliente específico.
 */

import { prisma } from '../lib/prisma'

export interface CorrectionExample {
  field: string
  ocrValue: string
  correctValue: string
  proveedorNombre: string | null
  documentType: string
  text: string // Texto formateado para el prompt
}

interface RawCorrection {
  path: string
  before: unknown
  after: unknown
  tipo: string
  razonSocial: string | null
}

/**
 * Obtiene las últimas correcciones de un cliente para inyectar en el prompt.
 * Agrupa correcciones repetidas para darles mayor prominencia.
 */
export async function fetchCorrectionExamples(
  clienteId: string,
  limit: number = 20,
): Promise<CorrectionExample[]> {
  try {
    const rawCorrections = await prisma.$queryRaw<RawCorrection[]>`
      SELECT
        dr.path,
        dr.before,
        dr.after,
        d.tipo,
        p."razonSocial"
      FROM documento_revisiones dr
      JOIN documentos d ON dr."documentoId" = d.id
      LEFT JOIN proveedores p ON d."proveedorId" = p.id
      WHERE d."clienteId" = ${clienteId}::uuid
        AND dr.accion = 'SET_FIELD'
        AND dr."createdAt" > NOW() - INTERVAL '90 days'
        AND dr.before IS NOT NULL
        AND dr.after IS NOT NULL
      ORDER BY dr."createdAt" DESC
      LIMIT ${limit}
    `

    if (rawCorrections.length === 0) return []

    // Agrupar correcciones repetidas (mismo campo + mismo valor correcto)
    const grouped = new Map<string, { count: number; correction: RawCorrection }>()

    for (const correction of rawCorrections) {
      const key = `${correction.path}:${String(correction.after)}`
      const existing = grouped.get(key)
      if (existing) {
        existing.count++
      } else {
        grouped.set(key, { count: 1, correction })
      }
    }

    // Ordenar: correcciones más frecuentes primero
    const sorted = Array.from(grouped.values()).sort((a, b) => b.count - a.count)

    return sorted.slice(0, 15).map(({ count, correction }) => {
      const provInfo = correction.razonSocial ? ` de "${correction.razonSocial}"` : ''
      const frequency = count > 1 ? ` (corregido ${count} veces)` : ''
      const text = `En una ${correction.tipo}${provInfo}, el campo "${correction.path}" tenía "${formatValue(correction.before)}" pero el valor correcto era "${formatValue(correction.after)}"${frequency}`

      return {
        field: correction.path,
        ocrValue: formatValue(correction.before),
        correctValue: formatValue(correction.after),
        proveedorNombre: correction.razonSocial,
        documentType: correction.tipo,
        text,
      }
    })
  } catch (error) {
    // No bloquear el procesamiento si falla la consulta de correcciones
    console.error('Error fetching correction examples:', error)
    return []
  }
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return 'null'
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

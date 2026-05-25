import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId } from '@/lib/auth'
import { reparseClosure } from '@/lib/sales/maxirest-ingest'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/sales/closures/[id]/reparse
 *
 * Re-parsea un cierre usando su rawText guardado y reemplaza todas las hijas.
 * Útil para aplicar mejoras del parser a cierres viejos sin reenviar PDFs.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  // Verificar que el cierre pertenezca al cliente
  const closure = await prisma.sales_closures.findFirst({
    where: { id: params.id, clienteId: clienteId! },
    select: { id: true },
  })
  if (!closure) {
    return NextResponse.json({ error: 'Cierre no encontrado' }, { status: 404 })
  }

  const result = await reparseClosure(closure.id)
  const httpStatus = result.status === 'OK' ? 200 : 400
  return NextResponse.json(result, { status: httpStatus })
}

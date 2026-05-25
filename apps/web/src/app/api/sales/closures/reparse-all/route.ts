import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId } from '@/lib/auth'
import { reparseClosure } from '@/lib/sales/maxirest-ingest'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min para procesar muchos cierres

/**
 * POST /api/sales/closures/reparse-all
 *
 * Re-parsea todos los cierres del cliente del usuario que tengan rawText.
 * Útil cuando se mejora el parser (ej. se agrega auditoría) para actualizar
 * todos los cierres viejos de una sola vez.
 *
 * Solo admins (tipo_acceso === 'ADMIN').
 */
export async function POST() {
  const { clienteId, user, error } = await requireClienteId()
  if (error) return error
  if (user?.tipo_acceso !== 'ADMIN') {
    return NextResponse.json({ error: 'Requiere rol admin' }, { status: 403 })
  }

  const closures = await prisma.sales_closures.findMany({
    where: { clienteId: clienteId!, rawText: { not: null } },
    select: { id: true, nroCierre: true, fecha: true },
    orderBy: { fecha: 'asc' },
  })

  const results: Array<{ id: string; nroCierre: number; status: string; message: string }> = []
  let ok = 0
  let failed = 0

  for (const c of closures) {
    try {
      const r = await reparseClosure(c.id)
      results.push({
        id: c.id,
        nroCierre: c.nroCierre,
        status: r.status,
        message: r.message,
      })
      if (r.status === 'OK') ok++
      else failed++
    } catch (err) {
      failed++
      results.push({
        id: c.id,
        nroCierre: c.nroCierre,
        status: 'ERROR',
        message: (err as Error).message,
      })
    }
  }

  return NextResponse.json({
    total: closures.length,
    ok,
    failed,
    results,
  })
}

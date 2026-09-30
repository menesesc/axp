import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { getDepositos } from '@/lib/stock/depositos'

export const dynamic = 'force-dynamic'

/** Datos de apoyo de la pantalla de pedidos: depósitos, insumos y plantillas. */
export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_PEDIDOS)
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const [depositos, insumos, plantillas] = await Promise.all([
    getDepositos(clienteId, true),
    prisma.insumos.findMany({
      where: { clienteId, activo: true },
      select: { id: true, nombre: true, unidadBase: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.pedido_plantillas.findMany({
      where: { clienteId },
      orderBy: { nombre: 'asc' },
      include: { items: { include: { insumo: { select: { nombre: true, unidadBase: true } } } } },
    }),
  ])

  return NextResponse.json({
    depositos,
    insumos,
    plantillas: plantillas.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      destinoId: p.destinoId,
      items: p.items
        .map((it) => ({ insumoId: it.insumoId, nombre: it.insumo.nombre, unidad: it.insumo.unidadBase, cantidad: Number(it.cantidad) }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    })),
  })
}

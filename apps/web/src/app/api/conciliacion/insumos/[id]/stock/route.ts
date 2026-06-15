import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId, requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function getInsumo(insumoId: string, clienteId: string) {
  return prisma.insumos.findFirst({
    where: { id: insumoId, clienteId },
    select: { id: true, nombre: true, unidadBase: true },
  })
}

/** Conteos físicos de stock del insumo, en su unidadBase, ordenados por fecha. */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  const insumo = await getInsumo(params.id, clienteId!)
  if (!insumo) return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 })

  const stock = await prisma.insumo_stock.findMany({
    where: { insumoId: params.id },
    orderBy: { fecha: 'desc' },
  })

  return NextResponse.json({
    insumo,
    stock: stock.map((s) => ({
      id: s.id,
      fecha: s.fecha.toISOString().slice(0, 10),
      cantidad: Number(s.cantidad),
      nota: s.nota,
    })),
  })
}

/** Registra un conteo de stock (fecha, cantidad en unidadBase, nota?). Solo admin. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const clienteId = user!.clienteId
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  if (!(await getInsumo(params.id, clienteId))) {
    return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const fecha = String(body.fecha || '').trim()
  const cantidad = Number(body.cantidad)
  const nota = body.nota ? String(body.nota).trim() : null

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Fecha inválida (YYYY-MM-DD)' }, { status: 400 })
  }
  if (!Number.isFinite(cantidad) || cantidad < 0) {
    return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 })
  }

  try {
    const stock = await prisma.insumo_stock.upsert({
      where: { insumoId_fecha: { insumoId: params.id, fecha: new Date(fecha) } },
      create: { insumoId: params.id, fecha: new Date(fecha), cantidad, nota },
      update: { cantidad, nota },
    })
    return NextResponse.json({ stock }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'No se pudo guardar el conteo' }, { status: 500 })
  }
}

/** Borra un conteo (?stockId=). Solo admin. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const clienteId = user!.clienteId
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  if (!(await getInsumo(params.id, clienteId))) {
    return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 })
  }

  const stockId = request.nextUrl.searchParams.get('stockId')
  if (!stockId) return NextResponse.json({ error: 'Falta stockId' }, { status: 400 })

  await prisma.insumo_stock.deleteMany({ where: { id: stockId, insumoId: params.id } })
  return NextResponse.json({ ok: true })
}

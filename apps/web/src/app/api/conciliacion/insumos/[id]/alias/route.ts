import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId, requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function ownsInsumo(insumoId: string, clienteId: string) {
  return prisma.insumos.findFirst({ where: { id: insumoId, clienteId }, select: { id: true } })
}

/** Lista los alias de un insumo. */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  if (!(await ownsInsumo(params.id, clienteId!))) {
    return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 })
  }

  const alias = await prisma.insumo_alias.findMany({
    where: { insumoId: params.id },
    orderBy: { patron: 'asc' },
  })
  return NextResponse.json({
    alias: alias.map((a) => ({
      id: a.id,
      patron: a.patron,
      factorBase: Number(a.factorBase),
      unidadOrigen: a.unidadOrigen,
    })),
  })
}

/** Crea un alias para el insumo. Solo admin. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const clienteId = user!.clienteId
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  if (!(await ownsInsumo(params.id, clienteId))) {
    return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const patron = String(body.patron || '').trim()
  const factorBase = body.factorBase != null ? Number(body.factorBase) : 1
  const unidadOrigen = body.unidadOrigen ? String(body.unidadOrigen).trim() : null

  if (!patron) return NextResponse.json({ error: 'El patrón es obligatorio' }, { status: 400 })
  if (!Number.isFinite(factorBase) || factorBase <= 0) {
    return NextResponse.json({ error: 'factorBase debe ser un número mayor a 0' }, { status: 400 })
  }

  try {
    const alias = await prisma.insumo_alias.create({
      data: { insumoId: params.id, patron, factorBase, unidadOrigen },
    })
    return NextResponse.json({ alias }, { status: 201 })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Ese patrón ya existe para este insumo' }, { status: 409 })
    }
    throw e
  }
}

/** Borra un alias (?aliasId=). Solo admin. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const clienteId = user!.clienteId
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  if (!(await ownsInsumo(params.id, clienteId))) {
    return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 })
  }

  const aliasId = request.nextUrl.searchParams.get('aliasId')
  if (!aliasId) return NextResponse.json({ error: 'Falta aliasId' }, { status: 400 })

  await prisma.insumo_alias.deleteMany({ where: { id: aliasId, insumoId: params.id } })
  return NextResponse.json({ ok: true })
}

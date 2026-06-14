import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId, requireAdmin } from '@/lib/auth'
import { UNIDADES } from '@/lib/conciliacion/units'

export const dynamic = 'force-dynamic'

/** Lista de insumos del cliente con conteo de alias y de recetas que los usan. */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  const sp = request.nextUrl.searchParams
  const q = (sp.get('q') || '').trim()
  const activoParam = sp.get('activo')

  const insumos = await prisma.insumos.findMany({
    where: {
      clienteId: clienteId!,
      ...(activoParam === 'true' ? { activo: true } : activoParam === 'false' ? { activo: false } : {}),
      ...(q ? { nombre: { contains: q, mode: 'insensitive' } } : {}),
    },
    orderBy: { nombre: 'asc' },
    include: { _count: { select: { alias: true, recipeItems: true } } },
  })

  return NextResponse.json({
    insumos: insumos.map((i) => ({
      id: i.id,
      nombre: i.nombre,
      unidadBase: i.unidadBase,
      categoria: i.categoria,
      activo: i.activo,
      notas: i.notas,
      aliasCount: i._count.alias,
      recetasCount: i._count.recipeItems,
    })),
  })
}

/** Crea un insumo. Solo admin. */
export async function POST(request: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const clienteId = user!.clienteId
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const nombre = String(body.nombre || '').trim()
  const unidadBase = String(body.unidadBase || '').trim()
  const categoria = body.categoria ? String(body.categoria).trim() : null
  const notas = body.notas ? String(body.notas).trim() : null

  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  if (!UNIDADES.includes(unidadBase as never)) {
    return NextResponse.json(
      { error: `unidadBase debe ser una de: ${UNIDADES.join(', ')}` },
      { status: 400 }
    )
  }

  try {
    const insumo = await prisma.insumos.create({
      data: { clienteId, nombre, unidadBase, categoria, notas },
    })
    return NextResponse.json({ insumo }, { status: 201 })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe un insumo con ese nombre' }, { status: 409 })
    }
    throw e
  }
}

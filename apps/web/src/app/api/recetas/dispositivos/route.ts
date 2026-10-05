import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/** Dispositivos (equipamiento de cocina), con cuántas recetas usan cada uno. */
export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO)
  if (error) return error

  const dispositivos = await prisma.dispositivos.findMany({
    where: { clienteId: clienteId!, activo: true },
    orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    include: { _count: { select: { recetas: true } } },
  })
  return NextResponse.json({
    dispositivos: dispositivos.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      emoji: c.emoji,
      orden: c.orden,
      recetas: c._count.recetas,
    })),
  })
}

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error
  const b = await request.json().catch(() => null)
  const nombre = String(b?.nombre || '').trim()
  if (!nombre) return NextResponse.json({ error: 'Poné un nombre' }, { status: 400 })

  const existe = await prisma.dispositivos.findFirst({ where: { clienteId: clienteId!, nombre } })
  if (existe) return NextResponse.json({ error: 'Ya hay un dispositivo con ese nombre' }, { status: 409 })

  const ultima = await prisma.dispositivos.findFirst({
    where: { clienteId: clienteId! },
    orderBy: { orden: 'desc' },
    select: { orden: true },
  })
  const dispositivo = await prisma.dispositivos.create({
    data: {
      clienteId: clienteId!,
      nombre: nombre.slice(0, 80),
      emoji: typeof b.emoji === 'string' ? b.emoji.slice(0, 16) : null,
      orden: (ultima?.orden ?? 0) + 10,
    },
  })
  return NextResponse.json({ dispositivo })
}

/** Edita o da de baja un dispositivo. Dar de baja no lo borra de las recetas
 *  que ya lo usan: solo deja de ofrecerse al cargar nuevas. */
export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error
  const b = await request.json().catch(() => null)
  const id = String(b?.id || '')
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  const existe = await prisma.dispositivos.findFirst({ where: { id, clienteId: clienteId! } })
  if (!existe) return NextResponse.json({ error: 'Dispositivo no encontrado' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (typeof b.nombre === 'string' && b.nombre.trim()) data.nombre = b.nombre.trim().slice(0, 80)
  if (typeof b.emoji === 'string') data.emoji = b.emoji.slice(0, 16) || null
  if (typeof b.orden === 'number') data.orden = Math.round(b.orden)
  if (typeof b.activo === 'boolean') data.activo = b.activo

  await prisma.dispositivos.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
}

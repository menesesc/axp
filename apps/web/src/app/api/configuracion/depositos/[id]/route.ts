import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/** Edita un depósito. Body: { nombre?, esCentral?: true, activo? } */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { clienteId, error } = await requireSeccion(SECCION.CONFIGURACION, 'edit')
  if (error) return error
  const dep = await prisma.depositos.findFirst({ where: { id: params.id, clienteId: clienteId! } })
  if (!dep) return NextResponse.json({ error: 'Depósito no encontrado' }, { status: 404 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  const data: { nombre?: string; activo?: boolean } = {}
  if (body.nombre !== undefined) {
    const nombre = String(body.nombre).trim().slice(0, 60)
    if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    data.nombre = nombre
  }
  if (body.activo !== undefined) {
    if (dep.esCentral && body.activo === false) {
      return NextResponse.json({ error: 'No se puede desactivar el depósito central' }, { status: 400 })
    }
    data.activo = !!body.activo
  }

  try {
    await prisma.$transaction([
      // Un solo central: primero se desmarca el actual (índice único parcial).
      ...(body.esCentral === true && !dep.esCentral
        ? [
            prisma.depositos.updateMany({ where: { clienteId: clienteId!, esCentral: true }, data: { esCentral: false } }),
            prisma.depositos.update({ where: { id: dep.id }, data: { esCentral: true, activo: true } }),
          ]
        : []),
      prisma.depositos.update({ where: { id: dep.id }, data }),
    ])
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: 'Ya existe un depósito con ese nombre' }, { status: 409 })
    throw e
  }
  return NextResponse.json({ ok: true })
}

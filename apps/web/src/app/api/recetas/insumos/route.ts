import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { sugerirInsumos } from '@/lib/recetas/insumos'

export const dynamic = 'force-dynamic'

/** Catálogo de insumos, para el selector del editor. */
export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error

  const insumos = await prisma.insumos.findMany({
    where: { clienteId: clienteId!, activo: true },
    select: { id: true, nombre: true, unidadBase: true },
    orderBy: { nombre: 'asc' },
  })
  return NextResponse.json({ insumos })
}

/**
 * Sugiere un insumo para cada ingrediente.
 *
 * `conIA: false` usa solo la comparación local, que es instantánea y gratis.
 * Con IA se resuelven las que la local no pudo, que es donde está el trabajo
 * aburrido. Nada se guarda acá: son sugerencias y el usuario confirma.
 */
export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error

  const body = await request.json().catch(() => null)
  const nombres: string[] = Array.isArray(body?.nombres)
    ? body.nombres.filter((n: unknown) => typeof n === 'string' && n.trim()).slice(0, 80)
    : []
  if (nombres.length === 0) return NextResponse.json({ sugerencias: [] })

  const sugerencias = await sugerirInsumos(clienteId!, nombres, body?.conIA !== false)
  return NextResponse.json({ sugerencias })
}

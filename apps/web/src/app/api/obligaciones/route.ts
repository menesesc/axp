import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { MESES_DE, type Periodicidad } from '@/lib/finanzas/obligaciones'

export const dynamic = 'force-dynamic'

/**
 * Obligaciones periódicas: lo que vence todos los meses y no llega como
 * factura de mercadería (ARCA, Rentas, UTHGRA, la luz, el gas).
 *
 * Todo con SQL crudo: la tabla es nueva y el cliente Prisma desplegado no la
 * conoce.
 */

const RUBROS = ['SERVICIO', 'IMPUESTO', 'OTRO']

interface Fila {
  id: string
  nombre: string
  rubro: string
  periodicidad: string
  diaVencimiento: number
  mesAncla: number | null
  montoEstimado: number | null
  activa: boolean
  notas: string | null
  proveedorId: string | null
  proveedor: string | null
  logoKey: string | null
}

export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.FINANZAS_CALENDARIO)
  if (error) return error

  const obligaciones = await prisma.$queryRaw<Fila[]>`
    SELECT o.id, o.nombre, o.rubro, o.periodicidad,
           o."diaVencimiento", o."mesAncla",
           o."montoEstimado"::float8 AS "montoEstimado",
           o.activa, o.notas,
           o."proveedorId", p."razonSocial" AS proveedor, p."logoKey" AS "logoKey"
      FROM obligaciones o
      LEFT JOIN proveedores p ON p.id = o."proveedorId"
     WHERE o."clienteId" = ${clienteId}::uuid
     ORDER BY o.activa DESC, o."diaVencimiento", o.nombre
  `
  return NextResponse.json({ obligaciones })
}

interface Cuerpo {
  id?: string
  nombre?: string
  rubro?: string
  periodicidad?: string
  diaVencimiento?: number
  mesAncla?: number | null
  montoEstimado?: number | null
  proveedorId?: string | null
  notas?: string | null
  activa?: boolean
}

function validar(b: Cuerpo): string | null {
  if (!b.nombre?.trim()) return 'Poné un nombre'
  if (!b.rubro || !RUBROS.includes(b.rubro)) return 'Rubro inválido'
  if (!b.periodicidad || !(b.periodicidad in MESES_DE)) return 'Periodicidad inválida'
  const dia = Number(b.diaVencimiento)
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return 'El día de vencimiento va de 1 a 31'
  if (b.mesAncla != null && (b.mesAncla < 1 || b.mesAncla > 12)) return 'Mes inválido'
  return null
}

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.FINANZAS_CALENDARIO, 'edit')
  if (error) return error

  const b = (await request.json()) as Cuerpo
  const mal = validar(b)
  if (mal) return NextResponse.json({ error: mal }, { status: 400 })

  // Sólo las que no son mensuales usan el mes ancla.
  const ancla = (b.periodicidad as Periodicidad) === 'MENSUAL' ? null : (b.mesAncla ?? 1)

  const [fila] = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO obligaciones
      ("clienteId", "proveedorId", nombre, rubro, periodicidad, "diaVencimiento", "mesAncla", "montoEstimado", notas)
    VALUES (${clienteId}::uuid, ${b.proveedorId || null}::uuid, ${b.nombre!.trim()}, ${b.rubro},
            ${b.periodicidad}, ${Number(b.diaVencimiento)}, ${ancla},
            ${b.montoEstimado ?? null}, ${b.notas?.trim() || null})
    RETURNING id
  `
  return NextResponse.json({ id: fila?.id })
}

export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.FINANZAS_CALENDARIO, 'edit')
  if (error) return error

  const b = (await request.json()) as Cuerpo
  if (!b.id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  // Activar o desactivar es su propio caso: no exige mandar todo el resto.
  if (b.activa !== undefined && b.nombre === undefined) {
    await prisma.$executeRaw`
      UPDATE obligaciones SET activa = ${b.activa}, "updatedAt" = now()
       WHERE id = ${b.id}::uuid AND "clienteId" = ${clienteId}::uuid
    `
    return NextResponse.json({ ok: true })
  }

  const mal = validar(b)
  if (mal) return NextResponse.json({ error: mal }, { status: 400 })
  const ancla = (b.periodicidad as Periodicidad) === 'MENSUAL' ? null : (b.mesAncla ?? 1)

  await prisma.$executeRaw`
    UPDATE obligaciones
       SET "proveedorId" = ${b.proveedorId || null}::uuid,
           nombre = ${b.nombre!.trim()},
           rubro = ${b.rubro},
           periodicidad = ${b.periodicidad},
           "diaVencimiento" = ${Number(b.diaVencimiento)},
           "mesAncla" = ${ancla},
           "montoEstimado" = ${b.montoEstimado ?? null},
           notas = ${b.notas?.trim() || null},
           activa = ${b.activa ?? true},
           "updatedAt" = now()
     WHERE id = ${b.id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.FINANZAS_CALENDARIO, 'edit')
  if (error) return error

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  await prisma.$executeRaw`
    DELETE FROM obligaciones WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  return NextResponse.json({ ok: true })
}

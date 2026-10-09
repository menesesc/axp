import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { importesJson } from '@/lib/importes'
import { cbusDelCliente, guardarCbu, parseCbuInput } from '@/lib/proveedores/cbu'
import { contactosDesde } from '@/lib/proveedores/contactos'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Verificar autenticación
    const { clienteId, verImportes, error } = await requireSeccion(SECCION.DOC_PROVEEDORES)
    if (error) return error
    const json = importesJson(verImportes)


    if (!clienteId) {
      return json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      )
    }

    // `q` y `limit` los usa el buscador global (⌘K), que pide pocos y
    // filtrados; sin ellos devuelve el listado completo como siempre.
    const sp = request.nextUrl.searchParams
    const q = (sp.get('q') || '').trim()
    const limitParam = Number(sp.get('limit'))
    const limit = limitParam > 0 ? Math.min(limitParam, 50) : undefined

    const proveedores = await prisma.proveedores.findMany({
      where: {
        clienteId,
        ...(q
          ? {
              OR: [
                { razonSocial: { contains: q, mode: 'insensitive' as const } },
                { cuit: { contains: q.replace(/\D/g, '') || q } },
              ],
            }
          : {}),
      },
      orderBy: {
        razonSocial: 'asc',
      },
      ...(limit ? { take: limit } : {}),
      include: {
        _count: {
          select: {
            documentos: true,
          },
        },
      },
    })

    const cbus = await cbusDelCliente(clienteId)

    // logoKey y rubro son columnas nuevas: el cliente Prisma desplegado no las
    // conoce, así que se leen aparte con SQL y se cruzan por id.
    const extra = await prisma.$queryRaw<Array<{ id: string; conLogo: boolean; rubro: string }>>`
      SELECT id, ("logoKey" IS NOT NULL) AS "conLogo", rubro
        FROM proveedores WHERE "clienteId" = ${clienteId}::uuid
    `
    const porId = new Map(extra.map((r) => [r.id, r]))

    return json({
      proveedores: proveedores.map((p) => ({
        ...p,
        cbu: cbus.get(p.id) ?? null,
        conLogo: porId.get(p.id)?.conLogo ?? false,
        rubro: porId.get(p.id)?.rubro ?? 'MERCADERIA',
        documentosCount: p._count.documentos,
      })),
    })
  } catch (error) {
    console.error('Error en GET /api/proveedores:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    // Requiere permisos de administrador
    const { clienteId, error } = await requireSeccion(SECCION.DOC_PROVEEDORES, 'edit')
    if (error) return error


    if (!clienteId) {
      return NextResponse.json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { razonSocial, cuit, letra, alias, email } = body
    const contactos = contactosDesde(body)
    const cbuIn = parseCbuInput(body.cbu)
    if (cbuIn.error) {
      return NextResponse.json({ error: cbuIn.error }, { status: 400 })
    }

    // Validaciones
    if (!razonSocial || razonSocial.trim().length === 0) {
      return NextResponse.json(
        { error: 'La razón social es requerida' },
        { status: 400 }
      )
    }

    if (cuit && !/^\d{11}$/.test(cuit.replace(/-/g, ''))) {
      return NextResponse.json(
        { error: 'El CUIT debe tener 11 dígitos' },
        { status: 400 }
      )
    }

    // Verificar duplicados
    const existing = await prisma.proveedores.findFirst({
      where: {
        clienteId,
        OR: [
          cuit ? { cuit: cuit.replace(/-/g, '') } : {},
          { razonSocial: { equals: razonSocial.trim(), mode: 'insensitive' } },
        ],
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe un proveedor con ese CUIT o razón social' },
        { status: 409 }
      )
    }

    // Crear proveedor
    const proveedor = await prisma.proveedores.create({
      data: {
        id: crypto.randomUUID(),
        clienteId,
        razonSocial: razonSocial.trim(),
        cuit: cuit ? cuit.replace(/-/g, '') : null,
        letra: letra || null,
        alias: alias || [],
        email: email || null,
        ...contactos,
        updatedAt: new Date(),
      },
    })

    if (cbuIn.cbu) await guardarCbu(clienteId, proveedor.id, cbuIn.cbu)

    return NextResponse.json({ proveedor: { ...proveedor, cbu: cbuIn.cbu ?? null } }, { status: 201 })
  } catch (error) {
    console.error('Error en POST /api/proveedores:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { importesJson } from '@/lib/importes'
import { hoyAR, sumarDias } from '@/lib/fechas'

export const dynamic = 'force-dynamic'

/**
 * Pedidos a proveedores recientes (60 días). Un pedido 'enviado' se muestra
 * como recibido si ya llegó una factura del proveedor posterior al pedido.
 */
export async function GET() {
  const { clienteId, verImportes, error } = await requireSeccion(SECCION.CONCILIACION_COMPRAS)
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const pedidos = await prisma.pedidos_proveedor.findMany({
    where: { clienteId, fecha: { gte: new Date(sumarDias(hoyAR(), -60)) } },
    include: {
      proveedores: { select: { razonSocial: true } },
      items: { include: { insumo: { select: { unidadBase: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  // Facturas del proveedor cargadas después de cada pedido.
  const conFactura = new Set<string>()
  for (const p of pedidos.filter((x) => x.estado === 'enviado')) {
    const f = await prisma.documentos.findFirst({
      where: { clienteId, proveedorId: p.proveedorId, fechaEmision: { gte: p.fecha }, createdAt: { gte: p.createdAt } },
      select: { id: true },
    })
    if (f) conFactura.add(p.id)
  }

  return importesJson(verImportes)({
    pedidos: pedidos.map((p) => ({
      id: p.id,
      numero: p.numero,
      proveedorId: p.proveedorId,
      proveedor: p.proveedores.razonSocial,
      estado: p.estado === 'enviado' && conFactura.has(p.id) ? 'facturado' : p.estado,
      fecha: p.fecha.toISOString().slice(0, 10),
      fechaEsperada: p.fechaEsperada?.toISOString().slice(0, 10) ?? null,
      nota: p.nota,
      items: p.items.map((it) => ({
        insumoId: it.insumoId,
        descripcion: it.descripcion,
        cantidad: Number(it.cantidad),
        cantidadBase: Number(it.cantidadBase),
        unidad: it.insumo?.unidadBase ?? null,
        precioUnitario: it.precioUnitario != null ? Number(it.precioUnitario) : null,
      })),
    })),
  })
}

/**
 * Registra un pedido enviado a un proveedor (desde el botón de WhatsApp).
 * Body: { proveedorId, nota?, items: [{ insumoId?, descripcion, cantidad, factor, precioUnitario? }] }
 */
export async function POST(request: NextRequest) {
  const { user, clienteId, error } = await requireSeccion(SECCION.CONCILIACION_COMPRAS, 'edit')
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const proveedor = await prisma.proveedores.findFirst({ where: { id: String(body?.proveedorId || ''), clienteId } })
  if (!proveedor) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
  const items: Array<{ insumoId?: string | null; descripcion: string; cantidad: number; factor?: number; precioUnitario?: number | null }> =
    Array.isArray(body?.items) ? body.items : []
  const validos = items.filter((i) => String(i.descripcion || '').trim() && Number(i.cantidad) > 0)
  if (validos.length === 0) return NextResponse.json({ error: 'El pedido no tiene items' }, { status: 400 })

  const propios = new Set(
    (
      await prisma.insumos.findMany({
        where: { clienteId, id: { in: validos.map((i) => i.insumoId).filter(Boolean) as string[] } },
        select: { id: true },
      })
    ).map((i) => i.id)
  )
  const hoy = hoyAR()

  const pedido = await prisma.pedidos_proveedor.create({
    data: {
      clienteId,
      proveedorId: proveedor.id,
      fecha: new Date(hoy),
      fechaEsperada: new Date(sumarDias(hoy, proveedor.diasEntrega ?? 1)),
      nota: body?.nota ? String(body.nota).trim() : null,
      creadoPor: user?.id ?? null,
      items: {
        create: validos.map((i) => {
          const factor = Number(i.factor) > 0 ? Number(i.factor) : 1
          return {
            insumoId: i.insumoId && propios.has(i.insumoId) ? i.insumoId : null,
            descripcion: String(i.descripcion).trim().slice(0, 255),
            cantidad: Number(i.cantidad),
            factorBase: factor,
            cantidadBase: Number(i.cantidad) * factor,
            precioUnitario: i.precioUnitario != null && Number.isFinite(Number(i.precioUnitario)) ? Number(i.precioUnitario) : null,
          }
        }),
      },
    },
  })
  return NextResponse.json({ pedido: { id: pedido.id, numero: pedido.numero } }, { status: 201 })
}

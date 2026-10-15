import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { categoriasDe, configuracionDe, productosDe } from '@/lib/pos/db'

export const dynamic = 'force-dynamic'

/** Todo lo que necesita la pantalla de catálogo, en una sola llamada. */
export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.CONFIGURACION, 'edit')
  if (error) return error

  const [categorias, productos, configuracion] = await Promise.all([
    categoriasDe(clienteId!),
    productosDe(clienteId!),
    configuracionDe(clienteId!),
  ])
  return NextResponse.json({ categorias, productos, configuracion })
}

const PANTALLAS = ['rapida', 'salon', 'comercio']
const IVA = [0, 2.5, 5, 10.5, 21, 27]

interface CuerpoProducto {
  id?: string
  categoriaId?: string | null
  nombre?: string
  nombreTicket?: string | null
  codigo?: string | null
  precio?: number
  alicuotaIva?: number
  pantallas?: string[]
  orden?: number
  color?: string | null
  activo?: boolean
  motivoPrecio?: string | null
}

function validar(b: CuerpoProducto, nuevo: boolean): string | null {
  if (nuevo && !b.nombre?.trim()) return 'Poné un nombre'
  if (b.nombre !== undefined && !b.nombre.trim()) return 'Poné un nombre'
  if (b.precio !== undefined && (!Number.isFinite(b.precio) || b.precio < 0)) return 'Precio inválido'
  if (b.alicuotaIva !== undefined && !IVA.includes(Number(b.alicuotaIva))) {
    return `La alícuota tiene que ser una de: ${IVA.join(', ')}`
  }
  if (b.pantallas && b.pantallas.some((p) => !PANTALLAS.includes(p))) return 'Pantalla desconocida'
  return null
}

export async function POST(request: NextRequest) {
  const { clienteId, user, error } = await requireSeccion(SECCION.CONFIGURACION, 'edit')
  if (error) return error

  const b = (await request.json().catch(() => null)) as CuerpoProducto | null
  if (!b) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  const mal = validar(b, true)
  if (mal) return NextResponse.json({ error: mal }, { status: 400 })

  try {
    const [p] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO pos_productos
        ("clienteId", "categoriaId", nombre, "nombreTicket", codigo, precio, "alicuotaIva", pantallas, color)
      VALUES (${clienteId}::uuid, ${b.categoriaId || null}::uuid, ${b.nombre!.trim()},
              ${b.nombreTicket?.trim()?.slice(0, 40) || b.nombre!.trim().slice(0, 40)},
              ${b.codigo?.trim() || null}, ${b.precio ?? 0}, ${b.alicuotaIva ?? 21},
              ${b.pantallas ?? []}::text[], ${b.color || null})
      RETURNING id
    `
    await prisma.$executeRaw`
      INSERT INTO pos_precios ("productoId", precio, "usuarioId", motivo)
      VALUES (${p!.id}::uuid, ${b.precio ?? 0}, ${user?.id ?? null}::uuid, 'Alta del producto')
    `
    return NextResponse.json({ id: p!.id })
  } catch (e) {
    return NextResponse.json({ error: mensaje(e) }, { status: 409 })
  }
}

export async function PATCH(request: NextRequest) {
  const { clienteId, user, error } = await requireSeccion(SECCION.CONFIGURACION, 'edit')
  if (error) return error

  const b = (await request.json().catch(() => null)) as CuerpoProducto | null
  if (!b?.id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })
  const mal = validar(b, false)
  if (mal) return NextResponse.json({ error: mal }, { status: 400 })

  const [antes] = await prisma.$queryRaw<Array<{ precio: number }>>`
    SELECT precio::float8 AS precio FROM pos_productos
     WHERE id = ${b.id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  if (!antes) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

  try {
    await prisma.$executeRaw`
      UPDATE pos_productos SET
        "categoriaId"  = COALESCE(${b.categoriaId === undefined ? null : b.categoriaId}::uuid, "categoriaId"),
        nombre         = COALESCE(${b.nombre?.trim() ?? null}, nombre),
        "nombreTicket" = COALESCE(${b.nombreTicket?.trim()?.slice(0, 40) ?? null}, "nombreTicket"),
        codigo         = COALESCE(${b.codigo?.trim() ?? null}, codigo),
        precio         = COALESCE(${b.precio ?? null}, precio),
        "alicuotaIva"  = COALESCE(${b.alicuotaIva ?? null}, "alicuotaIva"),
        pantallas      = COALESCE(${b.pantallas ?? null}::text[], pantallas),
        orden          = COALESCE(${b.orden ?? null}, orden),
        color          = COALESCE(${b.color ?? null}, color),
        activo         = COALESCE(${b.activo ?? null}, activo),
        "updatedAt"    = now()
      WHERE id = ${b.id}::uuid AND "clienteId" = ${clienteId}::uuid
    `
    // El cambio de precio deja rastro: un ticket viejo tiene que poder
    // explicarse, y "quién subió esto" es de las cosas que más se preguntan.
    if (b.precio !== undefined && b.precio !== antes.precio) {
      await prisma.$executeRaw`
        INSERT INTO pos_precios ("productoId", precio, "usuarioId", motivo)
        VALUES (${b.id}::uuid, ${b.precio}, ${user?.id ?? null}::uuid, ${b.motivoPrecio?.trim() || null})
      `
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: mensaje(e) }, { status: 409 })
  }
}

export async function DELETE(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.CONFIGURACION, 'edit')
  if (error) return error
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  // No se borra: se desactiva. El producto puede estar en tickets viejos, y
  // los informes históricos tienen que poder nombrarlo.
  await prisma.$executeRaw`
    UPDATE pos_productos SET activo = false, "updatedAt" = now()
     WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  return NextResponse.json({ ok: true })
}

function mensaje(e: unknown): string {
  const t = e instanceof Error ? e.message : ''
  if (t.includes('pos_productos_nombre_unico')) return 'Ya existe un producto con ese nombre'
  if (t.includes('pos_productos_iva_check')) return 'Alícuota de IVA inválida'
  if (t.includes('pos_productos_precio_check')) return 'El precio no puede ser negativo'
  return 'No se pudo guardar'
}

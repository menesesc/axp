import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getAuthUser()
    if (error) return error

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const q = searchParams.get('q') || ''
    const proveedorId = searchParams.get('proveedorId') || ''
    const fechaDesde = searchParams.get('fechaDesde') || ''
    const fechaHasta = searchParams.get('fechaHasta') || ''
    const offset = (page - 1) * limit

    // Build dynamic SQL filters
    let filters = ''
    const params: any[] = [clienteId]
    let paramIndex = 2

    if (q) {
      filters += ` AND di.descripcion ILIKE $${paramIndex}`
      params.push(`%${q}%`)
      paramIndex++
    }

    if (proveedorId) {
      filters += ` AND d."proveedorId" = $${paramIndex}::uuid`
      params.push(proveedorId)
      paramIndex++
    }

    if (fechaDesde) {
      filters += ` AND d."fechaEmision" >= $${paramIndex}::date`
      params.push(fechaDesde)
      paramIndex++
    }

    if (fechaHasta) {
      filters += ` AND d."fechaEmision" <= $${paramIndex}::date`
      params.push(fechaHasta)
      paramIndex++
    }

    // Get items with pagination
    const itemsRaw = await prisma.$queryRawUnsafe<Array<{
      id: string
      linea: number
      descripcion: string
      codigo: string | null
      cantidad: number | null
      unidad: string | null
      precio_unitario: number | null
      subtotal: number | null
      doc_id: string
      doc_tipo: string
      doc_letra: string | null
      doc_numero: string | null
      doc_fecha: Date | null
      doc_pdf_final: string | null
      doc_pdf_raw: string | null
      prov_id: string | null
      prov_razon: string | null
    }>>(`
      SELECT
        di.id,
        di.linea,
        di.descripcion,
        di.codigo,
        di.cantidad::numeric as cantidad,
        di.unidad,
        di."precioUnitario"::numeric as precio_unitario,
        di.subtotal::numeric as subtotal,
        d.id as doc_id,
        d.tipo as doc_tipo,
        d.letra as doc_letra,
        d."numeroCompleto" as doc_numero,
        d."fechaEmision" as doc_fecha,
        d."pdfFinalKey" as doc_pdf_final,
        d."pdfRawKey" as doc_pdf_raw,
        p.id as prov_id,
        p."razonSocial" as prov_razon
      FROM documento_items di
      JOIN documentos d ON di."documentoId" = d.id
      LEFT JOIN proveedores p ON d."proveedorId" = p.id
      WHERE d."clienteId" = $1::uuid ${filters}
      ORDER BY d."fechaEmision" DESC NULLS LAST, di.linea ASC
      LIMIT ${limit} OFFSET ${offset}
    `, ...params)

    // Get total count
    const countResult = await prisma.$queryRawUnsafe<[{ count: bigint }]>(`
      SELECT COUNT(*)::bigint as count
      FROM documento_items di
      JOIN documentos d ON di."documentoId" = d.id
      WHERE d."clienteId" = $1::uuid ${filters}
    `, ...params)

    const total = Number(countResult[0]?.count || 0)

    // Get totals
    const totalsResult = await prisma.$queryRawUnsafe<[{
      total_subtotal: number | null
      total_cantidad: number | null
      total_count: bigint
    }]>(`
      SELECT
        SUM(di.subtotal::numeric) as total_subtotal,
        SUM(di.cantidad::numeric) as total_cantidad,
        COUNT(*)::bigint as total_count
      FROM documento_items di
      JOIN documentos d ON di."documentoId" = d.id
      WHERE d."clienteId" = $1::uuid ${filters}
    `, ...params)

    const totals = totalsResult[0]

    return NextResponse.json({
      items: itemsRaw.map(item => ({
        id: item.id,
        linea: item.linea,
        descripcion: item.descripcion,
        codigo: item.codigo,
        cantidad: item.cantidad ? Number(item.cantidad) : null,
        unidad: item.unidad,
        precioUnitario: item.precio_unitario ? Number(item.precio_unitario) : null,
        subtotal: item.subtotal ? Number(item.subtotal) : null,
        documento: {
          id: item.doc_id,
          tipo: item.doc_tipo,
          letra: item.doc_letra,
          numeroCompleto: item.doc_numero,
          fechaEmision: item.doc_fecha,
          pdfKey: item.doc_pdf_final || item.doc_pdf_raw,
        },
        proveedor: item.prov_id ? {
          id: item.prov_id,
          razonSocial: item.prov_razon,
        } : null,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      totals: {
        subtotal: totals?.total_subtotal ? Number(totals.total_subtotal) : 0,
        cantidad: totals?.total_cantidad ? Number(totals.total_cantidad) : 0,
        count: Number(totals?.total_count || 0),
      },
    })
  } catch (error: any) {
    console.error('Error fetching items:', error?.message || error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    )
  }
}

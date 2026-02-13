import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Verificar autenticación
    const { user, error } = await getAuthUser()
    if (error) return error

    const clienteId = user?.clienteId

    if (!clienteId) {
      return NextResponse.json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      )
    }

    // Obtener estadísticas
    const today = new Date()
    const fromDate = new Date(today)
    fromDate.setDate(today.getDate() - 29)
    fromDate.setHours(0, 0, 0, 0)

    const from7Days = new Date(today)
    from7Days.setDate(today.getDate() - 6)
    from7Days.setHours(0, 0, 0, 0)

    // Inicio del mes actual
    const inicioMes = new Date(today.getFullYear(), today.getMonth(), 1)

    const [
      totalDocumentos,
      totalPendientes,
      totalConfirmados,
      totalPagados,
      totalErrores,
      totalDuplicados,
      totalMes,
      documentosEsteMes,
      documentosHoy,
      totalProveedores,
      documentosPorDiaRaw,
      montosPorDiaRaw,
      confidenceAvg,
    ] = await Promise.all([
      // Total documentos
      prisma.documentos.count({
        where: { clienteId },
      }),

      // Pendientes de revisión
      prisma.documentos.count({
        where: {
          clienteId,
          estadoRevision: 'PENDIENTE',
        },
      }),

      // Confirmados
      prisma.documentos.count({
        where: {
          clienteId,
          estadoRevision: 'CONFIRMADO',
        },
      }),

      // Pagados
      prisma.documentos.count({
        where: {
          clienteId,
          estadoRevision: 'PAGADO',
        },
      }),

      // Errores
      prisma.documentos.count({
        where: {
          clienteId,
          estadoRevision: 'ERROR',
        },
      }),

      // Duplicados
      prisma.documentos.count({
        where: {
          clienteId,
          estadoRevision: 'DUPLICADO',
        },
      }),

      // Total $ del mes actual
      prisma.documentos.aggregate({
        where: {
          clienteId,
          fechaEmision: {
            gte: inicioMes,
          },
        },
        _sum: {
          total: true,
        },
      }),

      // Documentos procesados este mes (por fecha de creación)
      prisma.documentos.count({
        where: {
          clienteId,
          createdAt: {
            gte: inicioMes,
          },
        },
      }),

      // Documentos procesados hoy
      prisma.documentos.count({
        where: {
          clienteId,
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),

      // Total proveedores activos
      prisma.proveedores.count({
        where: {
          clienteId,
          activo: true,
        },
      }),

      // Documentos por fecha de emisión (últimos 30 días)
      prisma.documentos.groupBy({
        where: {
          clienteId,
          fechaEmision: {
            gte: fromDate,
          },
        },
        by: ['fechaEmision'],
        _count: {
          _all: true,
        },
        orderBy: {
          fechaEmision: 'asc',
        },
      }),

      // Montos por día (últimos 30 días) para el gráfico de importes
      prisma.documentos.groupBy({
        where: {
          clienteId,
          fechaEmision: {
            gte: fromDate,
          },
        },
        by: ['fechaEmision'],
        _sum: {
          total: true,
        },
        orderBy: {
          fechaEmision: 'asc',
        },
      }),

      // Promedio de confianza OCR (últimos 30 días)
      prisma.documentos.aggregate({
        where: {
          clienteId,
          createdAt: {
            gte: fromDate,
          },
          confidenceScore: {
            not: null,
          },
        },
        _avg: {
          confidenceScore: true,
        },
      }),
    ])

    // Obtener límite de documentos del plan (raw query ya que no está en Prisma)
    const suscripcionRaw = await prisma.$queryRaw<Array<{
      documentos_mes_limite: number | null
      plan_nombre: string | null
    }>>`
      SELECT p.documentos_mes_limite, p.nombre as plan_nombre
      FROM suscripciones s
      JOIN planes p ON s.plan_id = p.id
      WHERE s."clienteId" = ${clienteId}::uuid
        AND s.estado = 'ACTIVA'
      LIMIT 1
    `
    const suscripcion = suscripcionRaw[0] || null

    // Calcular revisados (confirmados + pagados = documentos que pasaron revisión)
    const totalRevisados = totalConfirmados + totalPagados

    // Calcular tasa de éxito (revisados / total)
    const tasaExito = totalDocumentos > 0
      ? Math.round((totalRevisados / totalDocumentos) * 100 * 10) / 10
      : 0

    // Normalizar serie de documentos por día a los últimos 30 días
    const countsByDate = new Map<string, number>()
    const amountsByDate = new Map<string, number>()

    for (const row of documentosPorDiaRaw) {
      if (!row.fechaEmision) continue
      const key = row.fechaEmision.toISOString().slice(0, 10)
      countsByDate.set(key, (row._count as any)._all ?? 0)
    }

    for (const row of montosPorDiaRaw) {
      if (!row.fechaEmision) continue
      const key = row.fechaEmision.toISOString().slice(0, 10)
      amountsByDate.set(key, Number(row._sum?.total) || 0)
    }

    const documentosPorDia: { date: string; count: number; amount: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      d.setHours(0, 0, 0, 0)
      const key = d.toISOString().slice(0, 10)
      documentosPorDia.push({
        date: key,
        count: countsByDate.get(key) || 0,
        amount: amountsByDate.get(key) || 0,
      })
    }

    // Calcular promedio de confianza (0 si no hay documentos)
    const confidencePromedio = confidenceAvg?._avg?.confidenceScore ?? 0

    // Obtener totales por proveedor con desglose por estado
    const proveedorEstadosRaw = await prisma.$queryRaw<Array<{
      proveedor_id: string
      razon_social: string
      estado: string
      total: number
      count: bigint
    }>>`
      SELECT
        d."proveedorId" as proveedor_id,
        p."razonSocial" as razon_social,
        d."estadoRevision"::text as estado,
        COALESCE(SUM(d.total), 0)::float as total,
        COUNT(*)::bigint as count
      FROM documentos d
      JOIN proveedores p ON d."proveedorId" = p.id
      WHERE d."clienteId" = ${clienteId}::uuid
        AND d."createdAt" >= ${from7Days}
        AND d."proveedorId" IS NOT NULL
      GROUP BY d."proveedorId", p."razonSocial", d."estadoRevision"
      ORDER BY SUM(d.total) DESC
    `

    // Agrupar por proveedor
    const proveedorMap = new Map<string, {
      proveedorId: string
      proveedor: string
      total: number
      count: number
      pendientes: number
      confirmados: number
      pagados: number
      errores: number
      duplicados: number
    }>()

    for (const row of proveedorEstadosRaw) {
      const existing = proveedorMap.get(row.proveedor_id) || {
        proveedorId: row.proveedor_id,
        proveedor: row.razon_social,
        total: 0,
        count: 0,
        pendientes: 0,
        confirmados: 0,
        pagados: 0,
        errores: 0,
        duplicados: 0,
      }

      existing.total += Number(row.total)
      existing.count += Number(row.count)

      switch (row.estado) {
        case 'PENDIENTE': existing.pendientes += Number(row.count); break
        case 'CONFIRMADO': existing.confirmados += Number(row.count); break
        case 'PAGADO': existing.pagados += Number(row.count); break
        case 'ERROR': existing.errores += Number(row.count); break
        case 'DUPLICADO': existing.duplicados += Number(row.count); break
      }

      proveedorMap.set(row.proveedor_id, existing)
    }

    const totalesPorProveedor = Array.from(proveedorMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

    // Calcular documentos restantes del mes
    const documentosMesLimite = suscripcion?.documentos_mes_limite ?? null
    const documentosRestantes = documentosMesLimite !== null
      ? Math.max(0, documentosMesLimite - documentosEsteMes)
      : null

    return NextResponse.json({
      totalDocumentos,
      totalPendientes,
      totalConfirmados,
      totalPagados,
      totalErrores,
      totalDuplicados,
      totalRevisados,
      totalMes: totalMes._sum.total || 0,
      documentosEsteMes,
      documentosMesLimite,
      documentosRestantes,
      planNombre: suscripcion?.plan_nombre ?? null,
      documentosHoy,
      totalProveedores,
      tasaExito,
      documentosPorDia,
      confidencePromedio,
      totalesPorProveedor,
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

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
      totalMes,
      documentosEsteMes,
      documentosHoy,
      totalProveedores,
      documentosPorDiaRaw,
      montosPorDiaRaw,
      confidenceAvg,
      totalesPorProveedorRaw,
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

      // Totales por proveedor (últimos 7 días de ingreso)
      prisma.documentos.groupBy({
        where: {
          clienteId,
          createdAt: {
            gte: from7Days,
          },
          proveedorId: {
            not: null,
          },
        },
        by: ['proveedorId'],
        _sum: {
          total: true,
        },
        _count: {
          _all: true,
        },
        orderBy: {
          _sum: {
            total: 'desc',
          },
        },
        take: 10, // Top 10 proveedores
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

    // Calcular tasa de éxito (confirmados / total)
    const tasaExito = totalDocumentos > 0
      ? Math.round((totalConfirmados / totalDocumentos) * 100 * 10) / 10
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

    // Obtener nombres de proveedores para el gráfico
    const proveedorIds = totalesPorProveedorRaw
      .map(r => r.proveedorId)
      .filter((id): id is string => id !== null)

    const proveedoresInfo = proveedorIds.length > 0
      ? await prisma.proveedores.findMany({
          where: { id: { in: proveedorIds } },
          select: { id: true, razonSocial: true },
        })
      : []

    const proveedoresMap = new Map(proveedoresInfo.map(p => [p.id, p.razonSocial]))

    const totalesPorProveedor = totalesPorProveedorRaw.map(row => ({
      proveedorId: row.proveedorId,
      proveedor: proveedoresMap.get(row.proveedorId!) || 'Desconocido',
      total: Number(row._sum?.total) || 0,
      count: (row._count as any)?._all || 0,
    }))

    // Calcular documentos restantes del mes
    const documentosMesLimite = suscripcion?.documentos_mes_limite ?? null
    const documentosRestantes = documentosMesLimite !== null
      ? Math.max(0, documentosMesLimite - documentosEsteMes)
      : null

    return NextResponse.json({
      totalDocumentos,
      totalPendientes,
      totalConfirmados,
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

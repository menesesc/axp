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

    const [
      totalDocumentos,
      totalPendientes,
      totalConfirmados,
      totalMes,
      documentosHoy,
      totalProveedores,
      documentosPorDiaRaw,
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

      // Total $ del mes actual
      prisma.documentos.aggregate({
        where: {
          clienteId,
          fechaEmision: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
        _sum: {
          total: true,
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

    // Calcular tasa de éxito (confirmados / total)
    const tasaExito = totalDocumentos > 0
      ? Math.round((totalConfirmados / totalDocumentos) * 100 * 10) / 10
      : 0

    // Normalizar serie de documentos por día a los últimos 30 días
    const countsByDate = new Map<string, number>()
    for (const row of documentosPorDiaRaw) {
      if (!row.fechaEmision) continue
      const key = row.fechaEmision.toISOString().slice(0, 10)
      countsByDate.set(key, (row._count as any)._all ?? 0)
    }

    const documentosPorDia: { date: string; count: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      d.setHours(0, 0, 0, 0)
      const key = d.toISOString().slice(0, 10)
      documentosPorDia.push({
        date: key,
        count: countsByDate.get(key) || 0,
      })
    }

    // Calcular promedio de confianza (0 si no hay documentos)
    const confidencePromedio = confidenceAvg._avg.confidenceScore ?? 0

    return NextResponse.json({
      totalDocumentos,
      totalPendientes,
      totalConfirmados,
      totalMes: totalMes._sum.total || 0,
      documentosHoy,
      totalProveedores,
      tasaExito,
      documentosPorDia,
      confidencePromedio,
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

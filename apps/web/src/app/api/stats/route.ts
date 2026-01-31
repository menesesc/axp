import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clienteId = searchParams.get('clienteId')
    
    if (!clienteId) {
      return NextResponse.json(
        { error: 'clienteId is required' },
        { status: 400 }
      )
    }

    // Obtener estadísticas
    const [
      totalDocumentos,
      totalPendientes,
      totalMes,
      documentosHoy,
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
    ])

    return NextResponse.json({
      totalDocumentos,
      totalPendientes,
      totalMes: totalMes._sum.total || 0,
      documentosHoy,
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

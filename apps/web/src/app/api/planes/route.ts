import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const planes = await prisma.$queryRaw<
      {
        id: string
        nombre: string
        descripcion: string | null
        precio_mensual: number
        precio_anual: number | null
        documentos_mes_limite: number | null
        usuarios_limite: number | null
        storage_mb_limite: number
        ocr_incluido: boolean
        soporte_prioritario: boolean
        orden: number
      }[]
    >`
      SELECT
        id::text,
        nombre,
        descripcion,
        precio_mensual::float,
        precio_anual::float,
        documentos_mes_limite,
        usuarios_limite,
        storage_mb_limite,
        ocr_incluido,
        soporte_prioritario,
        orden
      FROM planes
      WHERE activo = true
      ORDER BY orden ASC
    `

    return NextResponse.json({ planes })
  } catch (error) {
    console.error('Error fetching planes:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

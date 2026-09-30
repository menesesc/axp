import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { importesJson } from '@/lib/importes'
import { calcularSugerencias } from '@/lib/stock/compras'

export const dynamic = 'force-dynamic'

/** Compras sugeridas sobre el stock del central. Query: ?dias=<días objetivo> */
export async function GET(request: NextRequest) {
  const { clienteId, verImportes, error } = await requireSeccion(SECCION.CONCILIACION_COMPRAS)
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })
  const dias = Number(request.nextUrl.searchParams.get('dias') || 7)
  const sugerencias = await calcularSugerencias(clienteId, { diasObjetivo: Number.isFinite(dias) ? dias : 7 })
  return importesJson(verImportes)({ sugerencias })
}

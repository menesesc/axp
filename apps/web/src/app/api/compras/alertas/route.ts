import { NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { calcularSugerencias } from '@/lib/stock/compras'

export const dynamic = 'force-dynamic'

/** Cantidad de insumos a pedir ya (para el badge del menú). */
export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_COMPRAS)
  if (error) return error
  if (!clienteId) return NextResponse.json({ pedir: 0 })
  const s = await calcularSugerencias(clienteId)
  return NextResponse.json({ pedir: s.filter((x) => x.estado === 'pedir').length })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { ayerAR } from '@/lib/fechas'
import { sincronizarPedidosVentas } from '@/lib/stock/pedidos'

export const dynamic = 'force-dynamic'

/**
 * Genera o actualiza los pedidos automáticos de un día de ventas (por defecto
 * ayer). Normalmente corre solo al llegar cada cierre; esto es para forzarlo
 * (ej. después de cargar recetas o asignar depósitos de salida).
 * Body: { fecha?: 'YYYY-MM-DD' }
 */
export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_PEDIDOS, 'edit')
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.fecha || '')) ? String(body.fecha) : ayerAR()
  const r = await sincronizarPedidosVentas(clienteId, fecha)
  return NextResponse.json({ fecha, ...r })
}

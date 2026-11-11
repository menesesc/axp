import { NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { alertasDe } from '@/lib/eventos/alertas'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { clienteId, verImportes, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS)
  if (error) return error
  return NextResponse.json({ alertas: await alertasDe(clienteId!, verImportes) })
}

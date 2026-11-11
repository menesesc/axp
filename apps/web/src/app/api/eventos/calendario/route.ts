import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { agendaDe, esFecha, listarEventos, listarReservas } from '@/lib/eventos/db'

export const dynamic = 'force-dynamic'

/**
 * Todo lo del rango para el calendario: los eventos con el agregado de sus
 * reservas, las reservas que no cuelgan de un evento, y la agenda. Los
 * filtros (salón, estado, tipo) se aplican en pantalla: el rango de un mes
 * es chico y así cambiar de filtro no vuelve a pedir nada.
 */
export async function GET(request: NextRequest) {
  const { clienteId, verImportes, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS)
  if (error) return error
  const sp = request.nextUrl.searchParams
  const desde = sp.get('desde')
  const hasta = sp.get('hasta')
  if (!esFecha(desde) || !esFecha(hasta)) return NextResponse.json({ error: 'Falta el rango' }, { status: 400 })
  if (Date.parse(hasta) - Date.parse(desde) > 62 * 86_400_000) {
    return NextResponse.json({ error: 'El rango es demasiado largo' }, { status: 400 })
  }

  const [eventos, reservas, agenda] = await Promise.all([
    listarEventos(clienteId!, { desde, hasta }),
    listarReservas(clienteId!, { sinEvento: true, desde, hasta }),
    agendaDe(clienteId!, { desde, hasta }),
  ])
  const sinPlata = <T extends { total: number; cobrado: number; saldo: number }>(x: T): T => ({ ...x, total: 0, cobrado: 0, saldo: 0 })
  return NextResponse.json({
    eventos: verImportes ? eventos : eventos.map(sinPlata),
    reservas: verImportes ? reservas : reservas.map(sinPlata),
    agenda,
  })
}

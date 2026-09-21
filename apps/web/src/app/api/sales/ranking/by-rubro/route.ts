import { NextRequest } from 'next/server'
import { requireModulo } from '@/lib/auth'
import { MODULO } from '@/lib/permisos'
import { importesJson } from '@/lib/importes'
import { fetchRankingByRubro } from '@/lib/sales/ranking-by-rubro-query'

export const dynamic = 'force-dynamic'

/**
 * Ranking de productos agrupado por rubro con desglose por turno.
 * Usado por la vista web del informe y por el renderer del email.
 *
 * Query: from, to, sucursal?, topN?, search?
 */
export async function GET(request: NextRequest) {
  const { clienteId, verImportes, error } = await requireModulo(MODULO.VENTAS)
  if (error) return error
  const json = importesJson(verImportes)

  const sp = request.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  if (!from || !to) {
    return json({ error: 'from y to son requeridos' }, { status: 400 })
  }

  const result = await fetchRankingByRubro({
    clienteId: clienteId!,
    from,
    to,
    sucursal: sp.get('sucursal'),
    topN: parseInt(sp.get('topN') || '10', 10),
    search: sp.get('search') || '',
  })

  return json(result)
}

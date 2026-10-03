import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { cargarLote, filasGalicia } from '@/lib/pagos/lotes'
import { cantidadPartes, generarGaliciaXls } from '@/lib/pagos/galicia'

export const dynamic = 'force-dynamic'

/** Archivo .xls para Galicia. Con más de 25 transferencias se baja por partes (?parte=2…). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireSeccion(SECCION.FINANZAS_PAGOS)
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }
  const { id } = await params
  const lote = await cargarLote(user.clienteId, id)
  if (!lote) return NextResponse.json({ error: 'Lote no encontrado' }, { status: 404 })

  const filas = filasGalicia(lote)
  if (filas.length === 0) {
    return NextResponse.json({ error: 'El lote no tiene transferencias con CBU' }, { status: 400 })
  }
  const partes = cantidadPartes(filas.length)
  const parte = Math.min(Math.max(1, parseInt(request.nextUrl.searchParams.get('parte') || '1', 10) || 1), partes)

  const xls = generarGaliciaXls(filas, parte)
  const sufijo = partes > 1 ? `_${String(parte).padStart(2, '0')}_de_${String(partes).padStart(2, '0')}` : ''
  const filename = `Transferencias_lote${lote.numero}${sufijo}.xls`

  return new NextResponse(new Uint8Array(xls), {
    headers: {
      'Content-Type': 'application/vnd.ms-excel',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

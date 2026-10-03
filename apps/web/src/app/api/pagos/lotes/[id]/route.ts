import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { cargarLote, descripcionTransferencia, filasGalicia } from '@/lib/pagos/lotes'
import { cantidadPartes } from '@/lib/pagos/galicia'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireSeccion(SECCION.FINANZAS_PAGOS)
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }
  const { id } = await params
  const lote = await cargarLote(user.clienteId, id)
  if (!lote) return NextResponse.json({ error: 'Lote no encontrado' }, { status: 404 })

  return NextResponse.json({
    lote: {
      id: lote.id,
      numero: lote.numero,
      fecha: lote.fecha,
      partesGalicia: cantidadPartes(filasGalicia(lote).length),
      ordenes: lote.pagos.map((p) => ({
        id: p.id,
        numero: p.numero,
        estado: p.estado,
        montoTotal: Number(p.montoTotal),
        comprobanteKey: p.comprobanteKey,
        proveedor: { id: p.proveedores.id, razonSocial: p.proveedores.razonSocial, cuit: p.proveedores.cuit, cbu: p.cbu },
        documentosCount: p.pago_documentos.length,
        descripcion: descripcionTransferencia(p),
      })),
    },
  })
}

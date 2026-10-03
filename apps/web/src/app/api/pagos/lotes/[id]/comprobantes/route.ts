import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { prisma } from '@/lib/prisma'
import { uploadToR2 } from '@/lib/r2/client'
import { cargarLote, separarPaginas, textoPdf } from '@/lib/pagos/lotes'
import { leerComprobanteGalicia, repartirComprobantes } from '@/lib/pagos/comprobantes-galicia'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_BYTES = 25 * 1024 * 1024

/**
 * Comprobantes del lote en bloque. Se suben uno o varios PDF (cada página = una
 * transferencia) en dos pasos con los mismos archivos:
 *  - modo=leer: lee cada página y propone a qué orden va (no guarda nada).
 *  - modo=confirmar + asignaciones: guarda cada página como comprobante de su
 *    orden y la marca PAGADO.
 */
const asignacionesSchema = z.array(
  z.object({ archivo: z.number().int().min(0), pagina: z.number().int().min(0), pagoId: z.string().uuid() })
)

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireSeccion(SECCION.FINANZAS_PAGOS, 'edit')
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }
  const { id } = await params

  const cliente = await prisma.clientes.findUnique({ where: { id: user.clienteId }, select: { cuit: true } })
  if (!cliente?.cuit) return NextResponse.json({ error: 'Cliente sin CUIT' }, { status: 400 })

  const lote = await cargarLote(user.clienteId, id)
  if (!lote) return NextResponse.json({ error: 'Lote no encontrado' }, { status: 404 })

  const form = await request.formData()
  const modo = form.get('modo') === 'confirmar' ? 'confirmar' : 'leer'
  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) return NextResponse.json({ error: 'Subí al menos un PDF' }, { status: 400 })
  if (files.some((f) => f.type !== 'application/pdf')) {
    return NextResponse.json({ error: 'Solo se aceptan archivos PDF' }, { status: 400 })
  }
  if (files.reduce((s, f) => s + f.size, 0) > MAX_BYTES) {
    return NextResponse.json({ error: 'Los archivos superan 25MB en total' }, { status: 400 })
  }

  // Páginas de cada archivo, en orden.
  const paginas: Array<{ archivo: number; pagina: number; nombre: string; bytes: Uint8Array }> = []
  for (const [archivo, f] of files.entries()) {
    try {
      const partes = await separarPaginas(new Uint8Array(await f.arrayBuffer()))
      partes.forEach((bytes, pagina) => paginas.push({ archivo, pagina, nombre: f.name, bytes }))
    } catch {
      return NextResponse.json({ error: `No se pudo leer ${f.name}` }, { status: 400 })
    }
  }

  if (modo === 'leer') {
    const leidos = await Promise.all(
      paginas.map(async (p) => leerComprobanteGalicia(await textoPdf(p.bytes).catch(() => ''), cliente.cuit))
    )
    // Solo compiten las órdenes que todavía no tienen comprobante.
    const pendientes = lote.pagos.filter((p) => !p.comprobanteKey)
    const reparto = repartirComprobantes(
      leidos,
      pendientes.map((p) => ({ id: p.id, cbu: p.cbu, cuit: p.proveedores.cuit, monto: Number(p.montoTotal) }))
    )
    return NextResponse.json({
      paginas: paginas.map((p, i) => ({
        archivo: p.archivo,
        pagina: p.pagina,
        nombre: p.nombre,
        leido: leidos[i],
        ...reparto[i],
      })),
    })
  }

  // confirmar
  let asignaciones: z.infer<typeof asignacionesSchema>
  try {
    asignaciones = asignacionesSchema.parse(JSON.parse(String(form.get('asignaciones') || '[]')))
  } catch {
    return NextResponse.json({ error: 'Asignaciones inválidas' }, { status: 400 })
  }
  const enLote = new Set(lote.pagos.map((p) => p.id))
  if (asignaciones.some((a) => !enLote.has(a.pagoId))) {
    return NextResponse.json({ error: 'Alguna orden no pertenece al lote' }, { status: 400 })
  }
  if (new Set(asignaciones.map((a) => a.pagoId)).size !== asignaciones.length) {
    return NextResponse.json({ error: 'Una orden tiene más de un comprobante asignado' }, { status: 400 })
  }

  const bucket = `axp-client-${cliente.cuit}`
  const ts = Date.now()
  let guardados = 0
  for (const a of asignaciones) {
    const pag = paginas.find((p) => p.archivo === a.archivo && p.pagina === a.pagina)
    if (!pag) continue
    const base = pag.nombre.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9.-]/g, '_')
    const key = `comprobantes/${a.pagoId}/transferencia-${ts}-${base}-p${a.pagina + 1}.pdf`
    await uploadToR2(bucket, key, Buffer.from(pag.bytes), { pagoId: a.pagoId, loteId: lote.id })
    await prisma.$executeRaw`
      UPDATE pagos SET "comprobanteKey" = ${key}, estado = 'PAGADO'::"EstadoPago", "updatedAt" = NOW()
      WHERE id = ${a.pagoId}::uuid AND "clienteId" = ${user.clienteId}::uuid
    `
    guardados++
  }

  return NextResponse.json({ guardados })
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { prisma } from '@/lib/prisma'
import { uploadToR2 } from '@/lib/r2/client'
import { formatNumeroOrden } from '@/lib/utils'
import { separarPaginas, textoPdf } from '@/lib/pagos/lotes'
import {
  ECHEQ_CLAUSULAS,
  ECHEQ_MOTIVOS,
  generarPlantillaEcheq,
  leerEcheq,
  repartirEcheqs,
  type EcheqClausula,
  type EcheqMotivo,
} from '@/lib/pagos/echeq-galicia'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_BYTES = 25 * 1024 * 1024
const TIPO_CORTO: Record<string, string> = { FACTURA: 'FC', NOTA_CREDITO: 'NC', REMITO: 'RM' }

async function cargarPago(clienteId: string, id: string) {
  return prisma.pagos.findFirst({
    where: { id, clienteId },
    include: {
      proveedores: { select: { razonSocial: true, cuit: true, email: true } },
      pago_metodos: true,
      pago_documentos: { include: { documentos: { select: { tipo: true, letra: true, numeroCompleto: true } } } },
    },
  })
}

type PagoCargado = NonNullable<Awaited<ReturnType<typeof cargarPago>>>

/** Líneas eCheq de la orden, ordenadas por fecha de pago. */
function lineasEcheq(pago: PagoCargado) {
  return pago.pago_metodos
    .filter((m) => m.tipo === 'ECHEQ')
    .map((m) => {
      const meta = (m.meta || {}) as Record<string, unknown>
      const fecha = String(meta.fecha || pago.fecha.toISOString()).slice(0, 10)
      return { id: m.id, monto: Number(m.monto), fecha, meta }
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.monto - b.monto)
}

function prefijoProveedor(razonSocial: string): string {
  return (
    razonSocial
      .toUpperCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'PROVEEDOR'
  )
}

/**
 * Archivo para emitir los eCheq de la orden desde Galicia Office (plantilla
 * oficial completa). Query: ?motivo=Orden de Pago&clausula=A la orden&mail=1
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireSeccion(SECCION.FINANZAS_PAGOS)
  if (error) return error
  if (!user?.clienteId) return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  const { id } = await params

  const pago = await cargarPago(user.clienteId, id)
  if (!pago) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
  const lineas = lineasEcheq(pago)
  if (lineas.length === 0) return NextResponse.json({ error: 'La orden no tiene eCheq cargados' }, { status: 400 })

  const sp = request.nextUrl.searchParams
  const motivo = (ECHEQ_MOTIVOS as readonly string[]).includes(sp.get('motivo') || '')
    ? (sp.get('motivo') as EcheqMotivo)
    : 'Orden de Pago'
  const clausula = (ECHEQ_CLAUSULAS as readonly string[]).includes(sp.get('clausula') || '')
    ? (sp.get('clausula') as EcheqClausula)
    : 'A la orden'
  const mail = sp.get('mail') === '1' ? pago.proveedores.email : null

  const op = `OP ${formatNumeroOrden(pago.numero)}`
  const docs = pago.pago_documentos
    .map((pd) => pd.documentos)
    .filter(Boolean)
    .map((d) => [TIPO_CORTO[d!.tipo] ?? d!.tipo, d!.letra, d!.numeroCompleto].filter(Boolean).join(' '))
    .join(', ')

  try {
    const buf = await generarPlantillaEcheq(
      lineas.map((l, i) => ({
        cuit: pago.proveedores.cuit ?? '',
        monto: l.monto,
        fecha: l.fecha,
        motivo,
        descripcion1: op,
        // Descripción 2 (50): las facturas que paga, o el número de cheque dentro de la orden.
        descripcion2: docs || `Cheque ${i + 1} de ${lineas.length}`,
        mail,
        clausula,
      }))
    )
    const filename = `ECHEQ-${prefijoProveedor(pago.proveedores.razonSocial)}-OP${formatNumeroOrden(pago.numero)}.xlsx`
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo generar el archivo' }, { status: 400 })
  }
}

const asignacionesSchema = z.array(
  z.object({ archivo: z.number().int().min(0), pagina: z.number().int().min(0), metodoId: z.string().uuid() })
)

/**
 * PDFs de los eCheq emitidos, en dos pasos con los mismos archivos:
 *  - modo=leer: lee cada página y propone a qué eCheq de la orden corresponde.
 *  - modo=confirmar + asignaciones: guarda cada página como adjunto de su línea
 *    eCheq (y su número de cheque como referencia si no tenía). El PDF de la
 *    orden ya anexa los adjuntos: queda la OP final.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireSeccion(SECCION.FINANZAS_PAGOS, 'edit')
  if (error) return error
  if (!user?.clienteId) return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  const { id } = await params

  const cliente = await prisma.clientes.findUnique({ where: { id: user.clienteId }, select: { cuit: true } })
  if (!cliente?.cuit) return NextResponse.json({ error: 'Cliente sin CUIT' }, { status: 400 })
  const pago = await cargarPago(user.clienteId, id)
  if (!pago) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
  const lineas = lineasEcheq(pago)
  if (lineas.length === 0) return NextResponse.json({ error: 'La orden no tiene eCheq cargados' }, { status: 400 })

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

  // Cada página es un eCheq (puede venir uno por archivo o todos en un PDF).
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
    const leidos = await Promise.all(paginas.map(async (p) => leerEcheq(await textoPdf(p.bytes).catch(() => ''))))
    // Compiten las líneas que todavía no tienen PDF adjunto.
    const libres = lineas.filter((l) => !((l.meta.attachments as unknown[] | undefined)?.length))
    const reparto = repartirEcheqs(leidos, libres)
    return NextResponse.json({
      lineas: lineas.map((l) => ({
        id: l.id,
        monto: l.monto,
        fecha: l.fecha,
        conPdf: !!(l.meta.attachments as unknown[] | undefined)?.length,
      })),
      paginas: paginas.map((p, i) => ({
        archivo: p.archivo,
        pagina: p.pagina,
        nombre: p.nombre,
        numero: leidos[i]!.numero,
        ...reparto[i],
      })),
    })
  }

  let asignaciones: z.infer<typeof asignacionesSchema>
  try {
    asignaciones = asignacionesSchema.parse(JSON.parse(String(form.get('asignaciones') || '[]')))
  } catch {
    return NextResponse.json({ error: 'Asignaciones inválidas' }, { status: 400 })
  }
  const porId = new Map(lineas.map((l) => [l.id, l]))
  if (asignaciones.some((a) => !porId.has(a.metodoId))) {
    return NextResponse.json({ error: 'Algún eCheq no pertenece a la orden' }, { status: 400 })
  }
  if (new Set(asignaciones.map((a) => a.metodoId)).size !== asignaciones.length) {
    return NextResponse.json({ error: 'Un eCheq tiene más de un PDF asignado' }, { status: 400 })
  }

  const bucket = `axp-client-${cliente.cuit}`
  const ts = Date.now()
  let guardados = 0
  for (const a of asignaciones) {
    const pag = paginas.find((p) => p.archivo === a.archivo && p.pagina === a.pagina)
    const linea = porId.get(a.metodoId)
    if (!pag || !linea) continue
    const base = pag.nombre.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9.-]/g, '_')
    const key = `comprobantes/${pago.id}/echeq-${ts}-${base}-p${a.pagina + 1}.pdf`
    await uploadToR2(bucket, key, Buffer.from(pag.bytes), { pagoId: pago.id, metodoId: linea.id })

    const numero = leerEcheq(await textoPdf(pag.bytes).catch(() => '')).numero
    const adjuntos = ((linea.meta.attachments as Array<{ key: string; filename: string }> | undefined) ?? []).concat({
      key,
      filename: pag.nombre,
    })
    await prisma.pago_metodos.update({
      where: { id: linea.id },
      data: {
        meta: {
          ...(linea.meta as object),
          attachments: adjuntos,
          ...(!linea.meta.referencia && numero ? { referencia: numero } : {}),
        },
      },
    })
    guardados++
  }
  // Si ya están todos los eCheq con su PDF (y la transferencia, si la orden
  // también tiene una, con su comprobante), la orden emitida queda pagada.
  const actual = await cargarPago(user.clienteId, pago.id)
  const echeqs = actual ? lineasEcheq(actual) : []
  const completa =
    !!actual &&
    echeqs.every((l) => ((l.meta.attachments as unknown[] | undefined)?.length ?? 0) > 0) &&
    (!actual.pago_metodos.some((m) => m.tipo === 'TRANSFERENCIA') || !!actual.comprobanteKey)
  await prisma.pagos.update({
    where: { id: pago.id },
    data: { updatedAt: new Date(), ...(completa && pago.estado === 'EMITIDA' ? { estado: 'PAGADO' } : {}) },
  })

  return NextResponse.json({ guardados })
}

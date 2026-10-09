import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { diagnosticar, mediana, type Propuesta } from '@/lib/compras/revision-lineas'

export const dynamic = 'force-dynamic'

interface LineaDb {
  id: string
  linea: number
  descripcion: string
  unidad: string | null
  cantidad: number | null
  precio: number | null
  subtotal: number | null
  documento_id: string
  numero: string | null
  letra: string | null
  tipo: string
  fecha: string | null
  pdf_key: string | null
  proveedor_id: string | null
  proveedor: string | null
}

/**
 * Líneas de comprobante con números que no cierran, agrupadas por comprobante.
 *
 * El precio de referencia de cada item sale de sus propias compras sanas (las
 * que cierran y no tienen la cantidad en múltiplos de mil). Es lo que permite
 * decir si la corrección propuesta deja el precio donde siempre estuvo.
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.DOC_ITEMS)
  if (error) return error

  const sp = request.nextUrl.searchParams
  const proveedorId = sp.get('proveedorId') || ''
  const incluirRevisadas = sp.get('revisadas') === '1'
  // Por defecto no se muestran las diferencias que parecen descuentos de la
  // factura: son cientos y no hay nada que corregir en ellas.
  const incluirDescuentos = sp.get('descuentos') === '1'

  const lineas = await prisma.$queryRaw<LineaDb[]>`
    SELECT di.id, di.linea, di.descripcion, di.unidad,
           di.cantidad::float8 AS cantidad,
           di."precioUnitario"::float8 AS precio,
           di.subtotal::float8 AS subtotal,
           d.id AS documento_id, d."numeroCompleto" AS numero, d.letra::text AS letra,
           d.tipo::text AS tipo, to_char(d."fechaEmision", 'YYYY-MM-DD') AS fecha,
           COALESCE(d."pdfFinalKey", d."pdfRawKey") AS pdf_key,
           p.id AS proveedor_id, p."razonSocial" AS proveedor
      FROM documento_items di
      JOIN documentos d ON d.id = di."documentoId"
      LEFT JOIN proveedores p ON p.id = d."proveedorId"
     WHERE d."clienteId" = ${clienteId}::uuid
       AND d."estadoRevision"::text NOT IN ('ERROR', 'DUPLICADO')
       AND di.cantidad > 0
       AND di.subtotal IS NOT NULL
       AND (
         (di.cantidad::numeric % 1000 = 0 AND di.cantidad >= 1000)
         OR (di."precioUnitario" > 0
             AND abs(di.cantidad * di."precioUnitario" - di.subtotal) > greatest(abs(di.subtotal) * 0.01, 1))
       )
     ORDER BY d."fechaEmision" DESC NULLS LAST, di.linea
     LIMIT 1500
  `

  const filtradas = proveedorId ? lineas.filter((l) => l.proveedor_id === proveedorId) : lineas

  // Precio de referencia por descripción, calculado sólo con las líneas sanas.
  const sospechosas = new Set(filtradas.map((l) => l.id))
  const descripciones = [...new Set(filtradas.map((l) => l.descripcion))]
  const referencias = new Map<string, number | null>()

  if (descripciones.length > 0) {
    const sanas = await prisma.$queryRaw<Array<{ id: string; descripcion: string; precio: number }>>`
      SELECT di.id, di.descripcion, di."precioUnitario"::float8 AS precio
        FROM documento_items di
        JOIN documentos d ON d.id = di."documentoId"
       WHERE d."clienteId" = ${clienteId}::uuid
         AND d."estadoRevision"::text NOT IN ('ERROR', 'DUPLICADO')
         AND di."precioUnitario" > 0
         AND di.descripcion = ANY(${descripciones}::text[])
    `
    const porDescripcion = new Map<string, number[]>()
    for (const s of sanas) {
      if (sospechosas.has(s.id)) continue
      const xs = porDescripcion.get(s.descripcion) ?? []
      xs.push(s.precio)
      porDescripcion.set(s.descripcion, xs)
    }
    for (const desc of descripciones) referencias.set(desc, mediana(porDescripcion.get(desc) ?? []))
  }

  // Lo ya revisado queda fuera salvo que se pida verlo: si alguien miró el PDF
  // y la línea estaba bien (un descuento, por ejemplo), no tiene que volver a
  // aparecer en cada revisión.
  const aceptadas = new Set(
    (
      await prisma.$queryRaw<Array<{ lineaId: string }>>`
        SELECT "lineaId"::text AS "lineaId" FROM revision_lineas_ok WHERE "clienteId" = ${clienteId}::uuid
      `
    ).map((r) => r.lineaId)
  )

  const conDiagnostico = filtradas
    .map((l) => {
      const propuesta: Propuesta = diagnosticar(
        { cantidad: l.cantidad, precioUnitario: l.precio, subtotal: l.subtotal },
        referencias.get(l.descripcion) ?? null
      )
      return { linea: l, propuesta, referencia: referencias.get(l.descripcion) ?? null }
    })
    .filter((x) => x.propuesta.diagnostico !== 'ok')
    .filter((x) => incluirDescuentos || x.propuesta.diagnostico !== 'descuento_probable')
    .filter((x) => incluirRevisadas || !aceptadas.has(x.linea.id))

  // Agrupadas por comprobante, que es como se revisan: se abre el PDF una vez
  // y se resuelven todas las líneas de esa factura.
  const docs = new Map<string, {
    id: string; numero: string | null; letra: string | null; tipo: string; fecha: string | null
    pdfKey: string | null; proveedorId: string | null; proveedor: string | null
    lineas: Array<Record<string, unknown>>
  }>()

  for (const { linea: l, propuesta, referencia } of conDiagnostico) {
    if (!docs.has(l.documento_id)) {
      docs.set(l.documento_id, {
        id: l.documento_id,
        numero: l.numero,
        letra: l.letra,
        tipo: l.tipo,
        fecha: l.fecha,
        pdfKey: l.pdf_key,
        proveedorId: l.proveedor_id,
        proveedor: l.proveedor,
        lineas: [],
      })
    }
    docs.get(l.documento_id)!.lineas.push({
      id: l.id,
      linea: l.linea,
      descripcion: l.descripcion,
      unidad: l.unidad,
      cantidad: l.cantidad,
      precioUnitario: l.precio,
      subtotal: l.subtotal,
      referencia,
      diagnostico: propuesta.diagnostico,
      confianza: propuesta.confianza,
      motivo: propuesta.motivo,
      // La propuesta va aparte de lo guardado: la pantalla muestra las dos
      // columnas una al lado de la otra.
      propuestaCantidad: propuesta.cantidad,
      propuestaPrecio: propuesta.precioUnitario,
    })
  }

  const documentos = [...docs.values()]
  return NextResponse.json({
    documentos,
    totales: {
      lineas: conDiagnostico.length,
      documentos: documentos.length,
      altaConfianza: conDiagnostico.filter((x) => x.propuesta.confianza === 'alta').length,
    },
  })
}

/**
 * Aplica correcciones. Cada cambio queda en `documento_revisiones` con la
 * misma acción que una edición manual de la línea, así después se puede ver
 * qué se tocó y con qué valores estaba antes.
 *
 * `aceptar` marca líneas como revisadas sin cambiarlas: sirve para los
 * descuentos legítimos, que no hay que corregir pero tampoco volver a mirar.
 */
export async function POST(request: NextRequest) {
  const { user, clienteId, error } = await requireSeccion(SECCION.DOC_ITEMS, 'edit')
  if (error) return error
  if (!clienteId || !user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = (await request.json()) as {
    correcciones?: Array<{ id: string; cantidad?: number | null; precioUnitario?: number | null }>
    aceptar?: string[]
  }
  const correcciones = body.correcciones ?? []
  const aceptar = body.aceptar ?? []

  if (correcciones.length === 0 && aceptar.length === 0) {
    return NextResponse.json({ error: 'No hay nada para aplicar' }, { status: 400 })
  }

  const ids = [...correcciones.map((c) => c.id), ...aceptar]
  const actuales = await prisma.$queryRaw<Array<{
    id: string; linea: number; descripcion: string
    cantidad: number | null; precio: number | null; subtotal: number | null
    documento_id: string
  }>>`
    SELECT di.id, di.linea, di.descripcion,
           di.cantidad::float8 AS cantidad, di."precioUnitario"::float8 AS precio,
           di.subtotal::float8 AS subtotal, d.id AS documento_id
      FROM documento_items di
      JOIN documentos d ON d.id = di."documentoId"
     WHERE di.id = ANY(${ids}::uuid[]) AND d."clienteId" = ${clienteId}::uuid
  `
  const porId = new Map(actuales.map((a) => [a.id, a]))

  let cambiadas = 0
  for (const c of correcciones) {
    const antes = porId.get(c.id)
    if (!antes) continue
    const cantidad = c.cantidad ?? antes.cantidad
    const precio = c.precioUnitario ?? antes.precio
    if (cantidad === antes.cantidad && precio === antes.precio) continue

    await prisma.$executeRaw`
      UPDATE documento_items
         SET cantidad = ${cantidad}::numeric, "precioUnitario" = ${precio}::numeric
       WHERE id = ${c.id}::uuid
    `
    await prisma.$executeRaw`
      INSERT INTO documento_revisiones (id, "documentoId", "usuarioId", accion, path, before, after, "createdAt")
      VALUES (gen_random_uuid(), ${antes.documento_id}::uuid, ${user.id}::uuid, 'EDIT_ITEM',
              ${`items.${antes.linea}`},
              ${JSON.stringify({ cantidad: antes.cantidad, precioUnitario: antes.precio })}::jsonb,
              ${JSON.stringify({ cantidad, precioUnitario: precio, origen: 'revision-lineas' })}::jsonb,
              now())
    `
    cambiadas++
  }

  for (const id of aceptar) {
    if (!porId.has(id)) continue
    await prisma.$executeRaw`
      INSERT INTO revision_lineas_ok ("lineaId", "clienteId", "usuarioId")
      VALUES (${id}::uuid, ${clienteId}::uuid, ${user.id}::uuid)
      ON CONFLICT ("lineaId") DO NOTHING
    `
  }

  return NextResponse.json({ cambiadas, aceptadas: aceptar.length })
}

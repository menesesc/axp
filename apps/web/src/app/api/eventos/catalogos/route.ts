import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { catalogosDe, configuracionDe, entero, esUuid, mensajeError, salonesDe, texto } from '@/lib/eventos/db'

export const dynamic = 'force-dynamic'

/**
 * Lo que todas las pantallas del módulo necesitan para armar sus selects:
 * orígenes y tipos de evento (configurables), umbrales de las alertas,
 * salones y mesas del POS, y la gente de la empresa (responsables de la
 * agenda). Cambia poco; las pantallas lo cachean.
 */
export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS)
  if (error) return error
  const [catalogos, configuracion, salones, usuarios] = await Promise.all([
    catalogosDe(clienteId!),
    configuracionDe(clienteId!),
    salonesDe(clienteId!),
    prisma.$queryRaw<Array<{ id: string; nombre: string }>>`
      SELECT id, nombre FROM usuarios WHERE "clienteId" = ${clienteId}::uuid AND activo ORDER BY nombre
    `,
  ])
  return NextResponse.json({ catalogos, configuracion, salones, usuarios })
}

/** Alta de un origen o tipo de evento. La clave sale del nombre. */
export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const lista = b?.lista === 'ORIGEN' || b?.lista === 'TIPO_EVENTO' ? b.lista : null
  const nombre = texto(b?.nombre, 80)
  if (!lista || !nombre) return NextResponse.json({ error: 'Poné un nombre' }, { status: 400 })
  const clave = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40)
  if (!clave) return NextResponse.json({ error: 'Nombre inválido' }, { status: 400 })
  try {
    await prisma.$executeRaw`
      INSERT INTO evento_catalogos ("clienteId", lista, clave, nombre, color, orden)
      VALUES (${clienteId}::uuid, ${lista}, ${clave}, ${nombre}, ${texto(b?.color, 9)},
              (SELECT COALESCE(max(orden), 0) + 1 FROM evento_catalogos WHERE "clienteId" = ${clienteId}::uuid AND lista = ${lista}))
      ON CONFLICT ("clienteId", lista, clave) DO UPDATE SET activo = true, nombre = EXCLUDED.nombre
    `
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}

/** Renombrar, colorear o desactivar un ítem; o cambiar los umbrales de las alertas. */
export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ error: 'Faltan los datos' }, { status: 400 })

  if (b.configuracion && typeof b.configuracion === 'object') {
    const c = b.configuracion as Record<string, unknown>
    const dias = entero(c.diasPresupuesto)
    const aviso = Math.round(Number(c.diasAvisoVencimiento))
    const cupo = entero(c.avisoCupoPct)
    await configuracionDe(clienteId!)
    try {
      await prisma.$executeRaw`
        UPDATE evento_configuracion SET
          "diasPresupuesto"      = ${dias || 7}::smallint,
          "diasAvisoVencimiento" = ${Number.isFinite(aviso) && aviso >= 0 ? aviso : 3}::smallint,
          "avisoCupoPct"         = ${cupo || 90}::smallint,
          "updatedAt"            = now()
        WHERE "clienteId" = ${clienteId}::uuid
      `
      return NextResponse.json({ ok: true })
    } catch (e) {
      return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
    }
  }

  if (!esUuid(b.id)) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })
  await prisma.$executeRaw`
    UPDATE evento_catalogos SET
      nombre = COALESCE(${texto(b.nombre, 80)}, nombre),
      color  = CASE WHEN ${'color' in b} THEN ${texto(b.color, 9)} ELSE color END,
      activo = COALESCE(${typeof b.activo === 'boolean' ? b.activo : null}::boolean, activo)
    WHERE id = ${b.id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  return NextResponse.json({ ok: true })
}

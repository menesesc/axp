import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import type { Regimen } from '@/lib/eventos/constantes'
import { auditar, esUuid, eventoBase, mensajeError, reservaFila, reservaPropia } from '@/lib/eventos/db'
import { adicionalesDe, guardarOpcionesElegidas, leerOpcionesElegidas, menuSinImportes, menusDetalle, opcionesElegidas } from '@/lib/eventos/menus'
import { PASO_TEXTO } from '@/lib/eventos/menu'
import { versionesDe } from '@/lib/eventos/presupuesto-db'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Pestaña Menú de la reserva: el menú que vale (el propio o el del evento),
 * el de cada régimen, los adicionales (propios y heredados) y las versiones
 * del presupuesto. El valor de carta y la comparación se calculan en la
 * pantalla con `menu.ts`, para que se muevan en vivo al editar.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { clienteId, verImportes, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS)
  if (error) return error
  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const [r, p] = await Promise.all([reservaFila(clienteId!, id), reservaPropia(id)])
  if (!r || !p) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const ev = r.eventoId ? await eventoBase(clienteId!, r.eventoId) : null

  const [regs, regEvento, adicionales, versiones, elegidas] = await Promise.all([
    prisma.$queryRaw<Array<{ tipo: Regimen; cantidad: number; nota: string | null; menuId: string | null }>>`
      SELECT tipo, sum(cantidad)::int AS cantidad, string_agg(nota, ' · ') AS nota, max("menuId"::text) AS "menuId"
        FROM reserva_regimenes WHERE "reservaId" = ${id}::uuid GROUP BY tipo ORDER BY tipo
    `,
    ev
      ? prisma.$queryRaw<Array<{ tipo: Regimen; nota: string | null; menuId: string | null }>>`
          SELECT tipo, nota, "menuId" FROM evento_regimen_menus WHERE "eventoId" = ${ev.id}::uuid
        `
      : Promise.resolve([]),
    adicionalesDe({ reservaId: id }),
    versionesDe(clienteId!, { reservaId: id }),
    opcionesElegidas([id]),
  ])
  const delEvento = new Map(regEvento.map((g) => [g.tipo, g]))
  const menus = await menusDetalle(
    clienteId!,
    [p.menuId ?? '', ev?.menuId ?? '', ...regs.flatMap((g) => [g.menuId ?? '', delEvento.get(g.tipo)?.menuId ?? ''])],
    verImportes
  )
  const m = (x: string | null | undefined) => {
    const v = x ? menus.get(x) ?? null : null
    return verImportes ? v : menuSinImportes(v)
  }

  return NextResponse.json({
    menu: m(p.menuId ?? ev?.menuId),
    heredado: !p.menuId && !!ev?.menuId,
    menuEvento: ev?.menuId ? { id: ev.menuId, nombre: menus.get(ev.menuId)?.nombre ?? '' } : null,
    eventoId: r.eventoId,
    grupo: { adultos: r.adultos, menores: r.menores, bebes: r.bebes, liberados: r.liberados },
    precios: verImportes
      ? { adulto: p.precioAdulto, menor: p.precioMenor, ivaModo: p.ivaModo, ivaAlicuota: p.ivaAlicuota }
      : { adulto: 0, menor: 0, ivaModo: p.ivaModo, ivaAlicuota: p.ivaAlicuota },
    regimenes: regs.map((g) => ({
      tipo: g.tipo,
      cantidad: g.cantidad,
      nota: g.nota,
      notaEvento: delEvento.get(g.tipo)?.nota ?? null,
      menu: m(g.menuId ?? delEvento.get(g.tipo)?.menuId),
      heredado: !g.menuId && !!delEvento.get(g.tipo)?.menuId,
    })),
    /** Cuántos eligen cada opción del menú (puede estar vacío). */
    elegidas: elegidas.get(id) ?? [],
    adicionales: verImportes ? adicionales : adicionales.map((a) => ({ ...a, precioUnitario: 0 })),
    totales: verImportes ? { adicionales: p.adicionales, adicionalesPasajero: p.adicionalesPasajero, total: r.total } : null,
    versiones: versiones.map((v) => ({ ...v, total: verImportes ? v.total : null })),
    verImportes,
  })
}

/**
 * Cuántos eligen cada opción del menú ("12 bife / 8 pasta"). Se carga cuando
 * el cliente confirma, como los regímenes; la cocina cuenta con esto. No
 * tiene por qué sumar las personas: si no cierra, la pantalla y la cocina
 * avisan.
 */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const { user, clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const l = leerOpcionesElegidas(b?.opciones)
  if ('error' in l) return NextResponse.json({ error: l.error }, { status: 400 })

  try {
    const ok = await prisma.$transaction(async (tx) => {
      const [r] = await tx.$queryRaw<Array<{ eventoId: string | null }>>`
        SELECT "eventoId" FROM reservas WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid FOR UPDATE
      `
      if (!r) return false
      const antes = await tx.$queryRaw<Array<{ paso: string; nombre: string; cantidad: number }>>`
        SELECT paso, nombre, cantidad FROM reserva_menu_opciones WHERE "reservaId" = ${id}::uuid ORDER BY paso, nombre
      `
      await guardarOpcionesElegidas(tx, id, l.opciones)
      const txt = (xs: Array<{ paso: string; nombre: string; cantidad: number }>) =>
        xs.map((o) => `${o.cantidad} ${o.nombre}`).join(', ') || 'sin cargar'
      const pasos = [...new Set(l.opciones.map((o) => PASO_TEXTO[o.paso]))].join(', ')
      await auditar(tx, {
        clienteId: clienteId!,
        eventoId: r.eventoId,
        reservaId: id,
        accion: 'opciones',
        descripcion: `Opciones elegidas${pasos ? ` (${pasos})` : ''}: ${txt(antes)} → ${txt(l.opciones)}`,
        antes,
        despues: l.opciones,
        user,
      })
      return true
    })
    if (!ok) return NextResponse.json({ error: 'No existe' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[reservas] opciones', e)
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}

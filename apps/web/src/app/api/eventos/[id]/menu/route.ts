import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { REGIMEN_TEXTO, type Regimen } from '@/lib/eventos/constantes'
import { esUuid, eventoBase, listarReservas } from '@/lib/eventos/db'
import { adicionalesDe, menuSinImportes, menusDetalle } from '@/lib/eventos/menus'
import { PASO_TEXTO, cantidadesCocina, porcionTexto, type Paso } from '@/lib/eventos/menu'
import { versionesDe } from '@/lib/eventos/presupuesto-db'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Pestaña Menú del evento: su menú, los regímenes (lo definido para el
 * evento y cuántos pidió cada reserva), los adicionales que heredan todas
 * las reservas y lo que tiene que preparar la cocina.
 *
 * Cocina: cada reserva come de su menú (el propio o el del evento) y las
 * porciones compartidas se cuentan por reserva, porque cada mesa recibe su
 * picada: dos grupos de 3 son 2 picadas para 4, no 2 de 6 personas juntas.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { clienteId, verImportes, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS)
  if (error) return error
  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const ev = await eventoBase(clienteId!, id)
  if (!ev) return NextResponse.json({ error: 'No existe' }, { status: 404 })

  const [reservas, regEvento, adicionales, versiones, propios] = await Promise.all([
    listarReservas(clienteId!, { eventoId: id }),
    prisma.$queryRaw<Array<{ tipo: Regimen; nota: string | null; menuId: string | null }>>`
      SELECT tipo, nota, "menuId" FROM evento_regimen_menus WHERE "eventoId" = ${id}::uuid ORDER BY tipo
    `,
    adicionalesDe({ eventoId: id }),
    versionesDe(clienteId!, { eventoId: id }),
    prisma.$queryRaw<Array<{ id: string; menuId: string | null; regimenes: Array<{ tipo: Regimen; menuId: string | null }> }>>`
      SELECT r.id, r."menuId",
             COALESCE((SELECT json_agg(json_build_object('tipo', g.tipo, 'menuId', g."menuId"))
                         FROM reserva_regimenes g WHERE g."reservaId" = r.id), '[]') AS regimenes
        FROM reservas r WHERE r."eventoId" = ${id}::uuid AND r.estado <> 'CANCELADO'
    `,
  ])
  const activas = reservas.filter((r) => r.estado !== 'CANCELADO')
  const menuDe = new Map(propios.map((p) => [p.id, p.menuId]))
  const menus = await menusDetalle(
    clienteId!,
    [ev.menuId ?? '', ...regEvento.map((g) => g.menuId ?? ''), ...propios.map((p) => p.menuId ?? '')],
    verImportes
  )
  const m = (x: string | null | undefined) => {
    const v = x ? menus.get(x) ?? null : null
    return verImportes ? v : menuSinImportes(v)
  }

  // Cocina: unidades por menú y por ítem, sumando reserva por reserva.
  const cocina = new Map<string, { menu: string; propio: boolean; reservas: number; adultos: number; menores: number; items: Map<string, { paso: Paso; texto: string; porcion: string; unidades: number }> }>()
  let sinMenu = 0
  for (const r of activas) {
    const mid = menuDe.get(r.id) ?? ev.menuId
    const menu = mid ? menus.get(mid) : undefined
    if (!menu) {
      sinMenu++
      continue
    }
    const g = { adultos: r.adultos + r.liberados, menores: r.menores }
    let c = cocina.get(menu.id)
    if (!c) {
      c = { menu: menu.nombre, propio: menu.id !== ev.menuId, reservas: 0, adultos: 0, menores: 0, items: new Map() }
      cocina.set(menu.id, c)
    }
    c.reservas++
    c.adultos += g.adultos
    c.menores += g.menores
    for (const x of cantidadesCocina(menu.items, g)) {
      if (!x.unidades) continue
      const k = `${x.item.paso}|${x.item.nombre}|${x.item.modo}|${x.item.personasPorUnidad}`
      const it = c.items.get(k)
      if (it) it.unidades += x.unidades
      else c.items.set(k, { paso: x.item.paso, texto: x.item.nombre, porcion: porcionTexto(x.item), unidades: x.unidades })
    }
  }

  // Regímenes: lo definido para el evento y cuántos hay, con qué menú come cada uno.
  const tipos = new Map<Regimen, { cantidad: number; reservas: Array<{ id: string; numero: number; nombre: string; cantidad: number; nota: string | null; menuPropio: string | null }> }>()
  for (const r of activas) {
    const propiosR = propios.find((p) => p.id === r.id)?.regimenes ?? []
    for (const g of r.regimenes) {
      const t = tipos.get(g.tipo) ?? { cantidad: 0, reservas: [] }
      t.cantidad += g.cantidad
      const menuPropio = propiosR.find((x) => x.tipo === g.tipo)?.menuId
      t.reservas.push({ id: r.id, numero: r.numero, nombre: r.nombre, cantidad: g.cantidad, nota: g.nota, menuPropio: menuPropio ? menus.get(menuPropio)?.nombre ?? null : null })
      tipos.set(g.tipo, t)
    }
  }
  for (const g of regEvento) if (!tipos.has(g.tipo)) tipos.set(g.tipo, { cantidad: 0, reservas: [] })

  return NextResponse.json({
    menu: m(ev.menuId),
    precios: verImportes
      ? { adulto: ev.precioAdulto, menor: ev.precioMenor, ivaModo: ev.ivaModo, ivaAlicuota: ev.ivaAlicuota }
      : { adulto: 0, menor: 0, ivaModo: ev.ivaModo, ivaAlicuota: ev.ivaAlicuota },
    regimenes: [...tipos.entries()].map(([tipo, t]) => {
      const d = regEvento.find((g) => g.tipo === tipo)
      return { tipo, texto: REGIMEN_TEXTO[tipo], cantidad: t.cantidad, reservas: t.reservas, nota: d?.nota ?? null, menu: m(d?.menuId) }
    }),
    adicionales: verImportes ? adicionales : adicionales.map((a) => ({ ...a, precioUnitario: 0 })),
    cocina: {
      reservas: activas.length,
      sinMenu,
      menus: [...cocina.values()].map((c) => ({
        ...c,
        items: [...c.items.values()].map((i) => ({ ...i, pasoTexto: PASO_TEXTO[i.paso] })),
      })),
    },
    versiones: versiones.map((v) => ({ ...v, total: verImportes ? v.total : null })),
    verImportes,
  })
}

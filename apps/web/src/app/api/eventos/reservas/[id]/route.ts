import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { esAdminUsuario, requireSeccion } from '@/lib/auth'
import { SECCION, cumple, veImportes } from '@/lib/permisos'
import { hoyAR } from '@/lib/fechas'
import { REGIMEN_TEXTO, calcularPlan } from '@/lib/eventos/constantes'
import {
  CupoExcedido,
  agendaDe,
  auditar,
  auditoriaDe,
  configuracionDe,
  cuotasDe,
  diferencias,
  esUuid,
  eventoBase,
  guardarMesas,
  guardarRegimenes,
  mensajeError,
  pagosDe,
  reservaFila,
  reservaPropia,
  respuestaCupo,
  verificarCupo,
  verificarPropios,
  type Tx,
} from '@/lib/eventos/db'
import { leerReserva } from '@/lib/eventos/entrada'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** Ficha completa de la reserva. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { user, clienteId, verImportes, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS)
  if (error) return error
  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'No existe' }, { status: 404 })

  const reserva = await reservaFila(clienteId!, id)
  if (!reserva) return NextResponse.json({ error: 'No existe' }, { status: 404 })

  const sujeto = { esAdmin: esAdminUsuario(user), permisos: user?.permisos }
  const verCobros = cumple(sujeto, SECCION.EVENTOS_COBROS, 'view') && veImportes(sujeto, SECCION.EVENTOS_COBROS)
  const puedeCobrar = cumple(sujeto, SECCION.EVENTOS_COBROS, 'edit')

  const [propia, cuotas, pagos, auditoria, agenda, cfg, evento] = await Promise.all([
    reservaPropia(id),
    cuotasDe([id]),
    verCobros ? pagosDe(id) : Promise.resolve([]),
    auditoriaDe(clienteId!, { reservaId: id }),
    agendaDe(clienteId!, { reservaId: id }),
    configuracionDe(clienteId!),
    reserva.eventoId ? eventoBase(clienteId!, reserva.eventoId) : Promise.resolve(null),
  ])
  const plan = calcularPlan(cuotas.get(id) ?? [], reserva.total, reserva.cobrado, hoyAR(), cfg.diasAvisoVencimiento)

  if (!verImportes) {
    return NextResponse.json({
      reserva: { ...reserva, total: 0, cobrado: 0, saldo: 0 },
      propia: propia && {
        ...propia,
        precioAdultoPropio: null,
        precioMenorPropio: null,
        precioLiberado: null,
        descuento: 0,
        precioAdulto: 0,
        precioMenor: 0,
        neto: 0,
        iva: 0,
        adicionales: 0,
        adicionalesPasajero: 0,
        adicionalesLineas: [],
      },
      plan: plan.map((c) => ({ ...c, monto: null, importe: 0, imputado: 0, pendiente: 0 })),
      pagos: [],
      auditoria,
      agenda,
      evento: evento && { ...evento, precioAdulto: 0, precioMenor: 0, senaMonto: null },
      verImportes,
      verCobros: false,
      puedeCobrar: false,
    })
  }
  return NextResponse.json({ reserva, propia, plan, pagos, auditoria, agenda, evento, verImportes, verCobros, puedeCobrar })
}

interface Antes {
  eventoId: string | null
  titularId: string | null
  nombre: string
  contactoNombre: string | null
  contactoTelefono: string | null
  contactoEmail: string | null
  fecha: string
  hora: string | null
  sectorId: string | null
  adultos: number
  menores: number
  bebes: number
  liberados: number
  precioAdulto: number | null
  precioMenor: number | null
  precioLiberado: number | null
  ivaModo: string | null
  ivaAlicuota: number | null
  descuento: number
  descuentoNota: string | null
  estado: string
  origen: string | null
  mesaInamovible: boolean
  observaciones: string | null
  notaServicio: string | null
  numero: number
}

const GRUPOS: Array<{ accion: string; etiquetas: Partial<Record<keyof Antes, string>> }> = [
  {
    accion: 'editada',
    etiquetas: {
      nombre: 'Nombre',
      contactoNombre: 'Contacto',
      contactoTelefono: 'Teléfono',
      contactoEmail: 'Email',
      fecha: 'Fecha',
      hora: 'Hora',
      origen: 'Origen',
      observaciones: 'Observaciones',
      notaServicio: 'Nota de servicio',
    },
  },
  { accion: 'personas', etiquetas: { adultos: 'Adultos', menores: 'Menores', bebes: 'Bebés', liberados: 'Liberados' } },
  {
    accion: 'precios',
    etiquetas: {
      precioAdulto: 'Precio adulto',
      precioMenor: 'Precio menor',
      precioLiberado: 'Precio liberado',
      ivaModo: 'IVA',
      ivaAlicuota: 'Alícuota',
      descuento: 'Descuento',
      descuentoNota: 'Motivo del descuento',
    },
  },
]

/** Nombre legible de una referencia, para la auditoría. */
async function nombreRef(tx: Tx, tabla: 'eventos' | 'evento_clientes' | 'pos_sectores', id: string | null) {
  if (!id) return null
  const filas =
    tabla === 'eventos'
      ? await tx.$queryRaw<Array<{ n: string }>>`SELECT nombre AS n FROM eventos WHERE id = ${id}::uuid`
      : tabla === 'evento_clientes'
        ? await tx.$queryRaw<Array<{ n: string }>>`SELECT nombre AS n FROM evento_clientes WHERE id = ${id}::uuid`
        : await tx.$queryRaw<Array<{ n: string }>>`SELECT nombre AS n FROM pos_sectores WHERE id = ${id}::uuid`
  return filas[0]?.n ?? '?'
}

/**
 * Edición. Cada grupo de cambios (datos, personas, precios, mesas,
 * regímenes) deja su propia línea en la línea de tiempo, en la misma
 * transacción: "Adultos: 6 → 8" se lee mejor solo que mezclado con un cambio
 * de teléfono.
 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { user, clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const r = leerReserva(body, false)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
  const d = r.datos
  const forzar = body?.forzarCupo === true
  const tiene = (k: keyof typeof d) => k in d

  try {
    const ok = await prisma.$transaction(async (tx) => {
      const [antes] = await tx.$queryRaw<Antes[]>`
        SELECT "eventoId", "titularId", nombre, "contactoNombre", "contactoTelefono", "contactoEmail",
               to_char(fecha, 'YYYY-MM-DD') AS fecha, to_char(hora, 'HH24:MI') AS hora, "sectorId",
               adultos, menores, bebes, liberados,
               "precioAdulto"::float8 AS "precioAdulto", "precioMenor"::float8 AS "precioMenor",
               "precioLiberado"::float8 AS "precioLiberado", "ivaModo", "ivaAlicuota"::float8 AS "ivaAlicuota",
               descuento::float8 AS descuento, "descuentoNota", estado, origen, "mesaInamovible",
               observaciones, "notaServicio", numero
          FROM reservas WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid
         FOR UPDATE
      `
      if (!antes) return false
      await verificarPropios(tx, clienteId!, { titularId: d.titularId, sectorId: d.sectorId })

      const eventoId = tiene('eventoId') ? d.eventoId ?? null : antes.eventoId
      if (eventoId && eventoId !== antes.eventoId && !(await eventoBase(clienteId!, eventoId, tx))) throw new Error('EVENTO')

      // Cupo: sólo si la reserva ocupa lugar y crece, o cambia de evento.
      const personasAntes = antes.adultos + antes.menores + antes.bebes + antes.liberados
      const personas =
        (d.adultos ?? antes.adultos) + (d.menores ?? antes.menores) + (d.bebes ?? antes.bebes) + (d.liberados ?? antes.liberados)
      if (personas === 0) throw new Error('PERSONAS')
      let exceso: { cupo: number; ocupado: number } | null = null
      if (eventoId && antes.estado !== 'CANCELADO' && (personas > personasAntes || eventoId !== antes.eventoId)) {
        exceso = await verificarCupo(tx, eventoId, id, personas, forzar)
      }

      await tx.$executeRaw`
        UPDATE reservas SET
          "eventoId"         = ${eventoId}::uuid,
          "titularId"        = CASE WHEN ${tiene('titularId')} THEN ${d.titularId ?? null}::uuid ELSE "titularId" END,
          nombre             = COALESCE(${d.nombre ?? null}, nombre),
          "contactoNombre"   = CASE WHEN ${tiene('contactoNombre')} THEN ${d.contactoNombre ?? null} ELSE "contactoNombre" END,
          "contactoTelefono" = CASE WHEN ${tiene('contactoTelefono')} THEN ${d.contactoTelefono ?? null} ELSE "contactoTelefono" END,
          "contactoEmail"    = CASE WHEN ${tiene('contactoEmail')} THEN ${d.contactoEmail ?? null} ELSE "contactoEmail" END,
          fecha              = COALESCE(${d.fecha ?? null}::date, fecha),
          hora               = CASE WHEN ${tiene('hora')} THEN ${d.hora ?? null}::time ELSE hora END,
          "sectorId"         = CASE WHEN ${tiene('sectorId')} THEN ${d.sectorId ?? null}::uuid ELSE "sectorId" END,
          adultos            = COALESCE(${d.adultos ?? null}::int, adultos),
          menores            = COALESCE(${d.menores ?? null}::int, menores),
          bebes              = COALESCE(${d.bebes ?? null}::int, bebes),
          liberados          = COALESCE(${d.liberados ?? null}::int, liberados),
          "precioAdulto"     = CASE WHEN ${tiene('precioAdulto')} THEN ${d.precioAdulto ?? null}::numeric ELSE "precioAdulto" END,
          "precioMenor"      = CASE WHEN ${tiene('precioMenor')} THEN ${d.precioMenor ?? null}::numeric ELSE "precioMenor" END,
          "precioLiberado"   = CASE WHEN ${tiene('precioLiberado')} THEN ${d.precioLiberado ?? null}::numeric ELSE "precioLiberado" END,
          "ivaModo"          = CASE WHEN ${tiene('ivaModo')} THEN ${d.ivaModo ?? null} ELSE "ivaModo" END,
          "ivaAlicuota"      = CASE WHEN ${tiene('ivaAlicuota')} THEN ${d.ivaAlicuota ?? null}::numeric ELSE "ivaAlicuota" END,
          descuento          = COALESCE(${d.descuento ?? null}::numeric, descuento),
          "descuentoNota"    = CASE WHEN ${tiene('descuentoNota')} THEN ${d.descuentoNota ?? null} ELSE "descuentoNota" END,
          origen             = CASE WHEN ${tiene('origen')} THEN ${d.origen ?? null} ELSE origen END,
          "mesaInamovible"   = COALESCE(${d.mesaInamovible ?? null}::boolean, "mesaInamovible"),
          observaciones      = CASE WHEN ${tiene('observaciones')} THEN ${d.observaciones ?? null} ELSE observaciones END,
          "notaServicio"     = CASE WHEN ${tiene('notaServicio')} THEN ${d.notaServicio ?? null} ELSE "notaServicio" END,
          "updatedAt"        = now()
        WHERE id = ${id}::uuid
      `

      const base = { clienteId: clienteId!, eventoId, reservaId: id, user }
      const despues = d as Partial<Antes>

      for (const g of GRUPOS) {
        const dif = diferencias(antes, despues, g.etiquetas)
        if (dif.hay) await auditar(tx, { ...base, accion: g.accion, descripcion: dif.texto, antes: dif.antes, despues: dif.despues })
      }

      // Referencias: se auditan por nombre.
      const refs: Array<[keyof Antes, 'eventos' | 'evento_clientes' | 'pos_sectores', string]> = [
        ['eventoId', 'eventos', 'Evento'],
        ['titularId', 'evento_clientes', 'Cliente'],
        ['sectorId', 'pos_sectores', 'Salón'],
      ]
      for (const [k, tabla, etiqueta] of refs) {
        if (!(k in despues) || (despues[k] ?? null) === antes[k]) continue
        const viejo = await nombreRef(tx, tabla, antes[k] as string | null)
        const nuevo = await nombreRef(tx, tabla, (despues[k] as string | null) ?? null)
        await auditar(tx, {
          ...base,
          accion: k === 'eventoId' ? 'evento' : 'editada',
          descripcion: `${etiqueta}: ${viejo ?? '—'} → ${nuevo ?? '—'}`,
          antes: { [k]: antes[k] },
          despues: { [k]: despues[k] ?? null },
        })
      }

      if (d.mesaIds) {
        const viejas = await tx.$queryRaw<Array<{ nombre: string }>>`
          SELECT m.nombre FROM reserva_mesas rm JOIN pos_mesas m ON m.id = rm."mesaId" WHERE rm."reservaId" = ${id}::uuid
        `
        const antesMesas = viejas.map((m) => m.nombre).sort()
        const nuevas = await guardarMesas(tx, clienteId!, id, d.mesaIds)
        if (JSON.stringify(antesMesas) !== JSON.stringify(nuevas)) {
          await auditar(tx, {
            ...base,
            accion: 'mesas',
            descripcion: `Mesas: ${antesMesas.join(', ') || '—'} → ${nuevas.join(', ') || '—'}`,
            antes: antesMesas,
            despues: nuevas,
          })
        }
      }
      if (tiene('mesaInamovible') && d.mesaInamovible !== antes.mesaInamovible) {
        await auditar(tx, {
          ...base,
          accion: 'mesas',
          descripcion: d.mesaInamovible ? 'Mesa marcada como inamovible' : 'La mesa ya no es inamovible',
          antes: { mesaInamovible: antes.mesaInamovible },
          despues: { mesaInamovible: d.mesaInamovible },
        })
      }

      if (d.regimenes) {
        const viejos = await tx.$queryRaw<Array<{ tipo: string; cantidad: number; nota: string | null }>>`
          SELECT tipo, cantidad, nota FROM reserva_regimenes WHERE "reservaId" = ${id}::uuid ORDER BY tipo
        `
        await guardarRegimenes(tx, id, d.regimenes)
        const texto = (xs: Array<{ tipo: string; cantidad: number; nota: string | null }>) =>
          xs
            .map((g) => `${g.cantidad} ${REGIMEN_TEXTO[g.tipo as keyof typeof REGIMEN_TEXTO]?.toLowerCase() ?? g.tipo}${g.nota ? ` (${g.nota})` : ''}`)
            .sort()
            .join(', ') || 'ninguno'
        const a = texto(viejos)
        const b = texto(d.regimenes)
        if (a !== b) await auditar(tx, { ...base, accion: 'regimenes', descripcion: `Regímenes: ${a} → ${b}`, antes: viejos, despues: d.regimenes })
      }

      if (exceso) {
        await auditar(tx, {
          ...base,
          accion: 'cupo_excedido',
          descripcion: `Se pasó el cupo con confirmación: había ${exceso.ocupado} de ${exceso.cupo} y la reserva quedó con ${personas}`,
          despues: { ...exceso, personas },
        })
      }
      return true
    })
    if (!ok) return NextResponse.json({ error: 'No existe' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof CupoExcedido) return NextResponse.json(respuestaCupo(e), { status: 409 })
    if (e instanceof Error && e.message === 'PERSONAS') return NextResponse.json({ error: 'La reserva necesita al menos una persona' }, { status: 400 })
    if (e instanceof Error && e.message === 'EVENTO') return NextResponse.json({ error: 'El evento no existe' }, { status: 404 })
    if (e instanceof Error && e.message === 'REF') return NextResponse.json({ error: 'El cliente o el salón no son válidos' }, { status: 400 })
    console.error('[reservas] edición', e)
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}

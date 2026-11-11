import { prisma } from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth'
import { hoyAR } from '@/lib/fechas'
import { REGIMEN_TEXTO, calcularPlan, calcularTotal, cuotasDeRegla, dadaDeBaja, type CuotaDef, type Regimen } from './constantes'
import { configuracionDe, cuotasDe, eventoBase, listarReservas, nombreDe, reservaFila, reservaPropia, type Tx } from './db'
import { adicionalesDe, menusDetalle, type MenuDetalle } from './menus'
import { PASO_TEXTO, bloquesDePaso, cantidadAdicional, itemTexto, modalidadTexto, porPaso, type Adicional, type ItemMenu } from './menu'
import type { PresupuestoDatos } from './presupuesto'

/**
 * Arma el presupuesto de una reserva o de un evento a partir de lo que hay
 * hoy en la base, y guarda las versiones.
 *
 * Los totales de una reserva salen de `reserva_totales`, no de una cuenta
 * propia: el presupuesto tiene que decir lo mismo que la ficha y el saldo.
 */

interface Opciones {
  /** Los regímenes no van por defecto: casi siempre se definen después de confirmar. */
  regimenes: boolean
  verImportes: boolean
}

async function casaDe(clienteId: string) {
  const [cfg, [c]] = await Promise.all([
    configuracionDe(clienteId),
    prisma.$queryRaw<Array<{ razonSocial: string | null; conLogo: boolean }>>`
      SELECT "razonSocial", "logoKey" IS NOT NULL AS "conLogo" FROM clientes WHERE id = ${clienteId}::uuid
    `,
  ])
  return {
    casa: { nombre: cfg.nombreCasa?.trim() || c?.razonSocial || 'Presupuesto', pie: cfg.presupuestoPie, validezDias: cfg.presupuestoValidezDias },
    conLogo: !!c?.conLogo,
  }
}

async function tipoEventoNombre(clienteId: string, clave: string) {
  const [t] = await prisma.$queryRaw<Array<{ nombre: string }>>`
    SELECT nombre FROM evento_catalogos WHERE "clienteId" = ${clienteId}::uuid AND lista = 'TIPO_EVENTO' AND clave = ${clave}
  `
  return t?.nombre ?? null
}

function menuPresupuesto(m: MenuDetalle | null | undefined): PresupuestoDatos['menu'] {
  if (!m || m.items.length === 0) return null
  return {
    nombre: m.nombre,
    descripcion: m.descripcion,
    pasos: porPaso(m.items).map((g) => {
      const bloques = bloquesDePaso(g.items)
      const soloOpciones = bloques.length === 1 && bloques[0]!.grupo != null
      return {
        paso: g.paso,
        titulo: `${PASO_TEXTO[g.paso]}${soloOpciones ? ' (a elección)' : ''}`,
        items: bloques.map((b) => {
          if (b.grupo == null) {
            const i = b.items[0]!
            return { texto: itemTexto(i), descripcion: i.descripcion, aplica: i.aplica, compartido: i.modo === 'COMPARTIDO', opciones: null }
          }
          const opciones = b.items.map((i) => itemTexto(i))
          const aplica = b.items.every((i) => i.aplica === b.items[0]!.aplica) ? b.items[0]!.aplica : 'TODOS'
          const descripciones = b.items.map((i) => i.descripcion).filter(Boolean)
          return {
            texto: opciones.join(' o '),
            descripcion: descripciones.length ? descripciones.join(' · ') : null,
            aplica,
            compartido: b.items.some((i) => i.modo === 'COMPARTIDO'),
            opciones,
          }
        }),
      }
    }),
  }
}

/** Los ítems de un menú en texto, con las opciones juntas: "Bife o Sorrentinos". */
function textosMenu(items: ItemMenu[]) {
  return porPaso(items).flatMap((g) => bloquesDePaso(g.items).map((b) => b.items.map((i) => itemTexto(i)).join(' o ')))
}

function horario(desde: string | null, hasta: string | null) {
  if (!desde) return null
  return hasta ? `${desde} a ${hasta}` : desde
}

function cuotasPresupuesto(defs: CuotaDef[], total: number | null) {
  if (total == null) return defs.map((c) => ({ concepto: c.concepto, importe: c.monto, porcentaje: c.porcentaje, vencimiento: c.vencimiento }))
  // Lo cobrado no cuenta: el presupuesto dice cuánto vale cada cuota, no cuánto falta.
  return calcularPlan(defs, total, 0, hoyAR(), 0).map((c) => ({
    concepto: c.concepto,
    importe: c.importe,
    porcentaje: c.porcentaje,
    vencimiento: c.vencimiento,
  }))
}

/**
 * Adicionales del titular como líneas del total, y los de cada pasajero
 * aparte. `veces`: en un evento, un monto fijo se cobra en cada reserva. Sin
 * grupo todavía (evento sin reservas) se listan con su precio unitario.
 */
function lineasAdicionales(xs: Adicional[], g: { adultos: number; menores: number }, veces = 1, sinGrupo = false) {
  const titular: NonNullable<PresupuestoDatos['importes']>['lineas'] = []
  const pasajero: NonNullable<PresupuestoDatos['importes']>['pasajero'] = []
  for (const a of xs) {
    if (a.paga === 'PASAJERO') {
      pasajero.push({ descripcion: a.descripcion, detalle: modalidadTexto(a), unitario: a.precioUnitario, importe: null })
      continue
    }
    const cantidad = sinGrupo ? 1 : cantidadAdicional(a, g) * (a.modalidad === 'FIJO' ? veces : 1)
    if (cantidad <= 0) continue
    titular.push({
      tipo: 'ADICIONAL',
      concepto: a.descripcion,
      detalle: [modalidadTexto(a), a.modalidad === 'FIJO' && veces > 1 ? 'por reserva' : null, a.nota].filter(Boolean).join(', ') || null,
      cantidad,
      unitario: a.precioUnitario,
      importe: Math.round(a.precioUnitario * cantidad * 100) / 100,
    })
  }
  return { titular, pasajero }
}

/** Presupuesto de una reserva: su grupo, su menú (o el del evento), sus adicionales y su plan de pagos. */
export async function presupuestoReserva(clienteId: string, reservaId: string, o: Opciones) {
  const [r, p] = await Promise.all([reservaFila(clienteId, reservaId), reservaPropia(reservaId)])
  if (!r || !p) return null
  const ev = r.eventoId ? await eventoBase(clienteId, r.eventoId) : null
  const [{ casa, conLogo }, tipoNombre, adicionales, cuotas, regs, regEvento] = await Promise.all([
    casaDe(clienteId),
    ev ? tipoEventoNombre(clienteId, ev.tipo) : Promise.resolve(null),
    adicionalesDe({ reservaId }),
    cuotasDe([reservaId]),
    prisma.$queryRaw<Array<{ tipo: Regimen; cantidad: number; nota: string | null; menuId: string | null }>>`
      SELECT tipo, cantidad, nota, "menuId" FROM reserva_regimenes WHERE "reservaId" = ${reservaId}::uuid ORDER BY tipo
    `,
    ev
      ? prisma.$queryRaw<Array<{ tipo: Regimen; nota: string | null; menuId: string | null }>>`
          SELECT tipo, nota, "menuId" FROM evento_regimen_menus WHERE "eventoId" = ${ev.id}::uuid
        `
      : Promise.resolve([]),
  ])
  const menuId = p.menuId ?? ev?.menuId ?? null
  const delEvento = new Map(regEvento.map((g) => [g.tipo, g]))
  const menus = await menusDetalle(clienteId, [menuId ?? '', ...regs.map((g) => g.menuId ?? delEvento.get(g.tipo)?.menuId ?? '')], false)

  const g = { adultos: r.adultos, menores: r.menores }
  let importes: PresupuestoDatos['importes'] = null
  if (o.verImportes) {
    const ad = lineasAdicionales(adicionales, g)
    const lineas: NonNullable<PresupuestoDatos['importes']>['lineas'] = []
    if (r.adultos) lineas.push({ tipo: 'CUBIERTO', concepto: 'Adultos', detalle: null, cantidad: r.adultos, unitario: p.precioAdulto, importe: r.adultos * p.precioAdulto })
    if (r.menores) lineas.push({ tipo: 'CUBIERTO', concepto: 'Menores', detalle: null, cantidad: r.menores, unitario: p.precioMenor, importe: r.menores * p.precioMenor })
    if (r.liberados && p.precioLiberado)
      lineas.push({ tipo: 'CUBIERTO', concepto: 'Liberados', detalle: 'precio preferencial', cantidad: r.liberados, unitario: p.precioLiberado, importe: r.liberados * p.precioLiberado })
    importes = {
      ivaModo: p.ivaModo,
      ivaAlicuota: p.ivaAlicuota,
      precioAdulto: p.precioAdulto,
      precioMenor: p.precioMenor,
      precioLiberado: p.precioLiberado,
      lineas: [...lineas, ...ad.titular],
      descuento: p.descuento,
      descuentoNota: p.descuentoNota,
      neto: p.neto,
      iva: p.iva,
      total: r.total,
      pasajero: ad.pasajero,
      cuotas: cuotasPresupuesto(cuotas.get(reservaId) ?? [], r.total),
    }
  }

  const datos: PresupuestoDatos = {
    tipo: 'RESERVA',
    casa,
    numero: r.numero,
    titulo: r.nombre,
    cliente: r.titularNombre,
    contacto: { nombre: r.contactoNombre, telefono: r.contactoTelefono, email: p.contactoEmail },
    evento: ev ? { nombre: ev.nombre, tipo: tipoNombre } : null,
    fecha: r.fecha,
    horario: horario(r.hora, ev && r.hora === ev.horaInicio ? ev.horaFin : null),
    salon: r.salon,
    personas: { adultos: r.adultos, menores: r.menores, bebes: r.bebes, liberados: r.liberados },
    menu: menuPresupuesto(menuId ? menus.get(menuId) : null),
    regimenes: o.regimenes
      ? regs.map((x) => {
          const m = menus.get(x.menuId ?? delEvento.get(x.tipo)?.menuId ?? '')
          return {
            texto: REGIMEN_TEXTO[x.tipo] ?? x.tipo,
            cantidad: x.cantidad,
            nota: x.nota ?? delEvento.get(x.tipo)?.nota ?? null,
            menu: m?.nombre ?? null,
            items: m ? textosMenu(m.items) : [],
          }
        })
      : null,
    importes,
    observaciones: r.observaciones ?? ev?.observaciones ?? null,
    emitido: { fecha: hoyAR(), version: null, usuario: null },
  }
  return { datos, conLogo, eventoId: r.eventoId }
}

/**
 * Presupuesto de un evento, para agencias y eventos privados: las
 * condiciones del evento por persona y, si ya tiene reservas, el total para
 * el grupo completo con los precios del evento.
 */
export async function presupuestoEvento(clienteId: string, eventoId: string, o: Opciones) {
  const ev = await eventoBase(clienteId, eventoId)
  if (!ev) return null
  const [{ casa, conLogo }, tipoNombre, adicionales, reservas, regEvento, salones] = await Promise.all([
    casaDe(clienteId),
    tipoEventoNombre(clienteId, ev.tipo),
    adicionalesDe({ eventoId }),
    listarReservas(clienteId, { eventoId }),
    prisma.$queryRaw<Array<{ tipo: Regimen; nota: string | null; menuId: string | null }>>`
      SELECT tipo, nota, "menuId" FROM evento_regimen_menus WHERE "eventoId" = ${eventoId}::uuid ORDER BY tipo
    `,
    ev.salonIds.length
      ? prisma.$queryRaw<Array<{ nombre: string }>>`SELECT nombre FROM pos_sectores WHERE id = ANY(${ev.salonIds}::uuid[]) ORDER BY nombre`
      : Promise.resolve([]),
  ])
  const activas = reservas.filter((r) => !dadaDeBaja(r.estado))
  const personas = activas.reduce(
    (s, r) => ({ adultos: s.adultos + r.adultos, menores: s.menores + r.menores, bebes: s.bebes + r.bebes, liberados: s.liberados + r.liberados }),
    { adultos: 0, menores: 0, bebes: 0, liberados: 0 }
  )
  const menus = await menusDetalle(clienteId, [ev.menuId ?? '', ...regEvento.map((g) => g.menuId ?? '')], false)

  // Regímenes: lo definido para el evento y cuántos pidieron las reservas.
  const cantidades = new Map<string, number>()
  for (const r of activas) for (const g of r.regimenes) cantidades.set(g.tipo, (cantidades.get(g.tipo) ?? 0) + g.cantidad)
  const tipos = [...new Set([...regEvento.map((g) => g.tipo), ...cantidades.keys()])] as Regimen[]

  let importes: PresupuestoDatos['importes'] = null
  if (o.verImportes) {
    const hay = personas.adultos + personas.menores + personas.liberados > 0
    const g = { adultos: personas.adultos, menores: personas.menores }
    const ad = lineasAdicionales(adicionales, g, Math.max(activas.length, 1), !hay)
    const lineas: NonNullable<PresupuestoDatos['importes']>['lineas'] = []
    if (personas.adultos) lineas.push({ tipo: 'CUBIERTO', concepto: 'Adultos', detalle: null, cantidad: personas.adultos, unitario: ev.precioAdulto, importe: personas.adultos * ev.precioAdulto })
    if (personas.menores) lineas.push({ tipo: 'CUBIERTO', concepto: 'Menores', detalle: null, cantidad: personas.menores, unitario: ev.precioMenor, importe: personas.menores * ev.precioMenor })
    const t = hay
      ? calcularTotal({
          ...personas,
          liberados: 0,
          precioAdulto: ev.precioAdulto,
          precioMenor: ev.precioMenor,
          precioLiberado: 0,
          descuento: 0,
          ivaModo: ev.ivaModo,
          ivaAlicuota: ev.ivaAlicuota,
          adicionales: ad.titular.reduce((s, x) => s + x.importe, 0),
        })
      : null
    importes = {
      ivaModo: ev.ivaModo,
      ivaAlicuota: ev.ivaAlicuota,
      precioAdulto: ev.precioAdulto,
      precioMenor: ev.precioMenor,
      precioLiberado: null,
      lineas: [...lineas, ...ad.titular],
      descuento: 0,
      descuentoNota: null,
      neto: t?.neto ?? null,
      iva: t?.iva ?? null,
      total: t?.total ?? null,
      pasajero: ad.pasajero,
      cuotas: cuotasPresupuesto(cuotasDeRegla({ ...ev, fecha: ev.fecha }), t?.total ?? null),
    }
  }

  // Con una sola reserva (casamiento, grupo de agencia), su titular y su contacto son los del evento.
  const unica = activas.length === 1 ? activas[0]! : null
  const datos: PresupuestoDatos = {
    tipo: 'EVENTO',
    casa,
    numero: null,
    titulo: ev.nombre,
    cliente: unica?.titularNombre ?? null,
    contacto: { nombre: unica?.contactoNombre ?? null, telefono: unica?.contactoTelefono ?? null, email: null },
    evento: { nombre: ev.nombre, tipo: tipoNombre },
    fecha: ev.fecha,
    horario: horario(ev.horaInicio, ev.horaFin),
    salon: salones.map((s) => s.nombre).join(', ') || null,
    personas,
    menu: menuPresupuesto(ev.menuId ? menus.get(ev.menuId) : null),
    regimenes: o.regimenes
      ? tipos.map((tipo) => {
          const d = regEvento.find((g) => g.tipo === tipo)
          const m = d?.menuId ? menus.get(d.menuId) : undefined
          return {
            texto: REGIMEN_TEXTO[tipo] ?? tipo,
            cantidad: cantidades.get(tipo) ?? null,
            nota: d?.nota ?? null,
            menu: m?.nombre ?? null,
            items: m ? textosMenu(m.items) : [],
          }
        })
      : null,
    importes,
    observaciones: ev.observaciones,
    emitido: { fecha: hoyAR(), version: null, usuario: null },
  }
  return { datos, conLogo, eventoId }
}

/**
 * Congela el presupuesto como una versión nueva (v1, v2…). El número sale
 * con un lock por reserva o evento: dos clics seguidos no dan dos v3.
 */
export async function guardarVersion(
  tx: Tx,
  clienteId: string,
  ref: { eventoId: string | null; reservaId: string | null },
  datos: PresupuestoDatos,
  incluyeRegimenes: boolean,
  user: AuthUser | null
) {
  const clave = ref.reservaId ? `presupuesto:r:${ref.reservaId}` : `presupuesto:e:${ref.eventoId}`
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clave}))`
  const [n] = ref.reservaId
    ? await tx.$queryRaw<Array<{ v: number }>>`
        SELECT (COALESCE(max(version), 0) + 1)::int AS v FROM evento_presupuestos WHERE "reservaId" = ${ref.reservaId}::uuid
      `
    : await tx.$queryRaw<Array<{ v: number }>>`
        SELECT (COALESCE(max(version), 0) + 1)::int AS v FROM evento_presupuestos
         WHERE "eventoId" = ${ref.eventoId}::uuid AND "reservaId" IS NULL
      `
  const version = n!.v
  const final: PresupuestoDatos = { ...datos, emitido: { fecha: hoyAR(), version, usuario: nombreDe(user) } }
  const [fila] = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO evento_presupuestos ("clienteId", "eventoId", "reservaId", version, datos, total, "incluyeRegimenes", "usuarioId", "usuarioNombre")
    VALUES (${clienteId}::uuid, ${ref.eventoId}::uuid, ${ref.reservaId}::uuid, ${version}, ${JSON.stringify(final)}::jsonb,
            ${final.importes?.total ?? null}::numeric, ${incluyeRegimenes}, ${user?.id ?? null}::uuid, ${nombreDe(user)})
    RETURNING id
  `
  return { id: fila!.id, version, datos: final }
}

export async function versionesDe(clienteId: string, ref: { eventoId?: string | undefined; reservaId?: string | undefined }) {
  return prisma.$queryRaw<
    Array<{ id: string; version: number; total: number | null; incluyeRegimenes: boolean; usuarioNombre: string | null; createdAt: Date }>
  >`
    SELECT id, version, total::float8 AS total, "incluyeRegimenes", "usuarioNombre", "createdAt"
      FROM evento_presupuestos
     WHERE "clienteId" = ${clienteId}::uuid
       AND (${ref.reservaId ?? null}::uuid IS NOT NULL AND "reservaId" = ${ref.reservaId ?? null}::uuid
            OR ${ref.reservaId ?? null}::uuid IS NULL AND "eventoId" = ${ref.eventoId ?? null}::uuid AND "reservaId" IS NULL)
     ORDER BY version DESC
  `
}

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth'
import {
  CATALOGO_INICIAL,
  parsearMonto,
  type CuotaDef,
  type EstadoCobro,
  type EstadoReserva,
  type IvaModo,
  type PagoModo,
  type Regimen,
  type Sigla,
} from './constantes'

/**
 * Acceso a las tablas de eventos y reservas, con SQL crudo.
 *
 * Como el recetario: el cliente Prisma de producción no se regenera en el
 * build, así que no conoce estos modelos. Las fechas salen como texto
 * (YYYY-MM-DD, HH:MM) y los importes como float8, para que lleguen al
 * navegador sin conversiones de zona horaria ni Decimal.
 */

export type Tx = Prisma.TransactionClient

// ---------------------------------------------------------------------------
// Usuario y auditoría
// ---------------------------------------------------------------------------

export function nombreDe(user: AuthUser | null) {
  return user?.nombre || user?.email || 'Sistema'
}

/**
 * Deja una línea en la auditoría. Se llama dentro de la misma transacción que
 * el cambio: si el cambio no se guarda, la línea tampoco; y al revés.
 */
export async function auditar(
  tx: Tx,
  a: {
    clienteId: string
    eventoId?: string | null | undefined
    reservaId?: string | null | undefined
    accion: string
    descripcion: string
    antes?: unknown
    despues?: unknown
    user: AuthUser | null
  }
) {
  const antes = a.antes === undefined ? null : JSON.stringify(a.antes)
  const despues = a.despues === undefined ? null : JSON.stringify(a.despues)
  await tx.$executeRaw`
    INSERT INTO evento_auditoria ("clienteId", "eventoId", "reservaId", accion, descripcion, antes, despues, "usuarioId", "usuarioNombre")
    VALUES (${a.clienteId}::uuid, ${a.eventoId ?? null}::uuid, ${a.reservaId ?? null}::uuid, ${a.accion},
            ${a.descripcion}, ${antes}::jsonb, ${despues}::jsonb,
            ${a.user?.id ?? null}::uuid, ${nombreDe(a.user)})
  `
}

/**
 * Cambios entre dos versiones, para la auditoría: "Adultos: 6 → 8". Sólo las
 * claves que cambiaron, con la etiqueta legible.
 */
export function diferencias<T extends object>(
  antes: T,
  despues: Partial<T>,
  etiquetas: Partial<Record<keyof T, string>>
) {
  const a: Record<string, unknown> = {}
  const d: Record<string, unknown> = {}
  const textos: string[] = []
  for (const k of Object.keys(etiquetas) as Array<keyof T>) {
    if (!(k in despues)) continue
    const viejo = (antes[k] as unknown) ?? null
    const nuevo = (despues[k] as unknown) ?? null
    if (JSON.stringify(viejo) === JSON.stringify(nuevo)) continue
    a[k as string] = viejo
    d[k as string] = nuevo
    textos.push(`${etiquetas[k]}: ${mostrar(viejo)} → ${mostrar(nuevo)}`)
  }
  return { antes: a, despues: d, texto: textos.join(' · '), hay: textos.length > 0 }
}

function mostrar(v: unknown) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—'
  const s = String(v)
  return s.length > 60 ? `${s.slice(0, 57)}…` : s
}

// ---------------------------------------------------------------------------
// Configuración y catálogos
// ---------------------------------------------------------------------------

export interface ConfigEventos {
  diasPresupuesto: number
  diasAvisoVencimiento: number
  avisoCupoPct: number
  /** Cómo se presenta la casa en el presupuesto. NULL = la razón social. */
  nombreCasa: string | null
  /** Lo que va al pie de todos los presupuestos. */
  presupuestoPie: string | null
  presupuestoValidezDias: number | null
}

/** Se crea en la primera lectura, como la configuración del POS. */
export async function configuracionDe(clienteId: string): Promise<ConfigEventos> {
  const [c] = await prisma.$queryRaw<ConfigEventos[]>`
    INSERT INTO evento_configuracion ("clienteId") VALUES (${clienteId}::uuid)
    ON CONFLICT ("clienteId") DO UPDATE SET "clienteId" = EXCLUDED."clienteId"
    RETURNING "diasPresupuesto", "diasAvisoVencimiento", "avisoCupoPct",
              "nombreCasa", "presupuestoPie", "presupuestoValidezDias"
  `
  return c!
}

export interface ItemCatalogo {
  id: string
  lista: 'ORIGEN' | 'TIPO_EVENTO'
  clave: string
  nombre: string
  color: string | null
  orden: number
  activo: boolean
}

/** Orígenes y tipos de evento. La primera vez se siembran con los de fábrica. */
export async function catalogosDe(clienteId: string): Promise<ItemCatalogo[]> {
  const leer = () => prisma.$queryRaw<ItemCatalogo[]>`
    SELECT id, lista, clave, nombre, color, orden, activo
      FROM evento_catalogos WHERE "clienteId" = ${clienteId}::uuid
     ORDER BY lista, orden, nombre
  `
  const items = await leer()
  if (items.length > 0) return items

  const filas = [
    ...CATALOGO_INICIAL.ORIGEN.map(([clave, nombre], i) => Prisma.sql`(${clienteId}::uuid, 'ORIGEN', ${clave}, ${nombre}, NULL, ${i})`),
    ...CATALOGO_INICIAL.TIPO_EVENTO.map(
      ([clave, nombre, color], i) => Prisma.sql`(${clienteId}::uuid, 'TIPO_EVENTO', ${clave}, ${nombre}, ${color}, ${i})`
    ),
  ]
  await prisma.$executeRaw`
    INSERT INTO evento_catalogos ("clienteId", lista, clave, nombre, color, orden)
    VALUES ${Prisma.join(filas)}
    ON CONFLICT ("clienteId", lista, clave) DO NOTHING
  `
  return leer()
}

export interface SalonPos {
  id: string
  nombre: string
  sucursal: string
  mesas: Array<{ id: string; nombre: string; capacidad: number }>
}

/** Salones y mesas del POS, para elegir dónde va cada reserva. */
export async function salonesDe(clienteId: string): Promise<SalonPos[]> {
  return prisma.$queryRaw<SalonPos[]>`
    SELECT s.id, s.nombre, su.nombre AS sucursal,
           COALESCE((SELECT json_agg(json_build_object('id', m.id, 'nombre', m.nombre, 'capacidad', m.capacidad)
                                     ORDER BY length(m.nombre), m.nombre)
                       FROM pos_mesas m WHERE m."sectorId" = s.id AND m.activa), '[]') AS mesas
      FROM pos_sectores s
      JOIN pos_sucursales su ON su.id = s."sucursalId"
     WHERE s."clienteId" = ${clienteId}::uuid AND s.activo
     ORDER BY su.orden, su.nombre, s.orden, s.nombre
  `
}

// ---------------------------------------------------------------------------
// Reservas
// ---------------------------------------------------------------------------

export interface RegimenFila {
  tipo: Regimen
  cantidad: number
  nota: string | null
}

export interface ReservaFila {
  id: string
  numero: number
  eventoId: string | null
  eventoNombre: string | null
  eventoTipo: string | null
  nombre: string
  contactoNombre: string | null
  contactoTelefono: string | null
  fecha: string
  hora: string | null
  sectorId: string | null
  salon: string | null
  adultos: number
  menores: number
  bebes: number
  liberados: number
  personas: number
  estado: EstadoReserva
  sigla: Sigla
  estadoCobro: EstadoCobro
  total: number
  cobrado: number
  saldo: number
  origen: string | null
  mesaInamovible: boolean
  titularId: string | null
  titularNombre: string | null
  observaciones: string | null
  notaServicio: string | null
  regimenes: RegimenFila[]
  mesas: string[]
  createdAt: Date
}

const SELECT_RESERVA = Prisma.sql`
  SELECT r.id, r.numero, r."eventoId", e.nombre AS "eventoNombre", e.tipo AS "eventoTipo",
         r.nombre, r."contactoNombre", r."contactoTelefono",
         to_char(r.fecha, 'YYYY-MM-DD') AS fecha, to_char(r.hora, 'HH24:MI') AS hora,
         r."sectorId", s.nombre AS salon,
         r.adultos, r.menores, r.bebes, r.liberados, t.personas,
         r.estado, t.sigla, t."estadoCobro",
         t.total::float8 AS total, t.cobrado::float8 AS cobrado, t.saldo::float8 AS saldo,
         r.origen, r."mesaInamovible", r."titularId", c.nombre AS "titularNombre",
         r.observaciones, r."notaServicio",
         COALESCE((SELECT json_agg(json_build_object('tipo', g.tipo, 'cantidad', g.cantidad, 'nota', g.nota) ORDER BY g.tipo)
                     FROM reserva_regimenes g WHERE g."reservaId" = r.id), '[]') AS regimenes,
         COALESCE((SELECT array_agg(m.nombre::text ORDER BY length(m.nombre), m.nombre)
                     FROM reserva_mesas rm JOIN pos_mesas m ON m.id = rm."mesaId"
                    WHERE rm."reservaId" = r.id), '{}') AS mesas,
         r."createdAt"
    FROM reservas r
    JOIN reserva_totales t ON t."reservaId" = r.id
    LEFT JOIN eventos e ON e.id = r."eventoId"
    LEFT JOIN pos_sectores s ON s.id = r."sectorId"
    LEFT JOIN evento_clientes c ON c.id = r."titularId"
`

export interface FiltrosReservas {
  eventoId?: string | null | undefined
  /** Sólo las que no cuelgan de un evento (a la carta o privadas sueltas). */
  sinEvento?: boolean | undefined
  desde?: string | null | undefined
  hasta?: string | null | undefined
  siglas?: Sigla[] | undefined
  sectorId?: string | null | undefined
  conRegimen?: boolean | undefined
  q?: string | null | undefined
  titularId?: string | null | undefined
  limite?: number | undefined
}

export async function listarReservas(clienteId: string, f: FiltrosReservas): Promise<ReservaFila[]> {
  const cond: Prisma.Sql[] = [Prisma.sql`r."clienteId" = ${clienteId}::uuid`]
  if (f.eventoId) cond.push(Prisma.sql`r."eventoId" = ${f.eventoId}::uuid`)
  if (f.sinEvento) cond.push(Prisma.sql`r."eventoId" IS NULL`)
  if (f.desde) cond.push(Prisma.sql`r.fecha >= ${f.desde}::date`)
  if (f.hasta) cond.push(Prisma.sql`r.fecha <= ${f.hasta}::date`)
  if (f.siglas?.length) cond.push(Prisma.sql`t.sigla = ANY(${f.siglas}::text[])`)
  if (f.sectorId) cond.push(Prisma.sql`r."sectorId" = ${f.sectorId}::uuid`)
  if (f.titularId) cond.push(Prisma.sql`r."titularId" = ${f.titularId}::uuid`)
  if (f.conRegimen) cond.push(Prisma.sql`EXISTS (SELECT 1 FROM reserva_regimenes g WHERE g."reservaId" = r.id)`)
  const q = f.q?.trim()
  if (q) {
    const patron = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
    cond.push(Prisma.sql`(r.nombre ILIKE ${patron} OR r."contactoNombre" ILIKE ${patron}
      OR r."contactoTelefono" ILIKE ${patron} OR c.nombre ILIKE ${patron} OR r.numero::text = ${q})`)
  }
  return prisma.$queryRaw<ReservaFila[]>`
    ${SELECT_RESERVA}
    WHERE ${Prisma.join(cond, ' AND ')}
    ORDER BY r.fecha, r.hora NULLS LAST, r.numero
    LIMIT ${f.limite ?? 2000}
  `
}

export async function reservaFila(clienteId: string, id: string): Promise<ReservaFila | null> {
  const [r] = await prisma.$queryRaw<ReservaFila[]>`
    ${SELECT_RESERVA}
    WHERE r."clienteId" = ${clienteId}::uuid AND r.id = ${id}::uuid
  `
  return r ?? null
}

/** Lo que la ficha necesita además de la fila: lo propio de la reserva sin heredar. */
export interface ReservaPropia {
  contactoEmail: string | null
  precioAdultoPropio: number | null
  precioMenorPropio: number | null
  precioLiberado: number | null
  ivaModoPropio: IvaModo | null
  ivaAlicuotaPropia: number | null
  descuento: number
  descuentoNota: string | null
  cancelacionSena: string | null
  aprobadaAt: Date | null
  finalizadaAt: Date | null
  canceladaAt: Date | null
  precioAdulto: number
  precioMenor: number
  ivaModo: IvaModo
  ivaAlicuota: number
  neto: number
  iva: number
  mesaIds: string[]
  /** Adicionales del titular (suman) y de cada pasajero (informativos), con la cuenta de la vista. */
  adicionales: number
  adicionalesPasajero: number
  /** Las líneas que aplican (propias y del evento), para recalcular el total mientras se editan las personas. */
  adicionalesLineas: Array<{ modalidad: 'PERSONA' | 'FIJO'; aplica: 'TODOS' | 'ADULTOS' | 'MENORES'; cantidad: number | null; precioUnitario: number; paga: 'TITULAR' | 'PASAJERO' }>
  menuId: string | null
}

export async function reservaPropia(id: string): Promise<ReservaPropia | null> {
  const [r] = await prisma.$queryRaw<ReservaPropia[]>`
    SELECT r."contactoEmail",
           r."precioAdulto"::float8 AS "precioAdultoPropio", r."precioMenor"::float8 AS "precioMenorPropio",
           r."precioLiberado"::float8 AS "precioLiberado",
           r."ivaModo" AS "ivaModoPropio", r."ivaAlicuota"::float8 AS "ivaAlicuotaPropia",
           r.descuento::float8 AS descuento, r."descuentoNota", r."cancelacionSena",
           r."aprobadaAt", r."finalizadaAt", r."canceladaAt",
           t."precioAdulto"::float8 AS "precioAdulto", t."precioMenor"::float8 AS "precioMenor",
           t."ivaModo", t."ivaAlicuota"::float8 AS "ivaAlicuota",
           t.neto::float8 AS neto, t.iva::float8 AS iva,
           COALESCE((SELECT array_agg(rm."mesaId"::text) FROM reserva_mesas rm WHERE rm."reservaId" = r.id), '{}') AS "mesaIds",
           t.adicionales::float8 AS adicionales, t."adicionalesPasajero"::float8 AS "adicionalesPasajero",
           COALESCE((SELECT json_agg(json_build_object('modalidad', a.modalidad, 'aplica', a.aplica, 'cantidad', a.cantidad::float8,
                                                       'precioUnitario', a."precioUnitario"::float8, 'paga', a.paga))
                       FROM evento_adicionales a
                      WHERE a."reservaId" = r.id OR (r."eventoId" IS NOT NULL AND a."eventoId" = r."eventoId")), '[]') AS "adicionalesLineas",
           r."menuId"
      FROM reservas r JOIN reserva_totales t ON t."reservaId" = r.id
     WHERE r.id = ${id}::uuid
  `
  return r ?? null
}

/** Número correlativo por empresa. El lock evita que dos altas simultáneas choquen. */
export async function siguienteNumero(tx: Tx, clienteId: string): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'reservas:' + clienteId}))`
  const [r] = await tx.$queryRaw<Array<{ n: number }>>`
    SELECT (COALESCE(max(numero), 0) + 1)::int AS n FROM reservas WHERE "clienteId" = ${clienteId}::uuid
  `
  return r!.n
}

// ---------------------------------------------------------------------------
// Cuotas y pagos
// ---------------------------------------------------------------------------

export async function cuotasDe(reservaIds: string[]): Promise<Map<string, CuotaDef[]>> {
  const out = new Map<string, CuotaDef[]>()
  if (reservaIds.length === 0) return out
  const filas = await prisma.$queryRaw<Array<CuotaDef & { reservaId: string }>>`
    SELECT id, "reservaId", concepto, monto::float8 AS monto, porcentaje::float8 AS porcentaje,
           to_char(vencimiento, 'YYYY-MM-DD') AS vencimiento, orden
      FROM reserva_cuotas WHERE "reservaId" = ANY(${reservaIds}::uuid[])
     ORDER BY orden
  `
  for (const { reservaId, ...c } of filas) {
    const arr = out.get(reservaId)
    if (arr) arr.push(c)
    else out.set(reservaId, [c])
  }
  return out
}

export async function guardarCuotas(tx: Tx, reservaId: string, cuotas: CuotaDef[]) {
  await tx.$executeRaw`DELETE FROM reserva_cuotas WHERE "reservaId" = ${reservaId}::uuid`
  if (cuotas.length === 0) return
  await tx.$executeRaw`
    INSERT INTO reserva_cuotas ("reservaId", concepto, monto, porcentaje, vencimiento, orden)
    VALUES ${Prisma.join(
      cuotas.map(
        (c, i) => Prisma.sql`(${reservaId}::uuid, ${c.concepto}, ${c.monto}::numeric, ${c.porcentaje}::numeric, ${c.vencimiento}::date, ${i})`
      )
    )}
  `
}

export interface PagoFila {
  id: string
  tipo: 'PAGO' | 'DEVOLUCION'
  fecha: string
  monto: number
  medio: string
  comprobante: string | null
  nota: string | null
  usuarioNombre: string | null
  anuladoAt: Date | null
  anuladoPor: string | null
  anuladoMotivo: string | null
  createdAt: Date
}

export async function pagosDe(reservaId: string): Promise<PagoFila[]> {
  return prisma.$queryRaw<PagoFila[]>`
    SELECT id, tipo, to_char(fecha, 'YYYY-MM-DD') AS fecha, monto::float8 AS monto, medio, comprobante, nota,
           "usuarioNombre", "anuladoAt", "anuladoPor", "anuladoMotivo", "createdAt"
      FROM reserva_pagos WHERE "reservaId" = ${reservaId}::uuid
     ORDER BY fecha DESC, "createdAt" DESC
  `
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

export interface EventoBase {
  id: string
  nombre: string
  tipo: string
  fecha: string
  horaInicio: string | null
  horaFin: string | null
  cupo: number | null
  precioAdulto: number
  precioMenor: number
  ivaModo: IvaModo
  ivaAlicuota: number
  pagoModo: PagoModo
  senaPct: number | null
  senaMonto: number | null
  senaVence: string | null
  saldoVence: string | null
  observaciones: string | null
  salonIds: string[]
  /** Menú del evento (copia). Lo heredan las reservas sin menú propio. */
  menuId: string | null
  createdAt: Date
  updatedAt: Date
}

const SELECT_EVENTO = Prisma.sql`
  SELECT e.id, e.nombre, e.tipo, to_char(e.fecha, 'YYYY-MM-DD') AS fecha,
         to_char(e."horaInicio", 'HH24:MI') AS "horaInicio", to_char(e."horaFin", 'HH24:MI') AS "horaFin",
         e.cupo, e."precioAdulto"::float8 AS "precioAdulto", e."precioMenor"::float8 AS "precioMenor",
         e."ivaModo", e."ivaAlicuota"::float8 AS "ivaAlicuota", e."pagoModo",
         e."senaPct"::float8 AS "senaPct", e."senaMonto"::float8 AS "senaMonto",
         to_char(e."senaVence", 'YYYY-MM-DD') AS "senaVence", to_char(e."saldoVence", 'YYYY-MM-DD') AS "saldoVence",
         e.observaciones,
         COALESCE((SELECT array_agg(es."sectorId"::text) FROM evento_salones es WHERE es."eventoId" = e.id), '{}') AS "salonIds",
         e."menuId", e."createdAt", e."updatedAt"
    FROM eventos e
`

export async function eventoBase(clienteId: string, id: string, tx: Tx | typeof prisma = prisma): Promise<EventoBase | null> {
  const [e] = await tx.$queryRaw<EventoBase[]>`
    ${SELECT_EVENTO} WHERE e."clienteId" = ${clienteId}::uuid AND e.id = ${id}::uuid
  `
  return e ?? null
}

export interface EventoResumen extends EventoBase {
  reservas: number
  personas: number
  confirmadas: number
  total: number
  cobrado: number
  saldo: number
  siglas: Partial<Record<Sigla, number>>
}

/** Eventos de un rango, con el agregado de sus reservas (sin las canceladas en los totales). */
export async function listarEventos(
  clienteId: string,
  f: { desde?: string | null | undefined; hasta?: string | null | undefined; q?: string | null | undefined }
): Promise<EventoResumen[]> {
  const cond: Prisma.Sql[] = [Prisma.sql`e."clienteId" = ${clienteId}::uuid`]
  if (f.desde) cond.push(Prisma.sql`e.fecha >= ${f.desde}::date`)
  if (f.hasta) cond.push(Prisma.sql`e.fecha <= ${f.hasta}::date`)
  if (f.q?.trim()) cond.push(Prisma.sql`e.nombre ILIKE ${'%' + f.q.trim() + '%'}`)
  return prisma.$queryRaw<EventoResumen[]>`
    SELECT b.*, COALESCE(a.reservas, 0)::int AS reservas, COALESCE(a.personas, 0)::int AS personas,
           COALESCE(a.confirmadas, 0)::int AS confirmadas,
           COALESCE(a.total, 0)::float8 AS total, COALESCE(a.cobrado, 0)::float8 AS cobrado,
           COALESCE(a.saldo, 0)::float8 AS saldo, COALESCE(sg.siglas, '{}') AS siglas
      FROM (${SELECT_EVENTO} WHERE ${Prisma.join(cond, ' AND ')}) b
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE r.estado <> 'CANCELADO') AS reservas,
               sum(t.personas) FILTER (WHERE r.estado <> 'CANCELADO') AS personas,
               sum(t.personas) FILTER (WHERE r.estado IN ('APROBADO', 'FINALIZADO')) AS confirmadas,
               sum(t.total) FILTER (WHERE r.estado <> 'CANCELADO') AS total,
               sum(t.cobrado) AS cobrado,
               sum(t.saldo) FILTER (WHERE r.estado <> 'CANCELADO') AS saldo
          FROM reservas r JOIN reserva_totales t ON t."reservaId" = r.id
         WHERE r."eventoId" = b.id
      ) a ON true
      LEFT JOIN LATERAL (
        SELECT json_object_agg(x.sigla, x.n) AS siglas
          FROM (SELECT t.sigla, count(*) AS n FROM reserva_totales t WHERE t."eventoId" = b.id GROUP BY t.sigla) x
      ) sg ON true
     ORDER BY b.fecha, b."horaInicio" NULLS LAST
  `
}

/**
 * Personas que ocupan el cupo del evento, sin contar una reserva (la que se
 * está editando). Bloquea la fila del evento: con cien reservas entrando a
 * la vez para el 31/12, dos altas no pueden pasar el mismo último lugar.
 */
export async function ocupacion(tx: Tx, eventoId: string, excluir: string | null) {
  const [e] = await tx.$queryRaw<Array<{ cupo: number | null }>>`
    SELECT cupo FROM eventos WHERE id = ${eventoId}::uuid FOR UPDATE
  `
  const [o] = await tx.$queryRaw<Array<{ n: number }>>`
    SELECT COALESCE(sum(adultos + menores + bebes + liberados), 0)::int AS n
      FROM reservas
     WHERE "eventoId" = ${eventoId}::uuid AND estado <> 'CANCELADO'
       AND (${excluir}::uuid IS NULL OR id <> ${excluir}::uuid)
  `
  return { cupo: e?.cupo ?? null, ocupado: o?.n ?? 0 }
}

// ---------------------------------------------------------------------------
// Línea de tiempo
// ---------------------------------------------------------------------------

export interface AuditoriaFila {
  id: string
  eventoId: string | null
  reservaId: string | null
  reservaNumero: number | null
  reservaNombre: string | null
  accion: string
  descripcion: string
  antes: unknown
  despues: unknown
  usuarioNombre: string | null
  createdAt: Date
}

export async function auditoriaDe(
  clienteId: string,
  f: { eventoId?: string | undefined; reservaId?: string | undefined },
  limite = 300
): Promise<AuditoriaFila[]> {
  const cond = f.reservaId
    ? Prisma.sql`a."reservaId" = ${f.reservaId}::uuid`
    : Prisma.sql`a."eventoId" = ${f.eventoId ?? null}::uuid`
  return prisma.$queryRaw<AuditoriaFila[]>`
    SELECT a.id, a."eventoId", a."reservaId", r.numero AS "reservaNumero", r.nombre AS "reservaNombre",
           a.accion, a.descripcion, a.antes, a.despues, a."usuarioNombre", a."createdAt"
      FROM evento_auditoria a
      LEFT JOIN reservas r ON r.id = a."reservaId"
     WHERE a."clienteId" = ${clienteId}::uuid AND ${cond}
     ORDER BY a."createdAt" DESC
     LIMIT ${limite}
  `
}

export interface AgendaFila {
  id: string
  eventoId: string | null
  reservaId: string | null
  eventoNombre: string | null
  reservaNombre: string | null
  reservaNumero: number | null
  tipo: string
  titulo: string
  fechaHora: Date
  responsableId: string | null
  responsableNombre: string | null
  estado: 'PENDIENTE' | 'HECHA' | 'CANCELADA'
  resultado: string | null
  completadaAt: Date | null
  createdAt: Date
}

export async function agendaDe(
  clienteId: string,
  f: {
    eventoId?: string | undefined
    reservaId?: string | undefined
    desde?: string | undefined
    hasta?: string | undefined
    soloPendientes?: boolean | undefined
  }
): Promise<AgendaFila[]> {
  const cond: Prisma.Sql[] = [Prisma.sql`g."clienteId" = ${clienteId}::uuid`]
  // En la ficha del evento también van las de sus reservas: la degustación
  // de un grupo es parte de cómo se prepara la noche.
  if (f.eventoId) cond.push(Prisma.sql`(g."eventoId" = ${f.eventoId}::uuid OR r."eventoId" = ${f.eventoId}::uuid)`)
  if (f.reservaId) cond.push(Prisma.sql`g."reservaId" = ${f.reservaId}::uuid`)
  // Fechas de calendario en horario argentino.
  if (f.desde) cond.push(Prisma.sql`g."fechaHora" >= (${f.desde}::date)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'`)
  if (f.hasta) cond.push(Prisma.sql`g."fechaHora" < (${f.hasta}::date + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'`)
  if (f.soloPendientes) cond.push(Prisma.sql`g.estado = 'PENDIENTE'`)
  return prisma.$queryRaw<AgendaFila[]>`
    SELECT g.id, g."eventoId", g."reservaId", COALESCE(e.nombre, er.nombre) AS "eventoNombre",
           r.nombre AS "reservaNombre", r.numero AS "reservaNumero",
           g.tipo, g.titulo, g."fechaHora", g."responsableId", g."responsableNombre", g.estado,
           g.resultado, g."completadaAt", g."createdAt"
      FROM evento_agenda g
      LEFT JOIN eventos e ON e.id = g."eventoId"
      LEFT JOIN reservas r ON r.id = g."reservaId"
      LEFT JOIN eventos er ON er.id = r."eventoId"
     WHERE ${Prisma.join(cond, ' AND ')}
     ORDER BY g."fechaHora"
     LIMIT 1000
  `
}

// ---------------------------------------------------------------------------
// Validación de entrada
// ---------------------------------------------------------------------------

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/
const RE_HORA = /^\d{2}:\d{2}$/
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const esFecha = (v: unknown): v is string => typeof v === 'string' && RE_FECHA.test(v)
export const esHora = (v: unknown): v is string => typeof v === 'string' && RE_HORA.test(v)
export const esUuid = (v: unknown): v is string => typeof v === 'string' && RE_UUID.test(v)

/** Texto recortado, o null si viene vacío. */
export function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

/** Número no negativo, o null. Acepta "1.234,5" del teclado argentino. */
export function numero(v: unknown): number | null {
  const n = parsearMonto(v)
  return n !== null && n >= 0 ? n : null
}

export function entero(v: unknown): number {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Mensaje de un error de la base, sin el SQL. */
export function mensajeError(e: unknown) {
  const m = e instanceof Error ? e.message : String(e)
  if (m.includes('violates check constraint')) return 'Algún dato no es válido'
  if (m.includes('violates foreign key')) return 'Hay una referencia que no existe (salón, mesa o cliente)'
  if (m.includes('reservas_eventoId_fkey') || m.includes('still referenced')) return 'El evento tiene reservas'
  return 'No se pudo guardar'
}

export class CupoExcedido extends Error {
  constructor(
    public cupo: number,
    public ocupado: number,
    public pedido: number
  ) {
    super(`El evento tiene cupo para ${cupo} personas y ya hay ${ocupado}: no entran ${pedido} más`)
  }
}

/**
 * Corta la transacción si la reserva no entra en el cupo. Con `forzar` deja
 * pasar y devuelve el exceso, para que quede en la auditoría quién lo
 * decidió. (La autorización de un supervisor llega en otra etapa.)
 */
export async function verificarCupo(
  tx: Tx,
  eventoId: string,
  excluir: string | null,
  personas: number,
  forzar: boolean
): Promise<{ cupo: number; ocupado: number } | null> {
  const { cupo, ocupado } = await ocupacion(tx, eventoId, excluir)
  if (!cupo || ocupado + personas <= cupo) return null
  if (!forzar) throw new CupoExcedido(cupo, ocupado, personas)
  return { cupo, ocupado }
}

/** Respuesta 409 que la pantalla reconoce para pedir confirmación. */
export function respuestaCupo(e: CupoExcedido) {
  return { error: e.message, codigo: 'CUPO', cupo: e.cupo, ocupado: e.ocupado, pedido: e.pedido }
}

/**
 * Reemplaza los regímenes. El menú alternativo de cada tipo se conserva: la
 * pantalla de personas manda cantidades y notas, y no tiene por qué saber
 * que el celíaco ya tenía su menú armado. Si un tipo desaparece, su copia
 * del menú se borra.
 */
export async function guardarRegimenes(
  tx: Tx,
  reservaId: string,
  regimenes: Array<{ tipo: string; cantidad: number; nota: string | null }>
) {
  const previos = await tx.$queryRaw<Array<{ tipo: string; menuId: string | null }>>`
    SELECT tipo, "menuId" FROM reserva_regimenes WHERE "reservaId" = ${reservaId}::uuid AND "menuId" IS NOT NULL
  `
  const menuDe = new Map(previos.map((p) => [p.tipo, p.menuId]))
  await tx.$executeRaw`DELETE FROM reserva_regimenes WHERE "reservaId" = ${reservaId}::uuid`
  if (regimenes.length > 0) {
    await tx.$executeRaw`
      INSERT INTO reserva_regimenes ("reservaId", tipo, cantidad, nota, "menuId")
      VALUES ${Prisma.join(
        regimenes.map((g) => Prisma.sql`(${reservaId}::uuid, ${g.tipo}, ${g.cantidad}::int, ${g.nota}, ${menuDe.get(g.tipo) ?? null}::uuid)`)
      )}
    `
  }
  if (previos.length) await limpiarCopiasMenu(tx, { reservaId })
}

/**
 * Borra las copias de menú de un evento o una reserva que ya nadie usa (se
 * cambió el menú, se quitó un régimen). Las plantillas no se tocan nunca.
 */
export async function limpiarCopiasMenu(tx: Tx, dueno: { eventoId?: string | null | undefined; reservaId?: string | null | undefined }) {
  await tx.$executeRaw`
    DELETE FROM evento_menus m
     WHERE NOT m.plantilla
       AND (m."eventoId" = ${dueno.eventoId ?? null}::uuid OR m."reservaId" = ${dueno.reservaId ?? null}::uuid)
       AND NOT EXISTS (SELECT 1 FROM eventos e WHERE e."menuId" = m.id)
       AND NOT EXISTS (SELECT 1 FROM reservas r WHERE r."menuId" = m.id)
       AND NOT EXISTS (SELECT 1 FROM reserva_regimenes g WHERE g."menuId" = m.id)
       AND NOT EXISTS (SELECT 1 FROM evento_regimen_menus g WHERE g."menuId" = m.id)
  `
}

/** Reemplaza las mesas. Sólo acepta mesas de la misma empresa. Devuelve los nombres. */
export async function guardarMesas(tx: Tx, clienteId: string, reservaId: string, mesaIds: string[]): Promise<string[]> {
  await tx.$executeRaw`DELETE FROM reserva_mesas WHERE "reservaId" = ${reservaId}::uuid`
  if (mesaIds.length === 0) return []
  const filas = await tx.$queryRaw<Array<{ nombre: string }>>`
    INSERT INTO reserva_mesas ("reservaId", "mesaId")
    SELECT ${reservaId}::uuid, m.id FROM pos_mesas m
     WHERE m.id = ANY(${mesaIds}::uuid[]) AND m."clienteId" = ${clienteId}::uuid
    RETURNING (SELECT nombre FROM pos_mesas WHERE id = "mesaId") AS nombre
  `
  return filas.map((f) => f.nombre).sort()
}

/**
 * Las FK garantizan que el titular o el salón existan, no que sean de esta
 * empresa. Se chequea antes de guardar para que nadie cuelgue una reserva de
 * un cliente ajeno pasando un id a mano.
 */
export async function verificarPropios(
  tx: Tx,
  clienteId: string,
  refs: { titularId?: string | null | undefined; sectorId?: string | null | undefined }
) {
  if (refs.titularId) {
    const [r] = await tx.$queryRaw<Array<{ ok: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM evento_clientes WHERE id = ${refs.titularId}::uuid AND "clienteId" = ${clienteId}::uuid) AS ok
    `
    if (!r?.ok) throw new Error('REF')
  }
  if (refs.sectorId) {
    const [r] = await tx.$queryRaw<Array<{ ok: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pos_sectores WHERE id = ${refs.sectorId}::uuid AND "clienteId" = ${clienteId}::uuid) AS ok
    `
    if (!r?.ok) throw new Error('REF')
  }
}

/** Cliente de eventos con lo que suma en reservas. */
export interface ClienteEvento {
  id: string
  tipo: 'PARTICULAR' | 'AGENCIA'
  nombre: string
  cuit: string | null
  condicionIva: string
  telefono: string | null
  email: string | null
  comisionPct: number
  notas: string | null
  activo: boolean
  reservas: number
  ultimaFecha: string | null
  facturado: number
}

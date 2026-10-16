import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/**
 * Pedidos del punto de venta.
 *
 * Los ids los manda la pantalla, no los genera la base. Eso hace dos cosas:
 * el pedido existe apenas se toca el primer producto, sin esperar un viaje al
 * servidor, y si la conexión se corta a mitad de camino el reintento manda el
 * mismo id y no duplica nada.
 *
 * El total se recalcula siempre del lado del servidor a partir de los ítems.
 * El precio que manda la pantalla es el que vio el mozo, y queda congelado en
 * el ítem, pero la suma no se le cree a nadie.
 */

interface ItemEntrada {
  id: string
  productoId?: string | null
  nombre: string
  cantidad: number
  precioUnitario: number
  alicuotaIva?: number
  nota?: string | null
  /** MS (marcha y sale) o PAR (parrilla). Va pegada al plato, no al pedido. */
  marca?: string | null
  /** Lo elegido en los grupos de opciones, congelado en la línea. */
  opciones?: Array<{ opcionId?: string | null; grupo?: string | null; nombre: string; precioExtra?: number }>
}

/** Pedidos abiertos de una sucursal, con lo justo para pintar el salón. */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS)
  if (error) return error

  const sucursalId = request.nextUrl.searchParams.get('sucursalId')
  const pedidoId = request.nextUrl.searchParams.get('pedidoId')

  if (pedidoId) {
    const [pedido] = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT p.id, p.numero, p.tipo, p.estado, p.comensales, p."mesaId", m.nombre AS mesa,
             p."mozoId", u.nombre AS mozo, p.total::float8 AS total, p.cliente,
             p."descuentoPct"::float8 AS "descuentoPct",
             to_char(p."abiertoAt", 'YYYY-MM-DD"T"HH24:MI:SS') AS "abiertoAt",
             p."descuentoImporte"::float8 AS "descuentoImporte",
             p."precuentaAt" IS NOT NULL AS "conPrecuenta", p.nota
        FROM pos_pedidos p
        LEFT JOIN pos_mesas m ON m.id = p."mesaId"
        LEFT JOIN pos_usuarios u ON u.id = p."mozoId"
       WHERE p.id = ${pedidoId}::uuid AND p."clienteId" = ${clienteId}::uuid
    `
    if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    const items = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT i.id, i."productoId", i.nombre, i.cantidad::float8 AS cantidad,
             i."precioUnitario"::float8 AS "precioUnitario", i."alicuotaIva"::float8 AS "alicuotaIva",
             i.nota, i.marca, i.comanda, i."estadoKds",
             i."enviadoAt" IS NOT NULL AS enviado, i."anuladoAt" IS NOT NULL AS anulado,
             to_char(i."enviadoAt", 'HH24:MI') AS "enviadoHora",
             -- Cocina: desde que entró hasta que salió, o hasta ahora si
             -- todavía no salió. Pase: desde que está listo hasta que el
             -- mozo lo levanta. Son dos demoras distintas y de dos sectores
             -- distintos; sumarlas esconde de quién es el problema.
             round(extract(epoch FROM (COALESCE(i."entregadoAt", now()) - i."enviadoAt")) / 60)::int AS "minutosCocina",
             CASE WHEN i."entregadoAt" IS NOT NULL
                  THEN round(extract(epoch FROM (COALESCE(i."despachadoAt", now()) - i."entregadoAt")) / 60)::int
             END AS "minutosPase",
             COALESCE((
               SELECT json_agg(json_build_object(
                        'opcionId', o."opcionId", 'grupo', o.grupo,
                        'nombre', o.nombre, 'precioExtra', o."precioExtra"::float8)
                        ORDER BY o.grupo, o.nombre)
                 FROM pos_pedido_item_opciones o WHERE o."pedidoItemId" = i.id
             ), '[]'::json) AS opciones
        FROM pos_pedido_items i WHERE i."pedidoId" = ${pedidoId}::uuid ORDER BY i."createdAt"
    `
    return NextResponse.json({ pedido, items })
  }

  const pedidos = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT p.id, p.numero, p.tipo, p.estado, p.comensales, p."mesaId", m.nombre AS mesa,
           u.nombre AS mozo, p.total::float8 AS total,
           to_char(p."abiertoAt", 'YYYY-MM-DD"T"HH24:MI:SS') AS "abiertoAt",
           (SELECT count(*)::int FROM pos_pedido_items i
             WHERE i."pedidoId" = p.id AND i."anuladoAt" IS NULL) AS items
      FROM pos_pedidos p
      LEFT JOIN pos_mesas m ON m.id = p."mesaId"
      LEFT JOIN pos_usuarios u ON u.id = p."mozoId"
     WHERE p."clienteId" = ${clienteId}::uuid
       AND (${sucursalId}::uuid IS NULL OR p."sucursalId" = ${sucursalId}::uuid)
       AND p.estado IN ('abierto', 'bloqueado')
     ORDER BY p."abiertoAt"
  `
  return NextResponse.json({ pedidos })
}

/**
 * Crea o actualiza un pedido completo. Idempotente por el id del pedido y los
 * ids de los ítems: mandar dos veces lo mismo deja lo mismo.
 */
export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error

  const b = (await request.json().catch(() => null)) as {
    id?: string
    sucursalId?: string
    sesionId?: string | null
    mesaId?: string | null
    mozoId?: string | null
    tipo?: string
    comensales?: number
    cliente?: string | null
    nota?: string | null
    items?: ItemEntrada[]
  } | null

  if (!b?.id || !b.sucursalId) return NextResponse.json({ error: 'Faltan datos del pedido' }, { status: 400 })
  const items = (b.items ?? []).filter((i) => i.id && i.nombre && i.cantidad > 0)

  const [estado] = await prisma.$queryRaw<Array<{ estado: string }>>`
    SELECT estado FROM pos_pedidos WHERE id = ${b.id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  if (estado && estado.estado !== 'abierto') {
    return NextResponse.json(
      { error: estado.estado === 'bloqueado' ? 'El pedido tiene la precuenta impresa' : 'El pedido ya está cerrado' },
      { status: 409 }
    )
  }

  // 15 s y no los 5 por defecto: un pedido largo son muchos inserts y el
  // pooler de Supabase agrega latencia a cada uno. Con el default, una mesa
  // de veinte platos se cae a mitad de guardado.
  await prisma.$transaction(
    async (tx) => {
    await tx.$executeRaw`
      INSERT INTO pos_pedidos (id, "clienteId", "sucursalId", "sesionId", "mesaId", "mozoId", tipo, numero, comensales, nota, cliente)
      SELECT ${b.id}::uuid, ${clienteId}::uuid, ${b.sucursalId}::uuid, ${b.sesionId || null}::uuid,
             ${b.mesaId || null}::uuid, ${b.mozoId || null}::uuid, ${b.tipo ?? 'mostrador'},
             COALESCE((SELECT max(numero) FROM pos_pedidos WHERE "sucursalId" = ${b.sucursalId}::uuid), 0) + 1,
             ${b.comensales ?? 1}, ${b.nota?.trim() || null}, ${b.cliente?.trim()?.slice(0, 150) || null}
      ON CONFLICT (id) DO UPDATE
        SET "mesaId" = EXCLUDED."mesaId", "mozoId" = EXCLUDED."mozoId",
            comensales = EXCLUDED.comensales, nota = EXCLUDED.nota,
            cliente = COALESCE(EXCLUDED.cliente, pos_pedidos.cliente),
            "sesionId" = COALESCE(EXCLUDED."sesionId", pos_pedidos."sesionId")
    `

    for (const i of items) {
      await tx.$executeRaw`
        INSERT INTO pos_pedido_items (id, "pedidoId", "productoId", nombre, cantidad, "precioUnitario", "alicuotaIva", nota, marca)
        VALUES (${i.id}::uuid, ${b.id}::uuid, ${i.productoId || null}::uuid, ${i.nombre},
                ${i.cantidad}, ${i.precioUnitario}, ${i.alicuotaIva ?? 21}, ${i.nota?.trim() || null},
                ${i.marca || null})
        ON CONFLICT (id) DO UPDATE
          SET cantidad = EXCLUDED.cantidad, nota = EXCLUDED.nota, marca = EXCLUDED.marca
        -- Un ítem ya enviado a cocina no se toca por acá: se anula con permiso.
        WHERE pos_pedido_items."enviadoAt" IS NULL
      `

      // Las opciones se reescriben enteras mientras el ítem no salió: son
      // pocas y así no hay que averiguar cuál cambió.
      if (i.opciones) {
        await tx.$executeRaw`
          DELETE FROM pos_pedido_item_opciones o
           WHERE o."pedidoItemId" = ${i.id}::uuid
             AND EXISTS (SELECT 1 FROM pos_pedido_items x WHERE x.id = o."pedidoItemId" AND x."enviadoAt" IS NULL)
        `
        for (const op of i.opciones) {
          await tx.$executeRaw`
            INSERT INTO pos_pedido_item_opciones ("pedidoItemId", "opcionId", grupo, nombre, "precioExtra")
            SELECT ${i.id}::uuid, ${op.opcionId || null}::uuid, ${op.grupo || null}, ${op.nombre}, ${op.precioExtra ?? 0}
             WHERE EXISTS (SELECT 1 FROM pos_pedido_items x WHERE x.id = ${i.id}::uuid AND x."enviadoAt" IS NULL)
          `
        }
      }
    }

    // Los que la pantalla ya no manda y nunca salieron a cocina, se van.
    const ids = items.map((i) => i.id)
    await tx.$executeRaw`
      DELETE FROM pos_pedido_items
       WHERE "pedidoId" = ${b.id}::uuid AND "enviadoAt" IS NULL
         AND NOT (id = ANY(${ids}::uuid[]))
    `

    await tx.$executeRaw`
      UPDATE pos_pedidos SET total = COALESCE((
        SELECT sum(i.cantidad * i."precioUnitario" * (1 - i."descuentoPct" / 100) - i."descuentoImporte")
          FROM pos_pedido_items i WHERE i."pedidoId" = ${b.id}::uuid AND i."anuladoAt" IS NULL
      ), 0) * (1 - "descuentoPct" / 100) - "descuentoImporte"
      WHERE id = ${b.id}::uuid
    `
    },
    { timeout: 15_000 }
  )

  const [r] = await prisma.$queryRaw<Array<{ numero: number; total: number }>>`
    SELECT numero, total::float8 AS total FROM pos_pedidos WHERE id = ${b.id}::uuid
  `
  return NextResponse.json({ id: b.id, numero: r?.numero, total: r?.total ?? 0 })
}

/** Marcar enviado a cocina, imprimir precuenta, reabrir o anular. */
export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error

  const b = (await request.json().catch(() => null)) as
    | {
        id?: string
        accion?: 'enviar' | 'precuenta' | 'reabrir' | 'anular' | 'anular_item' | 'descuento'
        descuentoPct?: number
        descuentoImporte?: number
        usuarioId?: string | null
        itemId?: string
        motivo?: string
        /** Quién puso la llave: queda en la auditoría. */
        autorizadoPor?: string | null
      }
    | null
  if (!b?.id || !b.accion) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const dueño = { id: b.id, clienteId }

  if (b.accion === 'enviar') {
    // Cada envío es una comanda distinta: el postre que se pide media hora
    // después sale impreso aparte y en el KDS entra como pedido nuevo, no
    // mezclado con los principales.
    const [ult] = await prisma.$queryRaw<Array<{ n: number | null }>>`
      SELECT max(comanda) AS n FROM pos_pedido_items WHERE "pedidoId" = ${dueño.id}::uuid
    `
    const comanda = (ult?.n ?? 0) + 1
    const n = await prisma.$executeRaw`
      UPDATE pos_pedido_items
         SET "enviadoAt" = now(), "estadoKds" = 'enviado', comanda = ${comanda}
       WHERE "pedidoId" = ${dueño.id}::uuid AND "enviadoAt" IS NULL AND "anuladoAt" IS NULL
    `
    return NextResponse.json({ enviados: n, comanda })
  }

  /**
   * Anula un plato que ya salió a cocina.
   *
   * No se borra la línea: queda anulada, con quién lo autorizó y por qué. La
   * mercadería se usó, y el que mira el arqueo tiene que poder ver qué pasó.
   */
  if (b.accion === 'anular_item') {
    if (!b.itemId) return NextResponse.json({ error: 'Falta el ítem' }, { status: 400 })
    const n = await prisma.$executeRaw`
      UPDATE pos_pedido_items i
         SET "anuladoAt" = now(), "anuladoPor" = ${b.autorizadoPor || null}::uuid,
             "motivoAnulacion" = ${b.motivo?.trim()?.slice(0, 200) || null}
       WHERE i.id = ${b.itemId}::uuid AND i."pedidoId" = ${dueño.id}::uuid AND i."anuladoAt" IS NULL
    `
    if (n === 0) return NextResponse.json({ error: 'El ítem ya estaba anulado' }, { status: 409 })

    await prisma.$executeRaw`
      UPDATE pos_pedidos SET total = COALESCE((
        SELECT sum(i.cantidad * i."precioUnitario" * (1 - i."descuentoPct" / 100) - i."descuentoImporte")
          FROM pos_pedido_items i WHERE i."pedidoId" = ${dueño.id}::uuid AND i."anuladoAt" IS NULL
      ), 0) * (1 - "descuentoPct" / 100) - "descuentoImporte"
      WHERE id = ${dueño.id}::uuid
    `
    await prisma.$executeRaw`
      INSERT INTO pos_auditoria ("clienteId", "usuarioId", accion, entidad, "entidadId", detalle)
      VALUES (${clienteId}::uuid, ${b.autorizadoPor || null}::uuid, 'anular_item', 'pedido_item',
              ${b.itemId}::uuid, ${b.motivo?.trim()?.slice(0, 200) || 'Sin motivo'})
    `
    return NextResponse.json({ ok: true })
  }

  /**
   * Descuento sobre toda la mesa, en porcentaje o en pesos.
   *
   * Queda en el pedido y no repartido en los platos: así el ticket dice
   * "descuento 10%" y no veinte precios raros que nadie puede explicar.
   */
  if (b.accion === 'descuento') {
    const pct = Math.min(100, Math.max(0, Number(b.descuentoPct ?? 0)))
    const importe = Math.max(0, Number(b.descuentoImporte ?? 0))
    await prisma.$executeRaw`
      UPDATE pos_pedidos SET "descuentoPct" = ${pct}, "descuentoImporte" = ${importe}
       WHERE id = ${dueño.id}::uuid AND "clienteId" = ${clienteId}::uuid AND estado IN ('abierto', 'bloqueado')
    `
    await prisma.$executeRaw`
      UPDATE pos_pedidos SET total = GREATEST(0, COALESCE((
        SELECT sum(i.cantidad * i."precioUnitario" * (1 - i."descuentoPct" / 100) - i."descuentoImporte")
          FROM pos_pedido_items i WHERE i."pedidoId" = ${dueño.id}::uuid AND i."anuladoAt" IS NULL
      ), 0) * (1 - "descuentoPct" / 100) - "descuentoImporte")
      WHERE id = ${dueño.id}::uuid
    `
    await prisma.$executeRaw`
      INSERT INTO pos_auditoria ("clienteId", "usuarioId", accion, entidad, "entidadId", detalle)
      VALUES (${clienteId}::uuid, ${b.autorizadoPor || null}::uuid, 'descuento', 'pedido', ${dueño.id}::uuid,
              ${`${pct}% + $${importe}. ${b.motivo?.trim()?.slice(0, 150) ?? ''}`})
    `
    const [r] = await prisma.$queryRaw<Array<{ total: number }>>`
      SELECT total::float8 AS total FROM pos_pedidos WHERE id = ${dueño.id}::uuid
    `
    return NextResponse.json({ ok: true, total: r?.total ?? 0 })
  }

  if (b.accion === 'precuenta') {
    // Bloquea la carga. Se reimprime las veces que haga falta sin cambiar nada.
    await prisma.$executeRaw`
      UPDATE pos_pedidos SET estado = 'bloqueado', "precuentaAt" = COALESCE("precuentaAt", now())
       WHERE id = ${dueño.id}::uuid AND "clienteId" = ${clienteId}::uuid AND estado = 'abierto'
    `
    return NextResponse.json({ ok: true })
  }

  if (b.accion === 'reabrir') {
    await prisma.$executeRaw`
      UPDATE pos_pedidos SET estado = 'abierto', "precuentaAt" = NULL
       WHERE id = ${dueño.id}::uuid AND "clienteId" = ${clienteId}::uuid AND estado = 'bloqueado'
    `
    await prisma.$executeRaw`
      INSERT INTO pos_auditoria ("clienteId", "usuarioId", accion, entidad, "entidadId", detalle)
      VALUES (${clienteId}::uuid, ${b.usuarioId || null}::uuid, 'cancelar_precuenta', 'pedido',
              ${dueño.id}::uuid, 'Se canceló la precuenta y se reabrió la mesa')
    `
    return NextResponse.json({ ok: true })
  }

  await prisma.$executeRaw`
    UPDATE pos_pedidos SET estado = 'anulado', "anuladoAt" = now()
     WHERE id = ${dueño.id}::uuid AND "clienteId" = ${clienteId}::uuid AND estado <> 'cerrado'
  `
  await prisma.$executeRaw`
    INSERT INTO pos_auditoria ("clienteId", "usuarioId", accion, entidad, "entidadId", detalle)
    VALUES (${clienteId}::uuid, ${b.usuarioId || null}::uuid, 'anular_pedido', 'pedido',
            ${dueño.id}::uuid, 'Pedido anulado')
  `
  return NextResponse.json({ ok: true })
}

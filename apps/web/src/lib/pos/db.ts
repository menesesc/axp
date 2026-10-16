import { prisma } from '@/lib/prisma'

/**
 * Acceso a datos del punto de venta.
 *
 * Todo con SQL crudo: son veinte tablas nuevas que no están en schema.prisma,
 * y agregarlas ahí no aporta nada mientras el modelo se sigue moviendo.
 *
 * Las escrituras reciben el id desde afuera cuando viene del cliente. Es lo
 * que hace que un pedido tomado sin internet no espere a la base y que un
 * reintento de la sincronización no duplique nada: el mismo id, la misma fila.
 */

export interface Categoria {
  id: string
  nombre: string
  /** Subcategorías: "Vinos → Catena Zapata". Null es categoría de primer nivel. */
  padreId: string | null
  orden: number
  color: string | null
  emoji: string | null
  activa: boolean
  productos: number
}

export interface Producto {
  id: string
  categoriaId: string | null
  categoriaNombre: string | null
  productMasterId: string | null
  nombre: string
  nombreTicket: string | null
  codigo: string | null
  precio: number
  alicuotaIva: number
  pantallas: string[]
  orden: number
  color: string | null
  icono: string | null
  fotoKey: string | null
  activo: boolean
  /** De qué producto de Maxirest viene, para ver qué descuenta de stock. */
  productoVenta: string | null
  /** Si ese producto tiene receta activa o es venta directa de un insumo. */
  descuentaStock: boolean
}

export async function categoriasDe(clienteId: string): Promise<Categoria[]> {
  return prisma.$queryRaw<Categoria[]>`
    SELECT c.id, c.nombre, c."padreId", c.orden, c.color, c.emoji, c.activa,
           (SELECT count(*)::int FROM pos_productos p WHERE p."categoriaId" = c.id) AS productos
      FROM pos_categorias c
     WHERE c."clienteId" = ${clienteId}::uuid
     ORDER BY c.orden, c.nombre
  `
}

export async function productosDe(clienteId: string): Promise<Producto[]> {
  return prisma.$queryRaw<Producto[]>`
    SELECT p.id, p."categoriaId", c.nombre AS "categoriaNombre", p."productMasterId",
           p.nombre, p."nombreTicket", p.codigo,
           p.precio::float8 AS precio, p."alicuotaIva"::float8 AS "alicuotaIva",
           p.pantallas, p.orden, p.color, p.icono, p."fotoKey", p.activo,
           pm.nombre AS "productoVenta",
           -- Lo que importa saber de un vistazo: si al venderlo se descuenta
           -- algo del depósito o se vende contra nada.
           (pm.id IS NOT NULL AND (
              EXISTS (SELECT 1 FROM sales_recipes r WHERE r."productMasterId" = pm.id AND r.activa)
              OR EXISTS (SELECT 1 FROM insumos i WHERE i."productMasterId" = pm.id AND i.activo)
           )) AS "descuentaStock"
      FROM pos_productos p
      LEFT JOIN pos_categorias c ON c.id = p."categoriaId"
      LEFT JOIN sales_product_master pm ON pm.id = p."productMasterId"
     WHERE p."clienteId" = ${clienteId}::uuid
     ORDER BY c.orden NULLS LAST, p.orden, p.nombre
  `
}

export interface UsuarioPos {
  id: string
  codigo: string
  nombre: string
  rol: string
  activo: boolean
  tienePin: boolean
  usuarioId: string | null
  usuarioNombre: string | null
}

export async function usuariosDe(clienteId: string): Promise<UsuarioPos[]> {
  return prisma.$queryRaw<UsuarioPos[]>`
    SELECT u.id, u.codigo, u.nombre, u.rol, u.activo,
           (u."pinHash" IS NOT NULL) AS "tienePin",
           u."usuarioId", a.nombre AS "usuarioNombre"
      FROM pos_usuarios u
      LEFT JOIN usuarios a ON a.id = u."usuarioId"
     WHERE u."clienteId" = ${clienteId}::uuid
     ORDER BY u.activo DESC, u.rol, u.nombre
  `
}

export interface Sucursal {
  id: string
  nombre: string
  direccion: string | null
  depositoId: string | null
  depositoNombre: string | null
  orden: number
  activa: boolean
  cajas: Array<{ id: string; nombre: string; puntoVenta: number | null; activa: boolean; sesionAbierta: boolean }>
}

export async function estructuraDe(clienteId: string): Promise<Sucursal[]> {
  const sucursales = await prisma.$queryRaw<Omit<Sucursal, 'cajas'>[]>`
    SELECT s.id, s.nombre, s.direccion, s."depositoId", d.nombre AS "depositoNombre",
           s.orden, s.activa
      FROM pos_sucursales s
      LEFT JOIN depositos d ON d.id = s."depositoId"
     WHERE s."clienteId" = ${clienteId}::uuid
     ORDER BY s.orden, s.nombre
  `
  if (sucursales.length === 0) return []

  const cajas = await prisma.$queryRaw<
    Array<{ sucursalId: string; id: string; nombre: string; puntoVenta: number | null; activa: boolean; sesionAbierta: boolean }>
  >`
    SELECT c."sucursalId", c.id, c.nombre, c."puntoVenta", c.activa,
           EXISTS (SELECT 1 FROM pos_sesiones s WHERE s."cajaId" = c.id AND s."cerradaAt" IS NULL) AS "sesionAbierta"
      FROM pos_cajas c
     WHERE c."clienteId" = ${clienteId}::uuid
     ORDER BY c.nombre
  `
  return sucursales.map((s) => ({ ...s, cajas: cajas.filter((c) => c.sucursalId === s.id) }))
}

/** Config del POS. Se crea en la primera lectura para no tener que darla de alta. */
export async function configuracionDe(clienteId: string) {
  const [cfg] = await prisma.$queryRaw<
    Array<{
      pantallas: string[]
      monedas: string[]
      usaCuentaCorriente: boolean
      usaPropina: boolean
      turnos: Array<{ nombre: string; desde: string }>
    }>
  >`
    INSERT INTO pos_configuracion ("clienteId") VALUES (${clienteId}::uuid)
    ON CONFLICT ("clienteId") DO UPDATE SET "updatedAt" = pos_configuracion."updatedAt"
    RETURNING pantallas, monedas, "usaCuentaCorriente", "usaPropina", turnos
  `
  return cfg!
}

export interface GrupoOpciones {
  id: string
  nombre: string
  minimo: number
  maximo: number
  /** Admite escribir algo que no está en la lista. */
  permiteTexto: boolean
  opciones: Array<{ id: string; nombre: string; precioExtra: number }>
  /** Productos que piden este grupo. */
  productos: string[]
}

/**
 * Los grupos de opciones con sus opciones y a qué productos aplican.
 *
 * Dos cosas que parecen distintas y son la misma: el fetuccini que exige
 * elegir una salsa (mínimo 1, máximo 1) y el helado que admite hasta dos
 * sabores (mínimo 0, máximo 2).
 */
export async function gruposDe(clienteId: string): Promise<GrupoOpciones[]> {
  const grupos = await prisma.$queryRaw<Array<Omit<GrupoOpciones, 'opciones' | 'productos'>>>`
    SELECT g.id, g.nombre, g.minimo, g.maximo, g."permiteTexto"
      FROM pos_opcion_grupos g
     WHERE g."clienteId" = ${clienteId}::uuid AND g.activo
     ORDER BY g.orden, g.nombre
  `
  if (grupos.length === 0) return []

  const [opciones, vinculos] = await Promise.all([
    prisma.$queryRaw<Array<{ grupoId: string; id: string; nombre: string; precioExtra: number }>>`
      SELECT o."grupoId", o.id, o.nombre, o."precioExtra"::float8 AS "precioExtra"
        FROM pos_opciones o
        JOIN pos_opcion_grupos g ON g.id = o."grupoId"
       WHERE g."clienteId" = ${clienteId}::uuid AND o.activa
       ORDER BY o.orden, o.nombre
    `,
    prisma.$queryRaw<Array<{ grupoId: string; productoId: string }>>`
      SELECT pg."grupoId", pg."productoId"
        FROM pos_producto_grupos pg
        JOIN pos_opcion_grupos g ON g.id = pg."grupoId"
       WHERE g."clienteId" = ${clienteId}::uuid
       ORDER BY pg.orden
    `,
  ])

  return grupos.map((g) => ({
    ...g,
    opciones: opciones.filter((o) => o.grupoId === g.id).map(({ grupoId: _g, ...o }) => o),
    productos: vinculos.filter((v) => v.grupoId === g.id).map((v) => v.productoId),
  }))
}

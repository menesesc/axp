import {
  ChefHat,
  CreditCard,
  FileText,
  LayoutDashboard,
  Package,
  PieChart,
  Settings,
  ShoppingCart,
  Users,
  Warehouse,
} from 'lucide-react'
import { esRutaComun, seccionesDeRuta } from '@/lib/permisos'
import type { NombreEscena } from './escenas'

export interface SubPantalla {
  nombre: string
  href: string
}

export type Contador = 'pendientes' | 'compras' | 'logs'

export interface Modulo {
  id: string
  nombre: string
  icono: typeof FileText
  /** Escena del encabezado para las pantallas del módulo. */
  escena: NombreEscena
  /** Pantallas del módulo, en orden: la primera visible es la de entrada. */
  subs: SubPantalla[]
  contador?: Contador
  /** Prefijos de ruta extra que pertenecen al módulo (detalles, altas…). */
  prefijos?: string[]
}

/**
 * Menú agrupado por uso: arriba lo de todos los días, después el recetario,
 * después lo que se consulta de vez en cuando. Cada módulo agrupa sus
 * pantallas, que se muestran como pestañas debajo del título.
 */
export const MENU: Modulo[][] = [
  [
    { id: 'inicio', nombre: 'Inicio', icono: LayoutDashboard, escena: 'inicio', subs: [{ nombre: 'Inicio', href: '/dashboard' }] },
    {
      id: 'comprobantes',
      nombre: 'Comprobantes',
      icono: FileText,
      escena: 'comprobantes',
      contador: 'pendientes',
      subs: [
        { nombre: 'Comprobantes', href: '/documentos' },
        { nombre: 'Anotaciones', href: '/anotaciones' },
      ],
      prefijos: ['/documento/'],
    },
    {
      id: 'pagos',
      nombre: 'Pagos',
      icono: CreditCard,
      escena: 'pagos',
      subs: [
        { nombre: 'Órdenes de pago', href: '/pagos' },
        { nombre: 'Calendario', href: '/finanzas' },
      ],
      prefijos: ['/pagos/'],
    },
    { id: 'ventas', nombre: 'Ventas', icono: ShoppingCart, escena: 'ventas', subs: [{ nombre: 'Ventas', href: '/ventas' }] },
    {
      id: 'stock',
      nombre: 'Stock',
      icono: Warehouse,
      escena: 'stock',
      contador: 'compras',
      subs: [
        { nombre: 'Compras sugeridas', href: '/compras' },
        { nombre: 'Pedidos internos', href: '/pedidos' },
        { nombre: 'Conteo', href: '/conciliacion/stock' },
        { nombre: 'Insumos', href: '/conciliacion/insumos' },
        { nombre: 'Recetas de costeo', href: '/conciliacion/recetas' },
        { nombre: 'Conciliación', href: '/conciliacion' },
      ],
      prefijos: ['/conciliacion/'],
    },
  ],
  [
    {
      id: 'recetario',
      nombre: 'Recetario',
      icono: ChefHat,
      escena: 'recetas',
      subs: [
        { nombre: 'Recetas', href: '/recetas' },
        { nombre: 'Categorías y dispositivos', href: '/configuracion/recetario' },
      ],
      prefijos: ['/recetas/'],
    },
  ],
  [
    { id: 'proveedores', nombre: 'Proveedores', icono: Users, escena: 'proveedores', subs: [{ nombre: 'Proveedores', href: '/proveedores' }] },
    { id: 'items', nombre: 'Items', icono: Package, escena: 'items', subs: [{ nombre: 'Items', href: '/items' }] },
    {
      id: 'informes',
      nombre: 'Informes',
      icono: PieChart,
      escena: 'informes',
      subs: [
        { nombre: 'Resumen', href: '/informes' },
        { nombre: 'Estadísticas', href: '/estadisticas' },
        { nombre: 'Ventas', href: '/informes/ventas' },
        { nombre: 'Compras', href: '/informes/compras' },
        { nombre: 'Cuenta corriente', href: '/informes/cuenta-corriente' },
        { nombre: 'Precios', href: '/informes/precios' },
        { nombre: 'Proyecciones IA', href: '/informes/proyecciones' },
      ],
      prefijos: ['/informes/'],
    },
  ],
]

export const CONFIGURACION: Modulo = {
  id: 'configuracion',
  nombre: 'Configuración',
  icono: Settings,
  escena: 'configuracion',
  contador: 'logs',
  subs: [
    { nombre: 'Empresa', href: '/configuracion/empresa' },
    { nombre: 'Usuarios', href: '/configuracion/usuarios' },
    { nombre: 'Canales', href: '/configuracion/canales' },
    { nombre: 'Informes por mail', href: '/configuracion/informes' },
    { nombre: 'Depósitos', href: '/configuracion/depositos' },
    { nombre: 'Procesamiento', href: '/procesamiento' },
    { nombre: 'Mi plan', href: '/configuracion/plan' },
  ],
  prefijos: ['/configuracion/'],
}

export const MODULOS: Modulo[] = [...MENU.flat(), CONFIGURACION]

type Puede = (seccion: string) => boolean

/** ¿El usuario puede abrir esta pantalla? Misma regla que el middleware. */
export function puedeVerRuta(href: string, can: Puede) {
  if (esRutaComun(href)) return true
  const secciones = seccionesDeRuta(href)
  return secciones.length > 0 && secciones.some((s) => can(s.value))
}

/** Pantallas del módulo que el usuario puede abrir. */
export function subsVisibles(m: Modulo, can: Puede) {
  return m.subs.filter((s) => puedeVerRuta(s.href, can))
}

/**
 * Módulo y pantalla de una ruta. Primero busca una pantalla exacta; si no,
 * el prefijo más largo (detalle de un pago, ficha de receta, etc.).
 */
export function ubicar(pathname: string) {
  for (const m of MODULOS) {
    const s = m.subs.find((x) => x.href === pathname)
    if (s) return { modulo: m, sub: s, exacta: true }
  }
  let mejor: { modulo: Modulo; largo: number } | null = null
  for (const m of MODULOS) {
    for (const p of [...(m.prefijos ?? []), ...m.subs.map((s) => s.href + '/')]) {
      if (pathname.startsWith(p) && (!mejor || p.length > mejor.largo)) mejor = { modulo: m, largo: p.length }
    }
  }
  if (!mejor) return null
  const sub = [...mejor.modulo.subs].sort((a, b) => b.href.length - a.href.length).find((s) => pathname.startsWith(s.href)) ?? null
  return { modulo: mejor.modulo, sub, exacta: false }
}

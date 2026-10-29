'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import type { Route } from 'next'
import {
  Bell,
  BookOpen,
  ChefHat,
  ChevronDown,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Upload,
  UserRound,
  Users,
  Warehouse,
  X,
} from 'lucide-react'
import iconoAxp from '../../app/icon.png'
import { Escena, type NombreEscena } from './escenas'
import './prototipo.css'

export interface Sub {
  nombre: string
  href: string
}

export interface Modulo {
  nombre: string
  href: string
  icono: typeof FileText
  contador?: { n: number; tono: 'azul' | 'ambar' | 'rojo' }
  /** Pantallas del módulo: se muestran como pestañas debajo de la barra superior. */
  subs?: Sub[]
}

/**
 * Menú agrupado por uso: arriba lo de todos los días, después lo que se
 * consulta de vez en cuando. Las pantallas de cada módulo pasan a pestañas.
 */
export const MENU: Modulo[][] = [
  [
    { nombre: 'Inicio', href: '/dashboard', icono: LayoutDashboard },
    {
      nombre: 'Comprobantes',
      href: '/documentos',
      icono: FileText,
      contador: { n: 4, tono: 'ambar' },
      subs: [
        { nombre: 'Comprobantes', href: '/documentos' },
        { nombre: 'Anotaciones', href: '/anotaciones' },
      ],
    },
    {
      nombre: 'Pagos',
      href: '/pagos',
      icono: CreditCard,
      subs: [
        { nombre: 'Órdenes de pago', href: '/pagos' },
        { nombre: 'Calendario', href: '/finanzas' },
      ],
    },
    { nombre: 'Ventas', href: '/ventas', icono: ShoppingCart },
    {
      nombre: 'Stock',
      href: '/compras',
      icono: Warehouse,
      contador: { n: 3, tono: 'rojo' },
      subs: [
        { nombre: 'Compras sugeridas', href: '/compras' },
        { nombre: 'Pedidos internos', href: '/pedidos' },
        { nombre: 'Conteo', href: '/conciliacion/stock' },
        { nombre: 'Insumos', href: '/conciliacion/insumos' },
        { nombre: 'Conciliación', href: '/conciliacion' },
      ],
    },
  ],
  [
    { nombre: 'Proveedores', href: '/proveedores', icono: Users },
    { nombre: 'Items', href: '/items', icono: Package },
    { nombre: 'Recetas', href: '/recetas', icono: ChefHat },
    {
      nombre: 'Informes',
      href: '/informes',
      icono: PieChart,
      subs: [
        { nombre: 'Resumen', href: '/informes' },
        { nombre: 'Estadísticas', href: '/estadisticas' },
        { nombre: 'Ventas', href: '/informes/ventas' },
        { nombre: 'Compras', href: '/informes/compras' },
        { nombre: 'Cuenta corriente', href: '/informes/cuenta-corriente' },
        { nombre: 'Precios', href: '/informes/precios' },
        { nombre: 'Proyecciones IA', href: '/informes/proyecciones' },
      ],
    },
  ],
]

export const CONFIGURACION: Modulo = {
  nombre: 'Configuración',
  href: '/configuracion/empresa',
  icono: Settings,
  subs: [
    { nombre: 'Empresa', href: '/configuracion/empresa' },
    { nombre: 'Usuarios', href: '/configuracion/usuarios' },
    { nombre: 'Canales', href: '/configuracion/canales' },
    { nombre: 'Informes por mail', href: '/configuracion/informes' },
    { nombre: 'Depósitos', href: '/configuracion/depositos' },
    { nombre: 'Procesamiento', href: '/procesamiento' },
    { nombre: 'Mi plan', href: '/configuracion/plan' },
  ],
}

export const MODULOS = [...MENU.flat(), CONFIGURACION]

export const RAIZ = '/prototipo'
export const ruta = (href: string) => (href === '/dashboard' ? RAIZ : `${RAIZ}${href}`) as Route

/** Módulo y pantalla que corresponden a una ruta del prototipo. */
export function itemDeRuta(pathname: string) {
  const sub = pathname.replace(RAIZ, '') || '/dashboard'
  for (const m of MODULOS) {
    if (m.href === sub && !m.subs) return { modulo: m, sub: null }
    const s = m.subs?.find((x) => x.href === sub)
    if (s) return { modulo: m, sub: s }
  }
  return null
}

const TONO: Record<string, string> = {
  azul: 'bg-[rgba(59,155,255,0.16)] text-[var(--azul-2)]',
  ambar: 'bg-[rgba(245,165,36,0.2)] text-[var(--ambar-2)]',
  rojo: 'bg-[rgba(239,68,68,0.14)] text-[var(--rojo-t)]',
}
const PUNTO: Record<string, string> = { azul: 'bg-[var(--azul)]', ambar: 'bg-[var(--ambar)]', rojo: 'bg-[var(--rojo)]' }

function ItemLateral({ m, activo, mini, onNavegar }: { m: Modulo; activo: boolean; mini: boolean; onNavegar: () => void }) {
  const Icono = m.icono
  return (
    <Link
      href={ruta(m.href)}
      onClick={onNavegar}
      className="pt-item"
      data-activo={activo ? '1' : '0'}
      data-mini={mini ? '1' : '0'}
      aria-current={activo ? 'page' : undefined}
      aria-label={mini ? m.nombre : undefined}
    >
      <span className="relative shrink-0">
        <Icono className="h-[18px] w-[18px]" />
        {mini && m.contador && (
          <span className={`absolute -right-1.5 -top-1 h-2 w-2 rounded-full shadow-[0_0_0_2px_#fff] ${PUNTO[m.contador.tono]}`} />
        )}
      </span>
      {!mini && <span className="truncate">{m.nombre}</span>}
      {!mini && m.contador && <span className={`pt-contador ${TONO[m.contador.tono]}`}>{m.contador.n}</span>}
      {mini && <span className="pt-globo">{m.nombre}</span>}
    </Link>
  )
}

function Lateral({ mini = false, onNavegar, onMini }: { mini?: boolean; onNavegar?: () => void; onMini?: () => void }) {
  const pathname = usePathname()
  const modulo = itemDeRuta(pathname)?.modulo
  const navegar = () => onNavegar?.()

  return (
    <div className="flex h-full flex-col">
      <div className={`flex h-[4.5rem] shrink-0 items-center justify-center ${mini ? 'px-2' : 'px-5'}`}>
        <Link href={RAIZ as Route} onClick={navegar} aria-label="AXP, ir al inicio">
          {mini ? (
            <Image src={iconoAxp} alt="" width={36} height={36} className="rounded-[10px]" priority />
          ) : (
            <Image src="/marca/axp-logo.png" alt="AXP" width={91} height={42} priority />
          )}
        </Link>
      </div>

      <nav className={`pt-sin-barra flex-1 overflow-y-auto pb-4 ${mini ? 'px-2.5' : 'px-3'}`} aria-label="Menú principal">
        {MENU.map((bloque, b) => (
          <div key={b} className={b > 0 ? 'mt-3 border-t border-[var(--borde)] pt-3' : ''}>
            <div className="space-y-0.5">
              {bloque.map((m) => (
                <ItemLateral key={m.href} m={m} activo={modulo === m} mini={mini} onNavegar={navegar} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className={`shrink-0 space-y-0.5 border-t border-[var(--borde)] py-3 ${mini ? 'px-2.5' : 'px-3'}`}>
        <ItemLateral m={CONFIGURACION} activo={modulo === CONFIGURACION} mini={mini} onNavegar={navegar} />
        {onMini && (
          <button type="button" className="pt-item w-full" data-mini={mini ? '1' : '0'} onClick={onMini} aria-label={mini ? 'Expandir menú' : 'Minimizar menú'}>
            {mini ? <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" /> : <PanelLeftClose className="h-[18px] w-[18px] shrink-0" />}
            {!mini && <span>Minimizar</span>}
            {mini && <span className="pt-globo">Expandir menú</span>}
          </button>
        )}
      </div>
    </div>
  )
}

/** Pestañas con las pantallas del módulo actual, debajo del título. */
function PestanasModulo() {
  const pathname = usePathname()
  const actual = itemDeRuta(pathname)
  if (!actual?.modulo.subs) return null
  return (
    <nav className="pt-subnav pt-sin-barra mb-6 flex gap-1 overflow-x-auto" aria-label={`Secciones de ${actual.modulo.nombre}`}>
      {actual.modulo.subs.map((s) => {
        const activa = actual.sub === s
        return (
          <Link key={s.href} href={ruta(s.href)} className="pt-subtab" data-activo={activa ? '1' : '0'} aria-current={activa ? 'page' : undefined}>
            {s.nombre}
          </Link>
        )
      })}
    </nav>
  )
}

const CLAVE_MINI = 'axp-prototipo-menu-mini'

export function Shell({ fuente, children }: { fuente: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const [abierto, setAbierto] = useState(false)
  const [mini, setMini] = useState(false)
  const actual = itemDeRuta(pathname)

  useEffect(() => setAbierto(false), [pathname])

  useEffect(() => {
    try {
      setMini(localStorage.getItem(CLAVE_MINI) === '1')
    } catch {}
  }, [])

  const alternarMini = () =>
    setMini((v) => {
      try {
        localStorage.setItem(CLAVE_MINI, v ? '0' : '1')
      } catch {}
      return !v
    })

  // Brillo que sigue al cursor en las tarjetas.
  const mover = (e: React.PointerEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.pt-card')
    if (!t) return
    const r = t.getBoundingClientRect()
    t.style.setProperty('--mx', `${e.clientX - r.left}px`)
    t.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  return (
    <div className={`pt ${fuente}`} onPointerMove={mover} data-mini={mini ? '1' : '0'}>
      {/* Lateral fijo en escritorio */}
      <aside className="pt-lateral pt-lateral-fijo fixed inset-y-0 left-0 z-40 hidden lg:block">
        <Lateral mini={mini} onMini={alternarMini} />
      </aside>

      {/* Lateral desplegable en celular */}
      {abierto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-slate-900/25 backdrop-blur-sm" aria-label="Cerrar menú" onClick={() => setAbierto(false)} />
          <aside className="pt-lateral absolute inset-y-0 left-0 w-[16rem] pt-entra">
            <button type="button" className="absolute right-3 top-6 text-[var(--sec)]" aria-label="Cerrar menú" onClick={() => setAbierto(false)}>
              <X className="h-5 w-5" />
            </button>
            <Lateral onNavegar={() => setAbierto(false)} />
          </aside>
        </div>
      )}

      <div className="pt-contenido">
        <header className="pt-top sticky top-0 z-30">
          <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" className="lg:hidden text-[var(--sec)]" aria-label="Abrir menú" onClick={() => setAbierto(true)}>
                <Menu className="h-5 w-5" />
              </button>
              <p className="hidden md:block text-sm text-[var(--ter)] truncate">
                {actual ? (
                  actual.sub && actual.sub.nombre !== actual.modulo.nombre ? (
                    <>
                      {actual.modulo.nombre} <span className="mx-1.5">/</span>
                      <span className="text-[var(--texto)]">{actual.sub.nombre}</span>
                    </>
                  ) : (
                    <span className="text-[var(--texto)]">{actual.modulo.nombre}</span>
                  )
                ) : null}
              </p>
            </div>

            <button type="button" className="pt-buscador sm:w-[22rem] xl:w-[28rem]" aria-label="Buscar">
              <Search className="h-4 w-4 shrink-0" />
              <span className="hidden sm:block flex-1 text-left truncate">Buscar factura, proveedor o artículo</span>
              <span className="pt-tecla hidden sm:inline">⌘K</span>
            </button>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[var(--sec)] hover:bg-slate-900/5 hover:text-[var(--texto)]"
                aria-label="Notificaciones"
              >
                <Bell className="h-[18px] w-[18px]" />
                <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[var(--ambar)] shadow-[0_0_0_3px_#fff]" />
              </button>
              <button type="button" className="pt-boton pt-boton-primario shrink-0 max-md:w-10 max-md:px-0" aria-label="Subir factura">
                <Upload className="h-4 w-4 shrink-0" />
                <span className="hidden md:inline">Subir factura</span>
              </button>
              <Usuario />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[90rem] px-4 sm:px-6 lg:px-8 py-6 lg:py-8">{children}</main>

        <p className="mx-auto max-w-[90rem] px-4 sm:px-6 lg:px-8 pb-6 text-xs text-[var(--ter)]">
          Prototipo de diseño con datos de ejemplo. No está conectado a tu información.
        </p>
      </div>
    </div>
  )
}

/** Avatar del usuario en la barra superior con su menú desplegable. */
function Usuario() {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const cerrar = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAbierto(false)
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', cerrar)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', cerrar)
      document.removeEventListener('keydown', escape)
    }
  }, [abierto])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-xl p-1 pr-1.5 hover:bg-slate-900/5"
        aria-label="Menú de usuario"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#4aa6ff] to-[var(--azul-p)] text-xs font-semibold text-white">
          CM
        </span>
        <ChevronDown className={`hidden sm:block h-4 w-4 text-[var(--ter)] transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <div className="pt-menu-usuario z-50" role="menu">
          <div className="px-3 pb-3 pt-2 border-b border-[var(--borde)] mb-1">
            <p className="text-sm font-medium text-[var(--texto)]">Cristian Meneses</p>
            <p className="text-xs text-[var(--ter)]">Plan Professional</p>
          </div>
          <Link href={ruta('/configuracion/empresa')} role="menuitem" onClick={() => setAbierto(false)}>
            <UserRound className="h-4 w-4" /> Mi cuenta
          </Link>
          <Link href={ruta('/configuracion/plan')} role="menuitem" onClick={() => setAbierto(false)}>
            <Sparkles className="h-4 w-4" /> Mi plan
          </Link>
          <a href="#" role="menuitem" onClick={(e) => e.preventDefault()}>
            <BookOpen className="h-4 w-4" /> Ayuda
          </a>
          <button type="button" role="menuitem" className="text-[var(--rojo-t)]">
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}

/** Encabezado de cada pantalla: banda con título, bajada, acciones y una escena animada. */
export function Titulo({
  titulo,
  bajada,
  acciones,
  escena = 'generica',
}: {
  titulo: string
  bajada?: string
  acciones?: React.ReactNode
  escena?: NombreEscena
}) {
  return (
    <>
    <section className="pt-hero pt-entra">
      <div className="relative z-10 min-w-0 py-1">
        <h1 className="pt-display text-[clamp(1.7rem,3vw,2.3rem)] font-semibold leading-tight">{titulo}</h1>
        {bajada && <p className="mt-1.5 max-w-xl text-[15px] text-[var(--sec)]">{bajada}</p>}
        {acciones && <div className="mt-5 flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>
      <div className="pt-hero-escena">
        <Escena nombre={escena} />
      </div>
    </section>
    <PestanasModulo />
    <div className="pt-hero-sep" />
    </>
  )
}

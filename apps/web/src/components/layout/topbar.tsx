'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { Route } from 'next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  Bell,
  BookOpen,
  ChevronDown,
  CornerDownLeft,
  FileText,
  LogOut,
  Menu,
  Package,
  Search,
  Settings,
  ShoppingBasket,
  Sparkles,
  Upload,
} from 'lucide-react'
import { useUser } from '@/hooks/use-user'
import { useSubscription } from '@/hooks/use-subscription'
import { SECCION } from '@/lib/permisos'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UploadDropzone } from '@/components/documents/upload-dropzone'
import { MODULOS, puedeVerRuta, ubicar } from './navegacion'
import type { Contadores } from './sidebar'

/* ------------------------------------------------------------- buscador */

interface Resultado {
  id: string
  grupo: string
  titulo: string
  detalle?: string
  href: string
  icono: typeof FileText
}

function useDebounce<T>(valor: T, ms = 250) {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return v
}

/**
 * Buscador global (⌘K): pantallas del menú, comprobantes e items. Cada grupo
 * se consulta solo si el usuario tiene permiso de esa sección.
 */
function Buscador({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const router = useRouter()
  const { can } = useUser()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const busqueda = useDebounce(q.trim())
  const conTexto = busqueda.length >= 2

  useEffect(() => {
    if (!abierto) setQ('')
  }, [abierto])

  const { data: docs } = useQuery({
    queryKey: ['buscador-docs', busqueda],
    queryFn: async () => {
      const r = await fetch(`/api/documentos?q=${encodeURIComponent(busqueda)}&pageSize=5`)
      if (!r.ok) return []
      const j = await r.json()
      return (j.documentos ?? []) as Array<{ id: string; tipo: string; letra: string | null; numeroCompleto: string | null; proveedores: { razonSocial: string } | null }>
    },
    enabled: abierto && conTexto && can(SECCION.DOC_COMPROBANTES),
    staleTime: 30_000,
  })

  const { data: items } = useQuery({
    queryKey: ['buscador-items', busqueda],
    queryFn: async () => {
      const r = await fetch(`/api/items?q=${encodeURIComponent(busqueda)}&limit=5`)
      if (!r.ok) return []
      const j = await r.json()
      return (j.items ?? []) as Array<{ id: string; descripcion: string; proveedor: { razonSocial: string } | null }>
    },
    enabled: abierto && conTexto && can(SECCION.DOC_ITEMS),
    staleTime: 30_000,
  })

  const resultados = useMemo<Resultado[]>(() => {
    const t = q.trim().toLowerCase()
    const pantallas: Resultado[] = MODULOS.flatMap((m) =>
      m.subs
        .filter((s) => puedeVerRuta(s.href, can))
        .filter((s) => !t || `${m.nombre} ${s.nombre}`.toLowerCase().includes(t))
        .map((s) => ({
          id: `p-${s.href}`,
          grupo: 'Ir a',
          titulo: s.nombre === m.nombre ? s.nombre : `${m.nombre}: ${s.nombre}`,
          href: s.href,
          icono: m.icono,
        }))
    ).slice(0, t ? 6 : 8)
    const comprobantes: Resultado[] = conTexto
      ? (docs ?? []).map((d) => ({
          id: `d-${d.id}`,
          grupo: 'Comprobantes',
          titulo: d.proveedores?.razonSocial ?? 'Sin proveedor',
          detalle: [d.tipo, d.letra, d.numeroCompleto].filter(Boolean).join(' '),
          href: `/documento/${d.id}`,
          icono: FileText,
        }))
      : []
    const articulos: Resultado[] = conTexto
      ? (items ?? []).map((i) => ({
          id: `i-${i.id}`,
          grupo: 'Items',
          titulo: i.descripcion,
          ...(i.proveedor?.razonSocial ? { detalle: i.proveedor.razonSocial } : {}),
          href: `/items?q=${encodeURIComponent(i.descripcion)}`,
          icono: Package,
        }))
      : []
    return [...pantallas, ...comprobantes, ...articulos]
  }, [q, docs, items, can, conTexto])

  useEffect(() => setSel(0), [q])

  const ir = (r: Resultado | undefined) => {
    if (!r) return
    onCerrar()
    router.push(r.href as Route)
  }

  let grupoAnterior = ''
  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="top-[12vh] max-w-[calc(100vw-2rem)] translate-y-0 gap-0 overflow-hidden rounded-2xl p-0 data-[state=closed]:slide-out-to-top-[2%] data-[state=open]:slide-in-from-top-[2%] sm:max-w-xl [&>button]:hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Buscar</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 border-b border-[var(--borde)] px-4">
          <Search className="h-4 w-4 shrink-0 text-[var(--ter)]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSel((s) => Math.min(s + 1, resultados.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSel((s) => Math.max(s - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                ir(resultados[sel])
              }
            }}
            placeholder="Buscar factura, proveedor, artículo o pantalla"
            className="h-14 w-full bg-transparent text-base text-[var(--texto)] outline-none placeholder:text-[var(--ter)]"
            aria-label="Buscar"
          />
          <kbd className="ax-tecla">Esc</kbd>
        </div>
        <ul className="ax-sin-barra max-h-[min(24rem,60vh)] overflow-y-auto p-2" role="listbox">
          {resultados.length === 0 && <li className="px-3 py-8 text-center text-sm text-[var(--sec)]">No hay resultados para “{q}”.</li>}
          {resultados.map((r, i) => {
            const encabezado = r.grupo !== grupoAnterior ? r.grupo : null
            grupoAnterior = r.grupo
            const Icono = r.icono
            return (
              <li key={r.id} role="option" aria-selected={i === sel}>
                {encabezado && <p className="px-3 pb-1.5 pt-2.5 text-xs font-medium text-[var(--ter)]">{encabezado}</p>}
                <button
                  type="button"
                  onMouseEnter={() => setSel(i)}
                  onClick={() => ir(r)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${i === sel ? 'bg-[rgba(59,155,255,0.1)] text-[var(--azul-p)]' : 'text-[var(--texto)]'}`}
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${i === sel ? 'bg-white text-[var(--azul)] shadow-sm' : 'bg-slate-900/[0.04] text-[var(--sec)]'}`}>
                    <Icono className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.titulo}
                    {r.detalle && <span className="ml-2 text-xs text-[var(--ter)]">{r.detalle}</span>}
                  </span>
                  {i === sel && <CornerDownLeft className="h-3.5 w-3.5 text-[var(--ter)]" />}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="flex items-center gap-4 border-t border-[var(--borde)] bg-[var(--pizarra-2)] px-4 py-2.5 text-xs text-[var(--ter)]">
          <span className="flex items-center gap-1.5"><kbd className="ax-tecla">↑</kbd><kbd className="ax-tecla">↓</kbd> para moverte</span>
          <span className="flex items-center gap-1.5"><kbd className="ax-tecla">Enter</kbd> para abrir</span>
          <span className="ml-auto hidden sm:block">Escribí al menos 2 letras para buscar facturas e items</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------ barra top */

export function Topbar({ contadores, onAbrirMenu }: { contadores: Contadores; onAbrirMenu: () => void }) {
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const { user, isAdmin, can, canEdit, signOut } = useUser()
  const { subscription } = useSubscription()
  const [buscar, setBuscar] = useState(false)
  const [subir, setSubir] = useState(false)
  const actual = ubicar(pathname)

  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setBuscar((v) => !v)
      }
    }
    window.addEventListener('keydown', atajo)
    return () => window.removeEventListener('keydown', atajo)
  }, [])

  const puedeSubir = canEdit(SECCION.DOC_COMPROBANTES)
  const iniciales = (user?.nombre ?? user?.email ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  const avisos = [
    { n: contadores.pendientes ?? 0, texto: 'comprobantes para revisar', href: '/documentos', icono: AlertTriangle, ver: can(SECCION.DOC_COMPROBANTES) },
    { n: contadores.compras ?? 0, texto: 'insumos para pedir ya', href: '/compras', icono: ShoppingBasket, ver: can(SECCION.CONCILIACION_COMPRAS) },
    { n: contadores.logs ?? 0, texto: 'avisos de procesamiento', href: '/procesamiento', icono: Activity, ver: can(SECCION.SISTEMA_PROCESAMIENTO) },
  ].filter((a) => a.ver && a.n > 0)
  const totalAvisos = avisos.reduce((s, a) => s + a.n, 0)

  return (
    <>
      <header className="ax-top sticky top-0 z-30">
        <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" className="text-[var(--sec)] lg:hidden" aria-label="Abrir menú" onClick={onAbrirMenu}>
              <Menu className="h-5 w-5" />
            </button>
            <p className="hidden truncate text-sm text-[var(--ter)] md:block">
              {actual &&
                (actual.sub && actual.sub.nombre !== actual.modulo.nombre ? (
                  <>
                    {actual.modulo.nombre} <span className="mx-1.5">/</span>
                    <span className="text-[var(--texto)]">{actual.sub.nombre}</span>
                  </>
                ) : (
                  <span className="text-[var(--texto)]">{actual.modulo.nombre}</span>
                ))}
            </p>
          </div>

          <button type="button" className="ax-buscador sm:w-[22rem] xl:w-[28rem]" onClick={() => setBuscar(true)} aria-label="Buscar (⌘K)">
            <Search className="h-4 w-4 shrink-0" />
            <span className="hidden flex-1 truncate text-left sm:block">Buscar factura, proveedor o artículo</span>
            <span className="ax-tecla hidden sm:inline">⌘K</span>
          </button>

          <div className="flex items-center justify-end gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[var(--sec)] hover:bg-slate-900/5 hover:text-[var(--texto)]"
                  aria-label={totalAvisos ? `Avisos: ${totalAvisos}` : 'Avisos'}
                >
                  <Bell className="h-[18px] w-[18px]" />
                  {totalAvisos > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[var(--ambar)] shadow-[0_0_0_3px_#fff]" />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 rounded-2xl p-1.5">
                <DropdownMenuLabel className="text-xs font-normal text-[var(--ter)]">Avisos</DropdownMenuLabel>
                {avisos.length === 0 && <p className="px-2 py-4 text-center text-sm text-[var(--sec)]">Todo al día. No hay nada pendiente.</p>}
                {avisos.map((a) => (
                  <DropdownMenuItem key={a.href} asChild className="cursor-pointer rounded-xl">
                    <Link href={a.href as Route} className="flex items-center gap-3">
                      <a.icono className="h-4 w-4 text-[var(--ambar-2)]" />
                      <span className="text-sm">
                        <b className="font-semibold">{a.n}</b> {a.texto}
                      </span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {puedeSubir && (
              <button type="button" className="ax-boton ax-boton-primario shrink-0 max-md:w-10 max-md:px-0" onClick={() => setSubir(true)} aria-label="Subir factura">
                <Upload className="h-4 w-4 shrink-0" />
                <span className="hidden md:inline">Subir factura</span>
              </button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex items-center gap-1.5 rounded-xl p-1 pr-1.5 hover:bg-slate-900/5" aria-label="Menú de usuario">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#4aa6ff] to-[var(--azul-p)] text-xs font-semibold text-white">
                    {iniciales}
                  </span>
                  <ChevronDown className="hidden h-4 w-4 text-[var(--ter)] sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-2xl p-1.5">
                <div className="px-2.5 pb-2.5 pt-1.5">
                  <p className="truncate text-sm font-medium text-[var(--texto)]">{user?.nombre}</p>
                  <p className="truncate text-xs text-[var(--ter)]">{user?.email}</p>
                  <p className="mt-1 text-xs text-[var(--ter)]">
                    {subscription?.plan_nombre ? `Plan ${subscription.plan_nombre}` : ''}
                    {subscription?.plan_nombre ? ' · ' : ''}
                    {isAdmin ? 'Administrador' : 'Acceso limitado'}
                  </p>
                </div>
                <DropdownMenuSeparator />
                {isAdmin && (
                  <DropdownMenuItem asChild className="cursor-pointer rounded-xl">
                    <Link href={'/configuracion/empresa' as Route}>
                      <Settings className="mr-2 h-4 w-4" /> Configuración
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild className="cursor-pointer rounded-xl">
                  <Link href={'/configuracion/plan' as Route}>
                    <Sparkles className="mr-2 h-4 w-4" /> Mi plan
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer rounded-xl">
                  <a href="mailto:contacto@axp.com.ar?subject=Ayuda%20con%20AXP">
                    <BookOpen className="mr-2 h-4 w-4" /> Ayuda
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer rounded-xl text-[var(--rojo-t)] focus:text-[var(--rojo-t)]" onSelect={() => signOut()}>
                  <LogOut className="mr-2 h-4 w-4" /> Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <Buscador abierto={buscar} onCerrar={() => setBuscar(false)} />

      <Dialog open={subir} onOpenChange={setSubir}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" /> Subir facturas
            </DialogTitle>
          </DialogHeader>
          <UploadDropzone
            onUploadComplete={() => {
              setSubir(false)
              queryClient.invalidateQueries({ queryKey: ['documentos'] })
              queryClient.invalidateQueries({ queryKey: ['stats'] })
            }}
            onClose={() => setSubir(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

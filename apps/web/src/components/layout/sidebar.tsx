'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import type { Route } from 'next'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useUser } from '@/hooks/use-user'
import { CONFIGURACION, MENU, subsVisibles, ubicar, type Contador, type Modulo } from './navegacion'

export type Contadores = Partial<Record<Contador, number>>

const TONO: Record<Contador, string> = {
  pendientes: 'bg-[rgba(245,165,36,0.2)] text-[var(--ambar-2)]',
  compras: 'bg-[rgba(239,68,68,0.14)] text-[var(--rojo-t)]',
  logs: 'bg-[rgba(239,68,68,0.14)] text-[var(--rojo-t)]',
}
const PUNTO: Record<Contador, string> = {
  pendientes: 'bg-[var(--ambar)]',
  compras: 'bg-[var(--rojo)]',
  logs: 'bg-[var(--rojo)]',
}

function ItemLateral({
  m,
  href,
  activo,
  mini,
  contador,
  onNavegar,
}: {
  m: Modulo
  href: string
  activo: boolean
  mini: boolean
  contador: number
  onNavegar?: (() => void) | undefined
}) {
  const Icono = m.icono
  const tono = m.contador ?? 'pendientes'
  return (
    <Link
      href={href as Route}
      onClick={() => onNavegar?.()}
      className="ax-item"
      data-activo={activo ? '1' : '0'}
      data-mini={mini ? '1' : '0'}
      aria-current={activo ? 'page' : undefined}
      aria-label={mini ? m.nombre : undefined}
    >
      <span className="relative shrink-0">
        <Icono className="h-[18px] w-[18px]" />
        {mini && contador > 0 && <span className={`absolute -right-1.5 -top-1 h-2 w-2 rounded-full shadow-[0_0_0_2px_#fff] ${PUNTO[tono]}`} />}
      </span>
      {!mini && <span className="truncate">{m.nombre}</span>}
      {!mini && contador > 0 && <span className={`ax-contador ${TONO[tono]}`}>{contador > 99 ? '99+' : contador}</span>}
      {mini && <span className="ax-globo">{m.nombre}</span>}
    </Link>
  )
}

/**
 * Menú lateral. Muestra solo los módulos con al menos una pantalla que el
 * usuario puede abrir (misma regla que el middleware); el ítem lleva a la
 * primera de ellas.
 */
export function Sidebar({
  mini = false,
  contadores = {},
  onNavegar,
  onMini,
}: {
  mini?: boolean
  contadores?: Contadores
  onNavegar?: () => void
  onMini?: () => void
}) {
  const pathname = usePathname()
  const { can } = useUser()
  const actual = ubicar(pathname)?.modulo.id

  const item = (m: Modulo) => {
    const subs = subsVisibles(m, can)
    if (subs.length === 0) return null
    return (
      <ItemLateral
        key={m.id}
        m={m}
        href={subs[0]!.href}
        activo={actual === m.id}
        mini={mini}
        contador={m.contador ? contadores[m.contador] ?? 0 : 0}
        onNavegar={onNavegar}
      />
    )
  }

  const bloques = MENU.map((b) => b.map(item).filter(Boolean)).filter((b) => b.length > 0)

  return (
    <div className="flex h-full flex-col">
      <div className={`flex h-[4.5rem] shrink-0 items-center justify-center ${mini ? 'px-2' : 'px-5'}`}>
        <Link href={'/dashboard' as Route} onClick={() => onNavegar?.()} aria-label="AXP, ir al inicio">
          {mini ? (
            <Image src="/marca/axp-icono.png" alt="" width={36} height={36} className="rounded-[10px]" priority />
          ) : (
            <Image src="/marca/axp-logo.png" alt="AXP" width={91} height={42} priority />
          )}
        </Link>
      </div>

      <nav className={`ax-sin-barra flex-1 overflow-y-auto pb-4 ${mini ? 'px-2.5' : 'px-3'}`} aria-label="Menú principal">
        {bloques.map((bloque, i) => (
          <div key={i} className={i > 0 ? 'mt-3 border-t border-[var(--borde)] pt-3' : ''}>
            <div className="space-y-0.5">{bloque}</div>
          </div>
        ))}
      </nav>

      <div className={`shrink-0 space-y-0.5 border-t border-[var(--borde)] py-3 ${mini ? 'px-2.5' : 'px-3'}`}>
        {item(CONFIGURACION)}
        {onMini && (
          <button type="button" className="ax-item w-full" data-mini={mini ? '1' : '0'} onClick={onMini} aria-label={mini ? 'Expandir menú' : 'Minimizar menú'}>
            {mini ? <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" /> : <PanelLeftClose className="h-[18px] w-[18px] shrink-0" />}
            {!mini && <span>Minimizar</span>}
            {mini && <span className="ax-globo">Expandir menú</span>}
          </button>
        )}
      </div>
    </div>
  )
}

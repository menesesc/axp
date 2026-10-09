'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Route } from 'next'
import { cn } from '@/lib/utils'
import { useUser } from '@/hooks/use-user'
import { Escena, type NombreEscena } from './escenas'
import { subsVisibles, ubicar } from './navegacion'

export interface HeaderProps {
  title: string
  description?: string | undefined
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
  /** Escena animada; por defecto la del módulo. `false` la oculta. */
  escena?: NombreEscena | false
  /** Encabezado chico, sin escena ni pestañas (detalles, altas). */
  compacto?: boolean
}

/** Pestañas con las pantallas del módulo que el usuario puede abrir. */
export function PestanasModulo({ pathname }: { pathname: string }) {
  const { can } = useUser()
  const actual = ubicar(pathname)
  if (!actual) return null
  const subs = subsVisibles(actual.modulo, can)
  if (subs.length < 2) return null
  return (
    <nav className="ax-subnav ax-sin-barra mb-6 flex gap-1 overflow-x-auto" aria-label={`Secciones de ${actual.modulo.nombre}`}>
      {subs.map((s) => {
        const activa = actual.sub?.href === s.href
        return (
          <Link key={s.href} href={s.href as Route} className="ax-subtab" data-activo={activa ? '1' : '0'} aria-current={activa ? 'page' : undefined}>
            {s.nombre}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * Encabezado de cada pantalla. En las pantallas del menú es una banda con el
 * título, las acciones y la escena del módulo, con las pestañas del módulo
 * debajo; en detalles y altas es un título compacto.
 */
export function Header({ title, description, actions, children, className, escena, compacto }: HeaderProps) {
  const pathname = usePathname()
  const actual = ubicar(pathname)
  const acciones = actions || children
  const grande = !compacto && !!actual?.exacta

  if (!grande) {
    return (
      <div className={cn('ax-entra mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
        <div className="min-w-0">
          <h1 className="ax-display text-[clamp(1.5rem,2.4vw,1.9rem)] font-semibold leading-tight text-[var(--texto)]">{title}</h1>
          {description && <p className="mt-1 text-[15px] text-[var(--sec)]">{description}</p>}
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>
    )
  }

  const nombreEscena = escena === false ? null : (escena ?? actual!.modulo.escena)
  return (
    <>
      <section className={cn('ax-hero ax-entra', !nombreEscena && 'ax-hero-sin-escena', className)}>
        <div className="relative z-10 min-w-0 py-1">
          <h1 className="ax-display text-[clamp(1.7rem,3vw,2.3rem)] font-semibold leading-tight text-[var(--texto)]">{title}</h1>
          {description && <p className="mt-1.5 max-w-xl text-[15px] text-[var(--sec)]">{description}</p>}
          {acciones && <div className="mt-5 flex flex-wrap items-center gap-2">{acciones}</div>}
        </div>
        {nombreEscena && (
          <div className="ax-hero-escena">
            <Escena nombre={nombreEscena} />
          </div>
        )}
      </section>
      <PestanasModulo pathname={pathname} />
      <div className="ax-hero-sep" />
    </>
  )
}

// Alias for backward compatibility
export const PageHeader = Header

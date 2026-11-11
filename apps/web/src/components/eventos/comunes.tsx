'use client'

import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ORDEN_SIGLAS, SIGLAS, type Sigla } from '@/lib/eventos/constantes'
import type { ItemCatalogo, SalonPos } from '@/lib/eventos/db'
import { cn } from '@/lib/utils'

/*
 * Piezas que comparten las pantallas de eventos: la sigla con su color, la
 * barra de siglas de un evento, los catálogos y el manejo del cupo.
 */

export function SiglaBadge({ sigla, className, conTexto }: { sigla: Sigla; className?: string; conTexto?: boolean }) {
  const s = SIGLAS[sigla]
  return (
    <span
      title={s.texto}
      className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide', s.fondo, s.borde, s.color, className)}
    >
      {sigla}
      {conTexto && <span className="font-sans font-normal tracking-normal">{s.texto}</span>}
    </span>
  )
}

/** Cuántas reservas hay en cada sigla, como una barra proporcional. */
export function BarraSiglas({ siglas, className }: { siglas: Partial<Record<Sigla, number>>; className?: string }) {
  const total = ORDEN_SIGLAS.reduce((s, k) => s + (siglas[k] ?? 0), 0)
  if (!total) return <div className={cn('h-1.5 rounded-full bg-slate-900/[0.06]', className)} />
  return (
    <div className={cn('flex h-1.5 overflow-hidden rounded-full bg-slate-900/[0.06]', className)}>
      {ORDEN_SIGLAS.map((k) =>
        siglas[k] ? (
          <span key={k} title={`${k}: ${siglas[k]}`} style={{ width: `${((siglas[k] ?? 0) / total) * 100}%`, background: SIGLAS[k].punto }} />
        ) : null
      )}
    </div>
  )
}

export function LeyendaSiglas({ conteo, activas, onAlternar }: {
  conteo?: Partial<Record<Sigla, number>> | undefined
  activas?: Sigla[] | undefined
  onAlternar?: ((s: Sigla) => void) | undefined
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ORDEN_SIGLAS.map((k) => {
        const activa = !activas || activas.length === 0 || activas.includes(k)
        const n = conteo?.[k]
        const Cuerpo = (
          <>
            <span className="h-2 w-2 rounded-full" style={{ background: SIGLAS[k].punto }} />
            <span className="font-mono font-semibold">{k}</span>
            <span className="hidden text-[var(--ter)] sm:inline">{SIGLAS[k].texto}</span>
            {n !== undefined && <span className="ax-num text-[var(--sec)]">{n}</span>}
          </>
        )
        return onAlternar ? (
          <button
            key={k}
            type="button"
            onClick={() => onAlternar(k)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition',
              activa ? 'border-slate-900/[0.14] bg-white' : 'border-transparent bg-slate-900/[0.04] opacity-50'
            )}
          >
            {Cuerpo}
          </button>
        ) : (
          <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-slate-900/[0.08] bg-white px-2.5 py-1 text-xs">
            {Cuerpo}
          </span>
        )
      })}
    </div>
  )
}

export interface Catalogos {
  catalogos: ItemCatalogo[]
  configuracion: { diasPresupuesto: number; diasAvisoVencimiento: number; avisoCupoPct: number }
  salones: SalonPos[]
  usuarios: Array<{ id: string; nombre: string }>
}

/** Orígenes, tipos, salones y usuarios. Cambian poco: se cachean. */
export function useCatalogos() {
  const q = useQuery({
    queryKey: ['eventos-catalogos'],
    queryFn: async () => {
      const res = await fetch('/api/eventos/catalogos')
      if (!res.ok) throw new Error('No se pudieron cargar los catálogos')
      return res.json() as Promise<Catalogos>
    },
    staleTime: 5 * 60 * 1000,
  })
  const items = q.data?.catalogos ?? []
  const origenes = items.filter((c) => c.lista === 'ORIGEN')
  const tipos = items.filter((c) => c.lista === 'TIPO_EVENTO')
  const nombreOrigen = (clave: string | null) => (clave ? origenes.find((o) => o.clave === clave)?.nombre ?? clave : '')
  const tipoEvento = (clave: string | null) => tipos.find((t) => t.clave === clave)
  const salones = q.data?.salones ?? []
  const mesas = salones.flatMap((s) => s.mesas.map((m) => ({ ...m, salonId: s.id, salon: s.nombre })))
  return { ...q, origenes, tipos, nombreOrigen, tipoEvento, salones, mesas, usuarios: q.data?.usuarios ?? [], configuracion: q.data?.configuracion }
}

/**
 * POST/PATCH que entiende el 409 de cupo: pregunta y, si confirman, reintenta
 * con `forzarCupo`. Queda en la auditoría quién pasó el cupo.
 */
export async function enviarConCupo(url: string, method: string, cuerpo: Record<string, unknown>) {
  const ir = (extra: Record<string, unknown> = {}) =>
    fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cuerpo, ...extra }) })
  let res = await ir()
  let json = await res.json().catch(() => ({}))
  if (res.status === 409 && json.codigo === 'CUPO') {
    const ok = window.confirm(`${json.error}.\n\n¿Cargarla igual, pasando el cupo? Queda registrado a tu nombre.`)
    if (!ok) throw new Error('No se guardó: se pasaba del cupo')
    res = await ir({ forzarCupo: true })
    json = await res.json().catch(() => ({}))
  }
  if (!res.ok) throw new Error(json.error || 'No se pudo guardar')
  return json
}

export async function enviar(url: string, method: string, cuerpo?: unknown) {
  const res = await fetch(url, {
    method,
    ...(cuerpo === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'No se pudo guardar')
  return json
}

export const avisarError = (e: Error) => toast.error(e.message)

/** Campo con etiqueta, en el estilo de los formularios del resto de AXP. */
export function Campo({ etiqueta, children, className, ayuda }: { etiqueta: string; children: React.ReactNode; className?: string; ayuda?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-xs font-medium text-slate-500">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-[11px] text-slate-400">{ayuda}</span>}
    </label>
  )
}

export const claseSelect = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm'
export const claseTextarea = 'min-h-[4.5rem] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm'

export function SelectSimple({
  value,
  onChange,
  opciones,
  vacio,
  className,
}: {
  value: string
  onChange: (v: string) => void
  opciones: ReadonlyArray<{ valor: string; texto: string }>
  vacio?: string
  className?: string
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(claseSelect, className)}>
      {vacio !== undefined && <option value="">{vacio}</option>}
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.texto}
        </option>
      ))}
    </select>
  )
}

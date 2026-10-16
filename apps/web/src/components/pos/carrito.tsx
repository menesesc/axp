'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Clock, Flame, Layers, ListOrdered, Minus, Plus, Trash2, UserPlus } from 'lucide-react'
import type { OpcionElegida } from './opciones-producto'

/**
 * El consumo de la mesa.
 *
 * Por defecto junta lo igual: dos cocas pedidas con media hora de
 * diferencia son "COCA COLA 2", porque lo que se mira al cobrar es qué
 * consumió la mesa, no en qué orden lo fue pidiendo. Para eso está la otra
 * vista, la de comandas, que es la que sirve cuando hay que reclamarle algo
 * a la cocina.
 *
 * Lo que no se junta nunca es lo enviado con lo que todavía no salió: se
 * pagan igual, pero uno se puede sacar de un toque y el otro necesita llave.
 *
 * El estado va en su propia columna, a la derecha, porque es lo que se
 * pregunta todo el tiempo: ¿esto ya salió?
 */

export interface Linea {
  id: string
  productoId: string
  nombre: string
  cantidad: number
  precioUnitario: number
  alicuotaIva: number
  enviado: boolean
  nota: string | null
  opciones: OpcionElegida[]
  /** MS (marcha y sale) o PAR (parrilla). */
  marca: string | null
  comanda: number | null
  enviadoHora: string | null
  minutosCocina: number | null
  /** Listo en el pase y todavía sin levantar. */
  minutosPase: number | null
  estadoKds: string | null
}

export const MARCAS = [
  { valor: 'MS', nombre: 'Marcha y sale' },
  { valor: 'PAR', nombre: 'A la parrilla' },
]

const DEMORA = 15

const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

/** Grupo de líneas iguales: mismo producto, misma nota, mismas opciones. */
interface Grupo {
  clave: string
  lineas: Linea[]
  muestra: Linea
  cantidad: number
  importe: number
}

function agrupar(lineas: Linea[]): Grupo[] {
  const m = new Map<string, Grupo>()
  for (const l of lineas) {
    const clave = [
      l.productoId,
      l.enviado ? 'e' : 'n',
      l.nota ?? '',
      l.marca ?? '',
      l.opciones.map((o) => o.opcionId).sort().join(','),
    ].join('|')
    const g = m.get(clave)
    if (g) {
      g.lineas.push(l)
      g.cantidad += l.cantidad
      g.importe += l.cantidad * l.precioUnitario
      // El estado del grupo es el del plato que más espera: si uno todavía
      // está en cocina, el grupo está en cocina.
      if ((l.minutosCocina ?? 0) > (g.muestra.minutosCocina ?? 0)) g.muestra = l
    } else {
      m.set(clave, { clave, lineas: [l], muestra: l, cantidad: l.cantidad, importe: l.cantidad * l.precioUnitario })
    }
  }
  return [...m.values()]
}

export function Carrito({
  titulo,
  subtitulo,
  cliente,
  lineas,
  bloqueado,
  onCambiar,
  onMarca,
  onAnular,
  onRepetir,
  onCliente,
  className,
  children,
}: {
  titulo: string
  subtitulo?: string | null
  /** Nombre del cliente de la mesa, si se cargó. */
  cliente?: string | null
  lineas: Linea[]
  bloqueado?: boolean
  onCambiar: (id: string, delta: number) => void
  onMarca?: (id: string, marca: string | null) => void
  /** Sacar platos que ya salieron a cocina. Pide llave arriba. */
  onAnular?: (lineas: Linea[]) => void
  /** Sumar otra unidad de algo ya comandado: entra como línea nueva. */
  onRepetir?: (l: Linea) => void
  onCliente?: () => void
  className?: string
  children?: React.ReactNode
}) {
  const [vista, setVista] = useState<'agrupado' | 'comandas'>('agrupado')
  const total = lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0)

  const comandas = [...new Set(lineas.filter((l) => l.enviado).map((l) => l.comanda ?? 0))].sort((a, b) => a - b)
  const enCocina = lineas.filter((l) => l.enviado && l.estadoKds !== 'despachado')
  const espera = Math.max(0, ...enCocina.map((l) => l.minutosCocina ?? 0))

  const fila = (g: Grupo) => (
    <Fila
      key={g.clave}
      g={g}
      bloqueado={bloqueado}
      onCambiar={onCambiar}
      onMarca={onMarca}
      onAnular={onAnular}
      onRepetir={onRepetir}
    />
  )

  return (
    <aside className={cn('flex min-h-0 w-full flex-col bg-white lg:w-[30rem] lg:shrink-0 lg:border-slate-200', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold leading-tight">
            {titulo}
            {cliente && <span className="ml-2 text-sm font-normal text-slate-500">· {cliente}</span>}
          </p>
          {subtitulo && <p className="truncate text-[11px] text-slate-500">{subtitulo}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* Agrupado para cobrar, por comandas para reclamarle a la cocina. */}
          <button
            onClick={() => setVista((v) => (v === 'agrupado' ? 'comandas' : 'agrupado'))}
            title={vista === 'agrupado' ? 'Ver por comandas' : 'Ver agrupado'}
            aria-label={vista === 'agrupado' ? 'Ver por comandas' : 'Ver agrupado'}
            className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600"
          >
            {vista === 'agrupado' ? <ListOrdered className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
          </button>
          {onCliente && (
            <button
              onClick={onCliente}
              title="Cliente de la mesa"
              aria-label="Cliente de la mesa"
              className={cn(
                'grid h-10 w-10 place-items-center rounded-xl',
                cliente ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
              )}
            >
              <UserPlus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {comandas.length > 0 && (
        <div
          className={cn(
            'flex items-center gap-2 border-b px-3 py-1.5 text-xs',
            espera >= DEMORA ? 'border-red-100 bg-red-50 text-red-700' : 'border-slate-100 bg-slate-50 text-slate-600'
          )}
        >
          <Clock className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            {comandas.length} {comandas.length === 1 ? 'comanda' : 'comandas'}
            {enCocina.length > 0 ? (
              <>
                {' · '}
                <b>{enCocina.reduce((s, l) => s + l.cantidad, 0)}</b> en preparación, el que más espera hace{' '}
                <b>{espera}′</b>
              </>
            ) : (
              ' · todo servido'
            )}
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {lineas.length === 0 && <p className="p-10 text-center text-slate-400">Tocá un producto para agregarlo</p>}

        {vista === 'agrupado' ? (
          <ul className="divide-y divide-slate-100">{agrupar(lineas).map(fila)}</ul>
        ) : (
          <>
            {comandas.map((c) => {
              const items = lineas.filter((l) => l.enviado && (l.comanda ?? 0) === c)
              const hora = items.find((i) => i.enviadoHora)?.enviadoHora
              return (
                <div key={c}>
                  <p className="sticky top-0 z-10 flex items-center gap-2 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                    Comanda {c || 1}
                    {hora && <span className="font-normal text-slate-400">{hora}</span>}
                  </p>
                  <ul className="divide-y divide-slate-100">{agrupar(items).map(fila)}</ul>
                </div>
              )
            })}
            {lineas.some((l) => !l.enviado) && (
              <div>
                <p className="sticky top-0 z-10 flex items-center bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
                  Sin comandar
                  <span className="ml-auto rounded-full bg-amber-200/70 px-2 py-0.5 text-[11px]">
                    {lineas.filter((l) => !l.enviado).reduce((s, l) => s + l.cantidad, 0)} por enviar
                  </span>
                </p>
                <ul className="divide-y divide-slate-100">{agrupar(lineas.filter((l) => !l.enviado)).map(fila)}</ul>
              </div>
            )}
          </>
        )}
      </div>

      <div className={cn('border-t border-slate-200 px-3 pb-2 pt-2', bloqueado && 'bg-amber-50')}>
        {bloqueado && (
          <p className="mb-1.5 text-center text-xs font-medium text-amber-800">
            Cuenta impresa: la mesa no admite más cargas
          </p>
        )}
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs text-slate-500">Total</span>
          <span className="text-2xl font-bold tabular-nums [font-family:var(--font-display),system-ui]">{pesos(total)}</span>
        </div>
        {children}
      </div>
    </aside>
  )
}

/** Cómo se muestra el estado del plato, que es lo que se pregunta siempre. */
function estadoDe(l: Linea): { texto: string; clase: string } {
  if (!l.enviado) return { texto: 'sin enviar', clase: 'bg-amber-100 text-amber-700' }
  const min = l.minutosCocina ?? 0
  switch (l.estadoKds) {
    case 'despachado':
      return { texto: 'servido', clase: 'bg-slate-100 text-slate-500' }
    case 'entregado':
      return { texto: `en el pase ${l.minutosPase ?? 0}′`, clase: 'bg-amber-100 text-amber-800' }
    case 'marchado':
      return { texto: `marchado ${min}′`, clase: 'bg-sky-100 text-sky-800' }
    default:
      return {
        texto: `preparando ${min}′`,
        clase: min >= DEMORA ? 'bg-red-100 text-red-700' : 'bg-sky-100 text-sky-800',
      }
  }
}

function Fila({
  g,
  bloqueado,
  onCambiar,
  onMarca,
  onAnular,
  onRepetir,
}: {
  g: Grupo
  bloqueado: boolean | undefined
  onCambiar: (id: string, delta: number) => void
  onMarca: ((id: string, marca: string | null) => void) | undefined
  onAnular: ((lineas: Linea[]) => void) | undefined
  onRepetir: ((l: Linea) => void) | undefined
}) {
  const l = g.muestra
  const estado = estadoDe(l)

  return (
    <li className="flex items-center gap-1.5 px-2.5 py-1">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{l.nombre}</p>
        <p className="flex items-center gap-1.5 text-[11px] leading-tight text-slate-400">
          <span>{pesos(l.precioUnitario)}</span>
          {!l.enviado &&
            onMarca &&
            !bloqueado &&
            MARCAS.map((m) => (
              <button
                key={m.valor}
                onClick={() => g.lineas.forEach((x) => onMarca(x.id, l.marca === m.valor ? null : m.valor))}
                title={m.nombre}
                className={cn(
                  'flex h-5 items-center gap-0.5 rounded px-1 text-[10px] font-bold',
                  l.marca === m.valor ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-400'
                )}
              >
                {m.valor === 'PAR' && <Flame className="h-2.5 w-2.5" />}
                {m.valor}
              </button>
            ))}
          {l.enviado && l.marca && (
            <span className="rounded bg-orange-100 px-1 text-[10px] font-bold text-orange-700">{l.marca}</span>
          )}
          {(l.opciones.length > 0 || l.nota) && (
            <span className="truncate">
              {l.opciones.map((o) => o.nombre).join(' · ')}
              {l.opciones.length > 0 && l.nota ? ' — ' : ''}
              {l.nota}
            </span>
          )}
        </p>
      </div>

      {/* La columna de estado: lo que se pregunta todo el tiempo. */}
      <span className={cn('w-24 shrink-0 rounded-md px-1.5 py-1 text-center text-[10px] font-semibold', estado.clase)}>
        {estado.texto}
      </span>

      {l.enviado ? (
        <button
          onClick={() => onAnular?.(g.lineas)}
          disabled={!onAnular}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 disabled:opacity-30"
          aria-label="Anular, pide autorización"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : (
        <button
          onClick={() => onCambiar(g.lineas[g.lineas.length - 1]!.id, -1)}
          disabled={bloqueado}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 disabled:opacity-30"
          aria-label="Quitar uno"
        >
          {g.cantidad === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
        </button>
      )}
      <span className="w-6 shrink-0 text-center text-base font-bold tabular-nums">{g.cantidad}</span>
      <button
        onClick={() => (l.enviado ? onRepetir?.(l) : onCambiar(g.lineas[g.lineas.length - 1]!.id, 1))}
        disabled={bloqueado || (l.enviado && !onRepetir)}
        title={l.enviado ? 'Otra vez: entra como pedido nuevo' : 'Agregar uno'}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 disabled:opacity-30"
        aria-label="Agregar uno"
      >
        <Plus className="h-4 w-4" />
      </button>
      <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">{pesos(g.importe)}</span>
    </li>
  )
}

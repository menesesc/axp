'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, PenLine, Search, Trash2, Users } from 'lucide-react'
import { pesos } from '@/components/dashboard/inicio'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { parsearMonto, type IvaModo } from '@/lib/eventos/constantes'
import {
  APLICA,
  PASOS,
  comparar,
  margen,
  porPaso,
  porcionTexto,
  valorCubierto,
  type Aplica,
  type ItemMenu,
  type ModoItem,
  type Paso,
} from '@/lib/eventos/menu'
import type { MenuDetalle, ProductoCarta } from '@/lib/eventos/menus'
import { cn } from '@/lib/utils'
import { avisarError, claseSelect, enviar } from './comunes'

/*
 * Editor de un menú (plantilla o copia) y el resumen de valor por cubierto.
 * Los dos recalculan en vivo con `lib/eventos/menu.ts`, la misma cuenta que
 * usa el servidor para la cocina y el presupuesto.
 */

/** Productos activos del POS con precio (y costo, con importes). Cambian poco. */
export function useProductosCarta() {
  return useQuery({
    queryKey: ['eventos-productos'],
    queryFn: async () => {
      const res = await fetch('/api/eventos/menus/productos')
      if (!res.ok) throw new Error('No se pudieron cargar los productos')
      return res.json() as Promise<{ productos: ProductoCarta[]; verImportes: boolean }>
    },
    staleTime: 5 * 60 * 1000,
  })
}

interface Fila {
  key: string
  id?: string | undefined
  paso: Paso
  productoId: string | null
  productoNombre: string | null
  nombre: string
  descripcion: string
  modo: ModoItem
  cantidad: string
  personasPorUnidad: string
  unidad: string
  aplica: Aplica
  precioManual: string
  /** Lo que vino del servidor, por si el producto ya no está en la lista. */
  precioOriginal: number | null
  costo: number | null
  costoCompleto: boolean
}

let secuencia = 0
const nuevaClave = () => `f${++secuencia}`

function filaDe(i: ItemMenu): Fila {
  return {
    key: i.id ?? nuevaClave(),
    id: i.id,
    paso: i.paso,
    productoId: i.productoId,
    productoNombre: i.productoNombre ?? null,
    nombre: i.nombre,
    descripcion: i.descripcion ?? '',
    modo: i.modo,
    cantidad: String(i.cantidad).replace('.', ','),
    personasPorUnidad: i.personasPorUnidad ? String(i.personasPorUnidad) : '',
    unidad: i.unidad ?? '',
    aplica: i.aplica,
    precioManual: i.precioManual != null ? String(i.precioManual) : '',
    precioOriginal: i.precio,
    costo: i.costo,
    costoCompleto: i.costoCompleto,
  }
}

/** La fila como ítem calculable, con el precio vigente del POS si no hay uno a mano. */
function itemDe(f: Fila, productos: Map<string, ProductoCarta>, orden: number): ItemMenu {
  const prod = f.productoId ? productos.get(f.productoId) : undefined
  const manual = parsearMonto(f.precioManual)
  const cantidad = parsearMonto(f.cantidad)
  const n = Math.round(Number(f.personasPorUnidad))
  return {
    id: f.id,
    paso: f.paso,
    orden,
    productoId: f.productoId,
    nombre: f.nombre.trim(),
    descripcion: f.descripcion.trim() || null,
    modo: f.modo,
    cantidad: cantidad && cantidad > 0 ? cantidad : 1,
    personasPorUnidad: f.modo === 'COMPARTIDO' ? (n >= 2 ? n : 2) : null,
    unidad: f.unidad.trim() || null,
    aplica: f.aplica,
    precioManual: manual,
    precio: manual ?? prod?.precio ?? (f.productoId ? f.precioOriginal : null),
    costo: prod ? prod.costo : f.costo,
    costoCompleto: prod ? prod.costoCompleto : f.costoCompleto,
  }
}

export function MenuEditor({
  menu,
  verImportes,
  puedeEditar,
  grupo,
  precios,
  onGuardado,
  extraResumen,
}: {
  menu: MenuDetalle
  verImportes: boolean
  puedeEditar: boolean
  /** Grupo real (reserva) o de referencia (plantilla, evento) para el valor por cubierto. */
  grupo: { adultos: number; menores: number }
  precios?: Precios | null | undefined
  onGuardado: () => void
  extraResumen?: React.ReactNode
}) {
  const { data: prod } = useProductosCarta()
  const productos = useMemo(() => new Map((prod?.productos ?? []).map((p) => [p.id, p])), [prod])
  const inicial = useMemo(() => menu.items.map(filaDe), [menu])
  const [filas, setFilas] = useState(inicial)
  useEffect(() => setFilas(inicial), [inicial])
  const [pasoNuevo, setPasoNuevo] = useState<Paso>('ENTRADA')

  const items = filas.map((f, i) => itemDe(f, productos, i))
  const cambiado = JSON.stringify(filas.map(({ key: _k, ...f }) => f)) !== JSON.stringify(inicial.map(({ key: _k, ...f }) => f))

  const guardar = useMutation({
    mutationFn: () =>
      enviar(`/api/eventos/menus/${menu.id}`, 'PATCH', {
        items: items.map((i) => ({ ...i, precioManual: verImportes ? i.precioManual : null })),
      }),
    onSuccess: () => {
      toast.success('Menú guardado')
      onGuardado()
    },
    onError: avisarError,
  })

  const set = (key: string, cambios: Partial<Fila>) => setFilas((xs) => xs.map((f) => (f.key === key ? { ...f, ...cambios } : f)))
  const mover = (key: string, dir: -1 | 1) =>
    setFilas((xs) => {
      const i = xs.findIndex((f) => f.key === key)
      const f = xs[i]
      if (!f) return xs
      // Se intercambia con la vecina del mismo paso: el orden es dentro del paso.
      let j = i + dir
      while (j >= 0 && j < xs.length && xs[j]!.paso !== f.paso) j += dir
      if (j < 0 || j >= xs.length) return xs
      const out = [...xs]
      out[i] = xs[j]!
      out[j] = f
      return out
    })
  const agregar = (p: Partial<Fila>) =>
    setFilas((xs) => [
      ...xs,
      {
        key: nuevaClave(),
        paso: pasoNuevo,
        productoId: null,
        productoNombre: null,
        nombre: '',
        descripcion: '',
        modo: 'PERSONA',
        cantidad: '1',
        personasPorUnidad: '',
        unidad: '',
        aplica: 'TODOS',
        precioManual: '',
        precioOriginal: null,
        costo: null,
        costoCompleto: false,
        ...p,
      },
    ])

  const grupos = porPaso(filas.map((f, i) => ({ ...f, orden: i })))
  const valido = filas.every((f) => f.nombre.trim() && (f.modo === 'PERSONA' || Number(f.personasPorUnidad) >= 2))

  return (
    <div className="space-y-4">
      <ValorMenu items={items} grupo={grupo} precios={precios} verImportes={verImportes} extra={extraResumen} />

      {filas.length === 0 && <p className="text-sm text-[var(--ter)]">El menú está vacío. Agregá productos de la carta o líneas a mano.</p>}

      {grupos.map((g) => (
        <section key={g.paso} className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ter)]">{PASOS.find((p) => p.valor === g.paso)?.texto}</h4>
          {g.items.map((f) => {
            const it = itemDe(f, productos, f.orden)
            const prodActual = f.productoId ? productos.get(f.productoId) : undefined
            return (
              <div key={f.key} className="rounded-xl border border-slate-900/[0.08] bg-white p-2.5">
                <fieldset disabled={!puedeEditar} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {puedeEditar && (
                      <div className="flex flex-col">
                        <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => mover(f.key, -1)} aria-label="Subir">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => mover(f.key, 1)} aria-label="Bajar">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <Input
                      value={f.nombre}
                      onChange={(e) => set(f.key, { nombre: e.target.value })}
                      placeholder="Nombre en el presupuesto"
                      className="h-9 min-w-[12rem] flex-1"
                    />
                    <select value={f.paso} onChange={(e) => set(f.key, { paso: e.target.value as Paso })} className={cn(claseSelect, 'h-9 w-auto')} aria-label="Paso">
                      {PASOS.map((p) => (
                        <option key={p.valor} value={p.valor}>
                          {p.texto}
                        </option>
                      ))}
                    </select>
                    <select value={f.aplica} onChange={(e) => set(f.key, { aplica: e.target.value as Aplica })} className={cn(claseSelect, 'h-9 w-auto')} aria-label="Para quién">
                      {APLICA.map((a) => (
                        <option key={a.valor} value={a.valor}>
                          {a.texto}
                        </option>
                      ))}
                    </select>
                    {puedeEditar && (
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => setFilas((xs) => xs.filter((x) => x.key !== f.key))} aria-label="Quitar">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <select
                      value={f.modo}
                      onChange={(e) => set(f.key, { modo: e.target.value as ModoItem, personasPorUnidad: f.personasPorUnidad || '4' })}
                      className={cn(claseSelect, 'h-8 w-auto text-xs')}
                      aria-label="Rendimiento"
                    >
                      <option value="PERSONA">Por persona</option>
                      <option value="COMPARTIDO">Para compartir</option>
                    </select>
                    {f.modo === 'COMPARTIDO' ? (
                      <label className="flex items-center gap-1 text-xs text-[var(--sec)]">
                        <Input value={f.cantidad} onChange={(e) => set(f.key, { cantidad: e.target.value })} inputMode="decimal" className="h-8 w-14 text-xs" aria-label="Unidades" />
                        cada
                        <Input value={f.personasPorUnidad} onChange={(e) => set(f.key, { personasPorUnidad: e.target.value })} inputMode="numeric" className="h-8 w-14 text-xs" aria-label="Personas por unidad" />
                        personas
                      </label>
                    ) : (
                      <label className="flex items-center gap-1 text-xs text-[var(--sec)]">
                        <Input value={f.cantidad} onChange={(e) => set(f.key, { cantidad: e.target.value })} inputMode="decimal" className="h-8 w-16 text-xs" aria-label="Cantidad por persona" title="0,5 = media por persona" />
                        <Input value={f.unidad} onChange={(e) => set(f.key, { unidad: e.target.value })} placeholder="unidad (botella, copa)" className="h-8 w-36 text-xs" />
                        por persona
                      </label>
                    )}
                    <Input
                      value={f.descripcion}
                      onChange={(e) => set(f.key, { descripcion: e.target.value })}
                      placeholder="Detalle (opcional)"
                      className="h-8 min-w-[10rem] flex-1 text-xs"
                    />
                    {verImportes && (
                      <label className="flex items-center gap-1 text-xs text-[var(--sec)]" title="Precio de carta equivalente">
                        Carta
                        <Input
                          value={f.precioManual}
                          onChange={(e) => set(f.key, { precioManual: e.target.value })}
                          inputMode="decimal"
                          placeholder={prodActual ? String(prodActual.precio) : f.productoId && f.precioOriginal != null ? String(f.precioOriginal) : '$'}
                          className="h-8 w-24 text-xs"
                        />
                      </label>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--ter)]">
                    {f.productoId ? (
                      <>
                        POS: {prodActual?.nombre ?? f.productoNombre ?? 'producto dado de baja'}
                        {verImportes && prodActual ? ` · ${pesos(prodActual.precio)}` : ''}
                      </>
                    ) : (
                      'Línea a mano'
                    )}
                    {porcionTexto(it) && ` · ${porcionTexto(it)}`}
                    {verImportes && it.costo != null && ` · costo ${pesos(it.costo)}${it.costoCompleto ? '' : ' (parcial)'}`}
                    {verImportes && it.precio == null && <span className="text-[var(--rojo-t)]"> · sin precio de carta</span>}
                  </p>
                </fieldset>
              </div>
            )
          })}
        </section>
      ))}

      {puedeEditar && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-900/[0.03] p-2.5">
          <select value={pasoNuevo} onChange={(e) => setPasoNuevo(e.target.value as Paso)} className={cn(claseSelect, 'h-9 w-auto')} aria-label="Agregar en">
            {PASOS.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.texto}
              </option>
            ))}
          </select>
          <BuscadorProducto
            productos={prod?.productos ?? []}
            verImportes={verImportes}
            onElegir={(p) => agregar({ productoId: p.id, productoNombre: p.nombre, nombre: p.nombre, precioOriginal: p.precio, costo: p.costo, costoCompleto: p.costoCompleto })}
          />
          <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => agregar({})}>
            <PenLine className="h-3.5 w-3.5" />
            Línea a mano
          </Button>
        </div>
      )}

      {puedeEditar && (
        <div className="flex justify-end gap-2">
          {cambiado && (
            <Button type="button" variant="ghost" onClick={() => setFilas(inicial)}>
              Descartar
            </Button>
          )}
          <Button type="button" disabled={!cambiado || !valido || guardar.isPending} onClick={() => guardar.mutate()}>
            {guardar.isPending ? 'Guardando…' : 'Guardar menú'}
          </Button>
        </div>
      )}
    </div>
  )
}

function BuscadorProducto({ productos, verImportes, onElegir }: { productos: ProductoCarta[]; verImportes: boolean; onElegir: (p: ProductoCarta) => void }) {
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const cerrar = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [])
  const t = q.trim().toLowerCase()
  const lista = t ? productos.filter((p) => p.nombre.toLowerCase().includes(t) || (p.categoria ?? '').toLowerCase().includes(t)).slice(0, 12) : []
  return (
    <div ref={caja} className="relative min-w-[14rem] flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setAbierto(true)
        }}
        onFocus={() => setAbierto(true)}
        placeholder="Buscar en la carta del POS…"
        className="h-9 pl-8"
      />
      {abierto && lista.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {lista.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  onElegir(p)
                  setQ('')
                  setAbierto(false)
                }}
              >
                <span className="min-w-0 truncate">
                  {p.nombre}
                  {p.categoria && <span className="ml-1 text-xs text-[var(--ter)]">{p.categoria}</span>}
                </span>
                {verImportes && <span className="ax-num shrink-0 text-xs text-[var(--sec)]">{pesos(p.precio)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {abierto && t && lista.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-[var(--ter)] shadow-lg">
          No está en la carta. Usá “Línea a mano”.
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ valor */

export interface Precios {
  adulto: number
  menor: number
  ivaModo: IvaModo
  ivaAlicuota: number
}

/**
 * Valor de carta por cubierto contra el precio que se cobra, por categoría.
 * Es la cuenta que ayuda a decidir el precio: abajo de la carta es un precio
 * especial; arriba, un sobreprecio. El costo sale de las recetas del POS
 * (o del insumo de venta directa) y, si falta en algún ítem, se avisa.
 */
export function ValorMenu({
  items,
  grupo,
  precios,
  verImportes,
  extra,
}: {
  items: ItemMenu[]
  grupo: { adultos: number; menores: number }
  precios?: Precios | null | undefined
  verImportes: boolean
  extra?: React.ReactNode
}) {
  if (!verImportes) return null
  const hayMenores = grupo.menores > 0 && items.some((i) => i.aplica !== 'ADULTOS')
  const filas: Array<{ titulo: string; n: number; cat: 'ADULTOS' | 'MENORES'; precio: number | null }> = [
    { titulo: 'Adulto', n: grupo.adultos, cat: 'ADULTOS', precio: precios ? precios.adulto : null },
    ...(hayMenores ? [{ titulo: 'Menor', n: grupo.menores, cat: 'MENORES' as const, precio: precios ? precios.menor : null }] : []),
  ]
  return (
    <div className="space-y-2 rounded-xl bg-slate-900/[0.03] p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ter)]">
        <Users className="h-3.5 w-3.5" />
        Valor por cubierto con porciones compartidas para {grupo.adultos} adulto{grupo.adultos === 1 ? '' : 's'}
        {hayMenores ? ` y ${grupo.menores} menor${grupo.menores === 1 ? '' : 'es'}` : ''}
        {extra}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {filas.map((f) => {
          const v = valorCubierto(items, f.cat, f.n)
          const c = precios && f.precio != null ? comparar(f.precio, precios.ivaModo, precios.ivaAlicuota, v.carta) : null
          const m = precios && f.precio != null && v.costo > 0 ? margen(f.precio, precios.ivaModo, precios.ivaAlicuota, v.costo) : null
          return (
            <div key={f.cat} className="rounded-lg bg-white p-3 text-sm shadow-sm">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium">{f.titulo}</span>
                {c && (
                  <span className={cn('ax-chip', c.tipo === 'ESPECIAL' ? 'ax-chip-ambar' : c.tipo === 'SOBREPRECIO' ? 'ax-chip-verde' : 'ax-chip-gris')}>{c.texto}</span>
                )}
              </div>
              <dl className="ax-num grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
                <dt className="text-[var(--sec)]">Valor de carta</dt>
                <dd className="text-right">
                  {pesos(v.carta)}
                  {v.sinPrecio > 0 && <span className="ml-1 text-xs text-[var(--rojo-t)]">({v.sinPrecio} sin precio)</span>}
                </dd>
                {f.precio != null && precios && (
                  <>
                    <dt className="text-[var(--sec)]">Precio por cubierto</dt>
                    <dd className="text-right">
                      {pesos(f.precio)}
                      {precios.ivaModo === 'MAS_IVA' && c && <span className="ml-1 text-xs text-[var(--ter)]">({pesos(c.precioFinal)} con IVA)</span>}
                    </dd>
                  </>
                )}
                {c && c.tipo !== 'IGUAL' && (
                  <>
                    <dt className="text-[var(--sec)]">Diferencia</dt>
                    <dd className="text-right">{c.diferencia > 0 ? '+' : '−'}{pesos(Math.abs(c.diferencia))}</dd>
                  </>
                )}
                {v.costo > 0 && (
                  <>
                    <dt className="text-[var(--sec)]">Costo estimado</dt>
                    <dd className="text-right">
                      {pesos(v.costo)}
                      {v.sinCosto > 0 && <span className="ml-1 text-xs text-[var(--ter)]">(parcial: {v.sinCosto} sin costo)</span>}
                    </dd>
                  </>
                )}
                {m && (
                  <>
                    <dt className="text-[var(--sec)]">Margen (sin IVA)</dt>
                    <dd className="text-right">
                      {pesos(m.margen)}
                      {m.pct != null && <span className="ml-1 text-xs text-[var(--ter)]">{m.pct.toLocaleString('es-AR')} %</span>}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-[var(--ter)]">
        La carta es precio final; un precio “más IVA” se compara con el IVA sumado. El costo es el de las recetas del POS con la última compra de cada insumo.
      </p>
    </div>
  )
}

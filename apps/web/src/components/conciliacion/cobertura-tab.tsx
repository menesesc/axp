'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { fmtAR, fmtNumAR } from '@/components/sales/shared'
import { UNIDADES } from '@/lib/conciliacion/units'
import { BookOpen, Carrot, CheckCircle2, Boxes, Loader2, Plus, ShoppingBag, UtensilsCrossed } from 'lucide-react'

interface VentaCobertura {
  id: string
  nombre: string
  rubro: string | null
  unidades: number
  importe: number
  conReceta: boolean
  ventaDirecta: boolean
}

interface CompraCobertura {
  descripcion: string
  norm: string
  lineas: number
  cantidad: number | null
  subtotal: number
  categoria: string | null
  insumoId: string | null
  insumo: string | null
}

interface CoberturaResponse {
  ventas: VentaCobertura[]
  compras: CompraCobertura[]
}

type Filtro = 'sin' | 'con' | 'todos'

function Toggle({ value, onChange, labels }: { value: Filtro; onChange: (f: Filtro) => void; labels: Record<Filtro, string> }) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 p-0.5 text-xs">
      {(['sin', 'con', 'todos'] as Filtro[]).map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onChange(f)}
          className={`px-2.5 py-1 rounded ${value === f ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
        >
          {labels[f]}
        </button>
      ))}
    </div>
  )
}

function Kpi({ icon: Icon, titulo, pct, detalle }: { icon: typeof Carrot; titulo: string; pct: number; detalle: string }) {
  const color = pct >= 80 ? 'bg-emerald-500 text-emerald-600' : pct >= 50 ? 'bg-amber-500 text-amber-600' : 'bg-red-500 text-red-600'
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
          <Icon className="h-4 w-4 text-slate-400" />
          {titulo}
        </span>
        <span className={`text-lg font-semibold ${color.split(' ')[1]}`}>{fmtNumAR(pct, 0)}%</span>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color.split(' ')[0]}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">{detalle}</p>
    </div>
  )
}

/**
 * Pestaña "Cobertura": qué se vendió sin receta y qué se compró sin insumo.
 * Lo que queda afuera no se computa en el cuadre ni en el stock; desde acá se
 * asigna una compra a un insumo (crea el alias) o se salta a cargar la receta.
 */
export function CoberturaTab({
  params,
  veImportes,
  editaInsumos,
}: {
  params: string
  veImportes: boolean
  editaInsumos: boolean
}) {
  const qcPrincipal = useQueryClient()

  /**
   * Venta directa: crea el insumo atado al producto, sin receta. Para lo que se
   * compra y se vende en la misma unidad (vinos por botella, latas, aguas).
   */
  const marcarDirecta = useMutation({
    mutationFn: async (payload: { productMasterIds?: string[]; rubroCodigo?: string }) => {
      const res = await fetch('/api/conciliacion/venta-directa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo marcar')
      return json as {
        creados: number
        reactivados: number
        yaEstaban: number
        saltadosPorReceta: number
      }
    },
    onSuccess: (r) => {
      const hechos = r.creados + r.reactivados
      const partes = [
        hechos > 0 ? `${hechos} producto${hechos === 1 ? '' : 's'} a stock directo` : null,
        r.saltadosPorReceta > 0
          ? `${r.saltadosPorReceta} con receta quedaron como estaban`
          : null,
      ].filter(Boolean)
      toast.success(partes.join(' · ') || 'No había nada para marcar')
      qcPrincipal.invalidateQueries({ queryKey: ['cobertura'] })
      qcPrincipal.invalidateQueries({ queryKey: ['conciliacion'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const [filtroVentas, setFiltroVentas] = useState<Filtro>('sin')
  const [filtroCompras, setFiltroCompras] = useState<Filtro>('sin')
  const [categoria, setCategoria] = useState('')
  const [asignando, setAsignando] = useState<CompraCobertura | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['conciliacion-cobertura', params],
    queryFn: async () => {
      const res = await fetch(`/api/conciliacion/cobertura?${params}`)
      if (!res.ok) throw new Error('Error cargando cobertura')
      return res.json() as Promise<CoberturaResponse>
    },
    staleTime: 30_000,
  })

  const resumen = useMemo(() => {
    const v = data?.ventas ?? []
    const c = data?.compras ?? []
    const uTot = v.reduce((s, x) => s + x.unidades, 0)
    const uCon = v.filter((x) => x.conReceta).reduce((s, x) => s + x.unidades, 0)
    const sTot = c.reduce((s, x) => s + x.subtotal, 0)
    const sCon = c.filter((x) => x.insumoId).reduce((s, x) => s + x.subtotal, 0)
    const lTot = c.reduce((s, x) => s + x.lineas, 0)
    const lCon = c.filter((x) => x.insumoId).reduce((s, x) => s + x.lineas, 0)
    return {
      ventasPct: uTot ? (uCon / uTot) * 100 : 0,
      ventasDetalle: `${v.filter((x) => x.conReceta).length} de ${v.length} productos vendidos tienen receta (${fmtNumAR(uCon)} de ${fmtNumAR(uTot)} unidades).`,
      // Sin importes, la cobertura de compras se mide por líneas de factura.
      comprasPct: veImportes ? (sTot ? (sCon / sTot) * 100 : 0) : lTot ? (lCon / lTot) * 100 : 0,
      comprasDetalle: `${c.filter((x) => x.insumoId).length} de ${c.length} descripciones compradas están asignadas a un insumo${
        veImportes ? ` (${fmtAR(sCon)} de ${fmtAR(sTot)}).` : '.'
      }`,
    }
  }, [data, veImportes])

  const categorias = useMemo(
    () => [...new Set((data?.compras ?? []).map((c) => c.categoria).filter(Boolean) as string[])].sort(),
    [data]
  )

  if (isLoading || !data) {
    return <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-400 text-sm">Cargando...</div>
  }

  const ventas = data.ventas.filter((v) => (filtroVentas === 'sin' ? !v.conReceta : filtroVentas === 'con' ? v.conReceta : true))
  const compras = data.compras
    .filter((c) => (filtroCompras === 'sin' ? !c.insumoId : filtroCompras === 'con' ? !!c.insumoId : true))
    .filter((c) => !categoria || c.categoria === categoria)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Kpi icon={UtensilsCrossed} titulo="Ventas con receta" pct={resumen.ventasPct} detalle={resumen.ventasDetalle} />
        <Kpi
          icon={ShoppingBag}
          titulo={veImportes ? 'Compras asignadas a insumo (por importe)' : 'Compras asignadas a insumo'}
          pct={resumen.comprasPct}
          detalle={resumen.comprasDetalle}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Ventas */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="flex items-center justify-between gap-2 p-3 border-b">
            <h3 className="text-sm font-medium text-slate-700">Productos vendidos</h3>
            <div className="flex items-center gap-2">
              <RubroDirecto
                ventas={data.ventas}
                pendiente={marcarDirecta.isPending}
                onMarcar={(rubroCodigo) => marcarDirecta.mutate({ rubroCodigo })}
              />
              <Toggle value={filtroVentas} onChange={setFiltroVentas} labels={{ sin: 'Sin cubrir', con: 'Cubiertos', todos: 'Todos' }} />
            </div>
          </div>
          <ul className="divide-y max-h-[60vh] overflow-y-auto">
            {ventas.map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="truncate">{v.nombre}</p>
                  {v.rubro && <p className="text-[11px] text-slate-400">{v.rubro}</p>}
                </div>
                <span className="text-xs text-slate-500 tabular-nums shrink-0">{fmtNumAR(v.unidades)} u</span>
                {v.ventaDirecta ? (
                  <span
                    title="Se compra y se vende en la misma unidad: el consumo son las unidades vendidas"
                    className="inline-flex items-center gap-1 text-xs text-sky-700 shrink-0 w-32 justify-end"
                  >
                    <Boxes className="h-3.5 w-3.5" /> Stock directo
                  </span>
                ) : v.conReceta ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700 shrink-0 w-32 justify-end">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Receta
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 shrink-0 w-32 justify-end">
                    <button
                      type="button"
                      disabled={marcarDirecta.isPending}
                      onClick={() => marcarDirecta.mutate({ productMasterIds: [v.id] })}
                      title="1 a 1: una unidad vendida descuenta una unidad comprada"
                      className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline disabled:opacity-50"
                    >
                      <Boxes className="h-3.5 w-3.5" /> 1 a 1
                    </button>
                    <Link
                      href={`/conciliacion/recetas?producto=${v.id}`}
                      className="inline-flex items-center gap-1 text-xs text-amber-700 hover:underline"
                      title="Se arma con varios insumos"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                    </Link>
                  </span>
                )}
              </li>
            ))}
            {ventas.length === 0 && <li className="p-6 text-center text-sm text-slate-400">Nada para mostrar.</li>}
          </ul>
        </div>

        {/* Compras */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="flex items-center justify-between gap-2 p-3 border-b flex-wrap">
            <h3 className="text-sm font-medium text-slate-700">Compras del período</h3>
            <div className="flex items-center gap-2">
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white"
              >
                <option value="">Todas las categorías</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <Toggle value={filtroCompras} onChange={setFiltroCompras} labels={{ sin: 'Sin insumo', con: 'Con insumo', todos: 'Todas' }} />
            </div>
          </div>
          <ul className="divide-y max-h-[60vh] overflow-y-auto">
            {compras.map((c) => (
              <li key={c.norm} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="truncate" title={c.descripcion}>{c.descripcion}</p>
                  <p className="text-[11px] text-slate-400">
                    {c.categoria ?? 'Sin categoría'} · {c.lineas} {c.lineas === 1 ? 'línea' : 'líneas'}
                  </p>
                </div>
                {veImportes && <span className="text-xs text-slate-500 tabular-nums shrink-0">{fmtAR(c.subtotal)}</span>}
                {c.insumo ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700 shrink-0 max-w-[140px] truncate">
                    <Carrot className="h-3.5 w-3.5 shrink-0" /> {c.insumo}
                  </span>
                ) : editaInsumos ? (
                  <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => setAsignando(c)}>
                    Asignar
                  </Button>
                ) : (
                  <span className="text-xs text-slate-300 shrink-0">Sin insumo</span>
                )}
              </li>
            ))}
            {compras.length === 0 && <li className="p-6 text-center text-sm text-slate-400">Nada para mostrar.</li>}
          </ul>
        </div>
      </div>

      {asignando && <AsignarInsumoDialog compra={asignando} onClose={() => setAsignando(null)} />}
    </div>
  )
}

interface InsumoLista {
  id: string
  nombre: string
  unidadBase: string
}

/**
 * Asigna una descripción de compra a un insumo creando un alias (patrón que se
 * busca contenido en la descripción). Permite crear el insumo en el momento.
 */
function AsignarInsumoDialog({ compra, onClose }: { compra: CompraCobertura; onClose: () => void }) {
  const qc = useQueryClient()
  const [modo, setModo] = useState<'existente' | 'nuevo'>('existente')
  const [buscar, setBuscar] = useState('')
  const [insumoId, setInsumoId] = useState('')
  const [nombre, setNombre] = useState(compra.descripcion.replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 60))
  const [unidadBase, setUnidadBase] = useState('kg')
  const [patron, setPatron] = useState(compra.norm)
  const [factor, setFactor] = useState('1')

  const { data } = useQuery({
    queryKey: ['conciliacion-insumos'],
    queryFn: async () => {
      const res = await fetch('/api/conciliacion/insumos')
      if (!res.ok) throw new Error('Error cargando insumos')
      return res.json() as Promise<{ insumos: InsumoLista[] }>
    },
  })
  const insumos = (data?.insumos ?? []).filter((i) => i.nombre.toLowerCase().includes(buscar.trim().toLowerCase()))
  const elegido = data?.insumos.find((i) => i.id === insumoId)
  const unidad = modo === 'nuevo' ? unidadBase : elegido?.unidadBase

  const guardar = useMutation({
    mutationFn: async () => {
      let id = insumoId
      if (modo === 'nuevo') {
        const r = await fetch('/api/conciliacion/insumos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: nombre.trim(), unidadBase }),
        })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'No se pudo crear el insumo')
        id = j.insumo.id
      }
      if (!id) throw new Error('Elegí un insumo')
      const r = await fetch(`/api/conciliacion/insumos/${id}/alias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patron: patron.trim(), factorBase: Number(factor.replace(',', '.')) }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo crear el alias')
    },
    onSuccess: () => {
      toast.success('Compra asignada al insumo')
      qc.invalidateQueries({ queryKey: ['conciliacion-cobertura'] })
      qc.invalidateQueries({ queryKey: ['conciliacion-insumos'] })
      qc.invalidateQueries({ queryKey: ['conciliacion'] })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const factorNum = Number(factor.replace(',', '.'))
  const valido =
    patron.trim().length > 0 &&
    Number.isFinite(factorNum) &&
    factorNum > 0 &&
    (modo === 'nuevo' ? nombre.trim().length > 0 : !!insumoId)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Asignar compra a un insumo</DialogTitle>
          <DialogDescription className="break-words">{compra.descripcion}</DialogDescription>
        </DialogHeader>

        <div className="inline-flex rounded-md border border-slate-200 p-0.5 text-sm self-start">
          <button
            type="button"
            onClick={() => setModo('existente')}
            className={`px-3 py-1 rounded ${modo === 'existente' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
          >
            Insumo existente
          </button>
          <button
            type="button"
            onClick={() => setModo('nuevo')}
            className={`px-3 py-1 rounded inline-flex items-center gap-1 ${modo === 'nuevo' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
          >
            <Plus className="h-3.5 w-3.5" /> Nuevo insumo
          </button>
        </div>

        {modo === 'existente' ? (
          <div className="space-y-2">
            <Input placeholder="Buscar insumo" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
            <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
              {insumos.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setInsumoId(i.id)}
                  className={`w-full text-left px-3 py-1.5 text-sm flex justify-between ${insumoId === i.id ? 'bg-emerald-50 font-medium' : 'hover:bg-slate-50'}`}
                >
                  {i.nombre}
                  <span className="text-xs text-slate-400">{i.unidadBase}</span>
                </button>
              ))}
              {insumos.length === 0 && <p className="p-3 text-sm text-slate-400">Sin resultados. Creá uno nuevo.</p>}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <div>
              <label className="text-xs text-slate-500">Nombre del insumo</label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Unidad base</label>
              <select
                value={unidadBase}
                onChange={(e) => setUnidadBase(e.target.value)}
                className="w-full h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
              >
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="grid grid-cols-[1fr_120px] gap-2">
          <div>
            <label className="text-xs text-slate-500">Texto a buscar en las facturas</label>
            <Input value={patron} onChange={(e) => setPatron(e.target.value)} />
            <p className="text-[11px] text-slate-400 mt-1">Toda línea que contenga este texto cuenta como este insumo. Acortalo para abarcar variantes.</p>
          </div>
          <div>
            <label className="text-xs text-slate-500">1 unidad de factura =</label>
            <div className="flex items-center gap-1">
              <Input value={factor} onChange={(e) => setFactor(e.target.value)} inputMode="decimal" className="text-right" />
              <span className="text-xs text-slate-500">{unidad ?? ''}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Ej: caja x12 → 12</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => guardar.mutate()} disabled={!valido || guardar.isPending} className="gap-2">
            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Asignar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Marca un rubro entero como venta directa. Pensado para bebidas: los vinos,
 * las gaseosas y las aguas se compran y se venden en la misma unidad, y crear
 * un insumo por cada etiqueta a mano no escala.
 *
 * Solo lista rubros que tengan algo pendiente, y aclara cuántos productos de
 * ese rubro quedarían afuera por tener receta — el bag in box que se sirve por
 * copa, por ejemplo, que debe seguir descontando por fórmula.
 */
function RubroDirecto({
  ventas,
  pendiente,
  onMarcar,
}: {
  ventas: VentaCobertura[]
  pendiente: boolean
  onMarcar: (rubroCodigo: string) => void
}) {
  const [abierto, setAbierto] = useState(false)

  const rubros = useMemo(() => {
    const m = new Map<string, { sinCubrir: number; conReceta: number }>()
    for (const v of ventas) {
      if (!v.rubro) continue
      const e = m.get(v.rubro) ?? { sinCubrir: 0, conReceta: 0 }
      if (v.conReceta && !v.ventaDirecta) e.conReceta++
      else if (!v.conReceta) e.sinCubrir++
      m.set(v.rubro, e)
    }
    return [...m.entries()]
      .filter(([, e]) => e.sinCubrir > 0)
      .sort((a, b) => b[1].sinCubrir - a[1].sinCubrir)
  }, [ventas])

  if (rubros.length === 0) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={pendiente}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
      >
        {pendiente ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Boxes className="h-3.5 w-3.5" />}
        Rubro 1 a 1
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            <p className="px-2 py-1.5 text-[11px] leading-snug text-slate-400">
              Marca todo el rubro como stock directo. Los productos con receta no
              se tocan.
            </p>
            {rubros.map(([rubro, e]) => (
              <button
                key={rubro}
                type="button"
                onClick={() => {
                  onMarcar(rubro)
                  setAbierto(false)
                }}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-50"
              >
                <span className="min-w-0 truncate text-slate-700">{rubro}</span>
                <span className="shrink-0 text-slate-400">
                  {e.sinCubrir} sin cubrir
                  {e.conReceta > 0 && <span className="text-amber-600"> · {e.conReceta} con receta</span>}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

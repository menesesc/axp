'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Loader2, Link2, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Insumo {
  id: string
  nombre: string
  unidadBase: string
  categoria?: string | null
  mermaPct?: number
}
interface Sugerencia {
  nombre: string
  insumoId: string | null
  insumoNombre: string | null
  confianza: number
  fuente: 'local' | 'ia' | 'ninguna'
}

/**
 * Segundo paso del editor: vincular cada ingrediente con un insumo del
 * catálogo. De ahí sale el costo por porción.
 *
 * Es opcional y lo dice: una receta sin vincular sirve igual, solo que no
 * costea. Vincular 200 recetas de una no es realista, así que esto está
 * pensado para hacerse de a poco, cuando conviene.
 *
 * Las sugerencias no se aplican solas. Un insumo equivocado ensucia el costo
 * sin que se note, y es más barato confirmar que descubrirlo después.
 */
export function VincularInsumos({
  nombres,
  vinculos,
  onChange,
}: {
  /** Nombres de los ingredientes, parseados del textarea. */
  nombres: string[]
  /** nombre normalizado → insumoId */
  vinculos: Record<string, string>
  onChange: (v: Record<string, string>) => void
}) {
  const [sugeridos, setSugeridos] = useState<Map<string, Sugerencia>>(new Map())

  const { data } = useQuery({
    queryKey: ['recetas-insumos'],
    queryFn: async () => (await fetch('/api/recetas/insumos')).json() as Promise<{ insumos: Insumo[] }>,
    staleTime: 5 * 60 * 1000,
  })
  const insumos = data?.insumos ?? []

  // Agrupados por categoría, con los sin categoría al final.
  const porCategoria = useMemo(() => {
    const m = new Map<string, Insumo[]>()
    for (const i of insumos) {
      const c = i.categoria?.trim() || 'Sin categoría'
      const xs = m.get(c) ?? []
      xs.push(i)
      m.set(c, xs)
    }
    return [...m.entries()].sort(([a2], [b2]) =>
      a2 === 'Sin categoría' ? 1 : b2 === 'Sin categoría' ? -1 : a2.localeCompare(b2)
    )
  }, [insumos])

  const sugerir = useMutation({
    mutationFn: async (conIA: boolean) => {
      const res = await fetch('/api/recetas/insumos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombres, conIA }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo sugerir')
      return json.sugerencias as Sugerencia[]
    },
    onSuccess: (sugs) => {
      setSugeridos(new Map(sugs.map((s) => [s.nombre, s])))
      const nuevas = sugs.filter((s) => s.insumoId && !vinculos[clave(s.nombre)]).length
      toast.success(nuevas > 0 ? `${nuevas} sugerencia${nuevas === 1 ? '' : 's'} para revisar` : 'Sin sugerencias nuevas')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const vinculados = useMemo(() => nombres.filter((n) => vinculos[clave(n)]).length, [nombres, vinculos])

  if (nombres.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 p-4">
        <p className="text-sm font-semibold">Costeo</p>
        <p className="mt-1 text-xs text-slate-400">Cargá los ingredientes para poder vincularlos con insumos.</p>
      </div>
    )
  }

  const aplicar = (nombre: string, insumoId: string) => {
    const v = { ...vinculos }
    if (insumoId) v[clave(nombre)] = insumoId
    else delete v[clave(nombre)]
    onChange(v)
  }

  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Costeo (opcional)</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Vinculá cada ingrediente con un insumo y la receta calcula su costo por porción. Sin vincular funciona
            igual, solo que no costea.
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button variant="outline" size="sm" onClick={() => sugerir.mutate(false)} disabled={sugerir.isPending} className="gap-1.5">
            <Link2 className="h-3.5 w-3.5" />
            Sugerir
          </Button>
          <Button size="sm" onClick={() => sugerir.mutate(true)} disabled={sugerir.isPending} className="gap-1.5">
            {sugerir.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Con IA
          </Button>
        </div>
      </div>

      <p className="mt-2.5 text-xs text-slate-500">
        {vinculados} de {nombres.length} vinculados
      </p>

      <ul className="mt-2 divide-y divide-slate-100">
        {nombres.map((nombre) => {
          const actual = vinculos[clave(nombre)] ?? ''
          const sug = sugeridos.get(nombre)
          const proponer = sug?.insumoId && sug.insumoId !== actual
          return (
            <li key={nombre} className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:gap-3">
              <span className="min-w-0 flex-1 truncate text-sm">{nombre}</span>
              <div className="flex items-center gap-1.5">
                <select
                  value={actual}
                  onChange={(e) => aplicar(nombre, e.target.value)}
                  className={cn(
                    'min-w-0 flex-1 rounded-md border px-2 py-1.5 text-sm sm:w-64',
                    actual ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white text-slate-400'
                  )}
                >
                  <option value="">Sin vincular</option>
                  {/* Agrupados por categoría: con cien insumos, una lista
                      plana obliga a recorrerla entera. */}
                  {porCategoria.map(([cat, items]) => (
                    <optgroup key={cat} label={cat}>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.nombre} ({i.unidadBase})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {actual && (
                  <button
                    onClick={() => aplicar(nombre, '')}
                    aria-label="Quitar vínculo"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded text-slate-400 hover:bg-slate-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {proponer && (
                <button
                  onClick={() => aplicar(nombre, sug!.insumoId!)}
                  className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-left text-xs font-medium text-amber-800 hover:bg-amber-100 sm:text-center"
                  title={`Sugerido por ${sug!.fuente === 'ia' ? 'IA' : 'coincidencia de nombre'}`}
                >
                  ¿{sug!.insumoNombre}?
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** La clave del vínculo es el nombre normalizado: sobrevive a editar el texto. */
export function clave(nombre: string): string {
  return nombre.trim().toLowerCase()
}

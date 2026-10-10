'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, Check, Link2, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Cómo se descuenta el stock de un insumo.
 *
 * Hay dos caminos y conviene que estén a la vista, porque la diferencia se
 * entiende mal:
 *
 *  - Por receta: el producto que se vende lleva una fórmula y el insumo se
 *    descuenta según esa fórmula (200 g de carne por hamburguesa).
 *  - Venta directa: el insumo ES el producto de la carta y se descuenta 1 a 1
 *    con lo vendido. Un vino que se compra y se vende por botella no necesita
 *    una receta de una unidad.
 *
 * Lo que NO cambia en ninguno de los dos casos es la entrada: el stock sube
 * sólo cuando una línea de factura matchea un alias de compra. Un insumo de
 * venta directa sin alias se descuenta con cada venta y no se repone nunca.
 */

interface Producto {
  id: string
  nombre: string
  codigo: string
  rubro: string | null
  conReceta: boolean
  tomadoPor: string | null
}

export function InsumoConsumo({
  insumo,
  canEdit,
}: {
  insumo: {
    id: string
    nombre: string
    unidadBase: string
    productMasterId: string | null
    productoVenta: string | null
    aliasCount: number
    recetasCount: number
  }
  canEdit: boolean
}) {
  const qc = useQueryClient()
  const [eligiendo, setEligiendo] = useState(false)
  const [q, setQ] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['insumo-productos', q],
    queryFn: async () => {
      const res = await fetch(`/api/conciliacion/insumos/productos?q=${encodeURIComponent(q)}`)
      if (!res.ok) throw new Error('No se pudo cargar el catálogo de venta')
      return res.json() as Promise<{ productos: Producto[] }>
    },
    enabled: eligiendo,
  })

  const vincular = useMutation({
    mutationFn: async (productMasterId: string | null) => {
      const res = await fetch(`/api/conciliacion/insumos/${insumo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productMasterId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'No se pudo guardar')
    },
    onSuccess: (_r, productMasterId) => {
      setEligiendo(false)
      setQ('')
      qc.invalidateQueries({ queryKey: ['conciliacion-insumos'] })
      qc.invalidateQueries({ queryKey: ['insumo-detalle'] })
      toast.success(productMasterId ? 'Insumo marcado como venta directa' : 'Se quitó la venta directa')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const esVentaDirecta = !!insumo.productMasterId
  const unidadOk = insumo.unidadBase === 'u'

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Cómo se descuenta</p>
          <p className="mt-1 text-sm">
            {esVentaDirecta ? (
              <>
                <span className="rounded bg-violet-50 px-1.5 py-0.5 text-xs font-semibold text-violet-700">
                  Venta directa
                </span>{' '}
                <span className="text-slate-700">1 a 1 con lo vendido de</span>{' '}
                <span className="font-medium">{insumo.productoVenta}</span>
              </>
            ) : insumo.recetasCount > 0 ? (
              <span className="text-slate-700">
                Por receta: aparece en {insumo.recetasCount} producto{insumo.recetasCount === 1 ? '' : 's'} de la carta.
              </span>
            ) : (
              <span className="text-amber-700">
                No se descuenta por ningún lado: no está en ninguna receta ni es venta directa.
              </span>
            )}
          </p>
        </div>

        {canEdit && (
          <div className="flex shrink-0 items-center gap-2">
            {esVentaDirecta ? (
              <button
                onClick={() => vincular.mutate(null)}
                disabled={vincular.isPending}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" />
                Quitar venta directa
              </button>
            ) : (
              <button
                onClick={() => setEligiendo((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                <Link2 className="h-3.5 w-3.5" />
                Marcar como venta directa
              </button>
            )}
          </div>
        )}
      </div>

      {/* La entrada de stock es independiente del camino de salida, y es el
          error más fácil de cometer. */}
      {insumo.aliasCount === 0 && (
        <p className="mt-3 flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Sin alias de compra. Sea por receta o venta directa, el stock sólo entra cuando una línea de factura
            matchea un alias: así como está, este insumo se descuenta con cada venta y no se repone nunca. Cargá el
            alias en la pestaña <strong>Compras</strong>.
          </span>
        </p>
      )}

      {eligiendo && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {!unidadOk && (
            <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              La unidad base de este insumo es <strong>{insumo.unidadBase}</strong>. La venta directa exige
              unidades (<strong>u</strong>), porque el consumo son las unidades vendidas. Cambiá la unidad primero.
            </p>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar el producto de la carta…"
              className="h-9 w-full rounded-md border border-slate-200 pl-8 pr-3 text-sm outline-none focus:border-slate-400"
            />
          </div>

          <ul className="mt-2 max-h-64 overflow-y-auto">
            {isLoading ? (
              <li className="py-6 text-center text-xs text-slate-400">Buscando…</li>
            ) : (data?.productos.length ?? 0) === 0 ? (
              <li className="py-6 text-center text-xs text-slate-400">Ningún producto coincide.</li>
            ) : (
              data!.productos.map((p) => {
                const bloqueado = !!p.tomadoPor || !unidadOk
                return (
                  <li key={p.id}>
                    <button
                      disabled={bloqueado || vincular.isPending}
                      onClick={() => vincular.mutate(p.id)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm',
                        bloqueado ? 'cursor-not-allowed opacity-50' : 'hover:bg-slate-50'
                      )}
                      title={p.tomadoPor ? `Ya vinculado a ${p.tomadoPor}` : ''}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{p.nombre}</span>
                        <span className="text-[11px] text-slate-400">
                          {p.codigo}
                          {p.rubro ? ` · ${p.rubro}` : ''}
                          {p.tomadoPor ? ` · ya es ${p.tomadoPor}` : ''}
                          {/* Si el producto tiene receta activa, la receta
                              manda y el vínculo no haría nada. */}
                          {p.conReceta ? ' · tiene receta activa, la receta tiene prioridad' : ''}
                        </span>
                      </span>
                      {vincular.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                      )}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

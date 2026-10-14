'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, Check, Loader2, Pencil, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Nombre del insumo, editable.
 *
 * Los de venta directa heredaron el nombre de Maxirest, cortado a lo que entra
 * en la comanda ("ALAMOS CABERNET S"), y así no se puede contar stock. Se
 * puede renombrar sin miedo: las ventas se cruzan por el id del producto y las
 * compras por el patrón del alias, ninguna por el nombre. El nombre corto
 * sigue a la vista como referencia, porque es el que se ve en el POS.
 *
 * Los candidatos salen de las facturas, donde el nombre viene completo. Al
 * elegir uno se ofrece además crear el alias de compra, que es la otra mitad
 * que a estos insumos les falta: sin alias no entra stock.
 */

interface Candidato {
  descripcion: string
  veces: number
  ultima: string | null
  proveedor: string | null
  yaUsada: string | null
}

export function InsumoNombre({
  insumo,
  canEdit,
}: {
  insumo: { id: string; nombre: string; productoVenta: string | null; aliasCount: number }
  canEdit: boolean
}) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(insumo.nombre)
  const [conAlias, setConAlias] = useState(insumo.aliasCount === 0)

  useEffect(() => {
    setNombre(insumo.nombre)
    setEditando(false)
    setConAlias(insumo.aliasCount === 0)
  }, [insumo.id, insumo.nombre, insumo.aliasCount])

  const { data } = useQuery({
    queryKey: ['insumo-nombres', insumo.id],
    queryFn: async () => {
      const res = await fetch(`/api/conciliacion/insumos/${insumo.id}/nombres`)
      if (!res.ok) return { candidatos: [] as Candidato[] }
      return res.json() as Promise<{ candidatos: Candidato[] }>
    },
    enabled: editando,
  })

  const guardar = useMutation({
    mutationFn: async ({ nuevo, alias }: { nuevo: string; alias?: string }) => {
      const res = await fetch(`/api/conciliacion/insumos/${insumo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nuevo }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'No se pudo renombrar')

      if (alias) {
        const r2 = await fetch(`/api/conciliacion/insumos/${insumo.id}/alias`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patron: alias }),
        })
        if (!r2.ok) {
          const j2 = await r2.json().catch(() => ({}))
          throw new Error(`Se renombró, pero el alias no: ${j2.error ?? 'error'}`)
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conciliacion-insumos'] })
      qc.invalidateQueries({ queryKey: ['insumo-alias', insumo.id] })
      setEditando(false)
      toast.success('Listo')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (!editando) {
    return (
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{insumo.nombre}</h2>
          {insumo.productoVenta && insumo.productoVenta !== insumo.nombre && (
            <p className="text-xs text-slate-400">En Maxirest: {insumo.productoVenta}</p>
          )}
        </div>
        {canEdit && (
          <button
            onClick={() => setEditando(true)}
            aria-label="Renombrar"
            title="Renombrar"
            className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    )
  }

  const candidatos = data?.candidatos ?? []

  return (
    <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="min-w-[14rem] flex-1 bg-white text-sm"
          autoFocus
        />
        <Button
          size="sm"
          disabled={guardar.isPending || !nombre.trim() || nombre === insumo.nombre}
          onClick={() => guardar.mutate({ nuevo: nombre.trim() })}
        >
          {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEditando(false)} aria-label="Cancelar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <p className="mt-1.5 text-xs text-slate-400">
        Renombrar no afecta nada de lo que entra: las ventas se cruzan por el producto de Maxirest y las compras por
        el alias.
        {insumo.productoVenta && <> En el POS sigue siendo <b>{insumo.productoVenta}</b>.</>}
      </p>

      {candidatos.length > 0 && (
        <div className="mt-3 border-t border-slate-200 pt-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            Cómo aparece en las facturas
          </p>
          {insumo.aliasCount === 0 && (
            <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={conAlias}
                onChange={(e) => setConAlias(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              Crear también el alias de compra (este insumo no tiene ninguno, así que hoy no recibe stock)
            </label>
          )}
          <ul className="mt-1.5 space-y-0.5">
            {candidatos.map((c) => (
              <li key={c.descripcion}>
                <button
                  onClick={() => {
                    setNombre(c.descripcion)
                    guardar.mutate({
                      nuevo: c.descripcion,
                      ...(conAlias && insumo.aliasCount === 0 && !c.yaUsada ? { alias: c.descripcion } : {}),
                    })
                  }}
                  disabled={guardar.isPending}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-white"
                >
                  <span className="block truncate">{c.descripcion}</span>
                  <span className="text-[11px] text-slate-400">
                    {c.veces} compra{c.veces === 1 ? '' : 's'}
                    {c.proveedor ? ` · ${c.proveedor}` : ''}
                    {c.ultima ? ` · última ${c.ultima}` : ''}
                  </span>
                  {c.yaUsada && (
                    <span className={cn('flex items-center gap-1 text-[11px] text-amber-700')}>
                      <AlertTriangle className="h-3 w-3" />
                      el alias de {c.yaUsada} ya toma esta descripción
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

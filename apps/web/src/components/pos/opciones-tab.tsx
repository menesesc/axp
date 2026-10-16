'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Loader2, Plus, X } from 'lucide-react'
import type { GrupoPos } from './opciones-producto'

/**
 * Los grupos de opciones y a qué productos se les pide.
 *
 * El mismo mecanismo cubre tres cosas que en el salón parecen distintas: la
 * salsa que hay que elegir sí o sí, los dos sabores del helado y el punto de
 * la carne. Lo único que cambia es el mínimo, el máximo y si admite escribir
 * algo que no está en la lista.
 */

interface ProductoLite {
  id: string
  nombre: string
  categoriaNombre: string | null
}

export function OpcionesTab({ productos }: { productos: ProductoLite[] }) {
  const qc = useQueryClient()
  const [nuevo, setNuevo] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['pos-grupos'],
    queryFn: async () => (await fetch('/api/pos/grupos')).json() as Promise<{ grupos: GrupoPos[] }>,
  })
  const grupos = data?.grupos ?? []

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['pos-grupos'] })
    qc.invalidateQueries({ queryKey: ['pos-catalogo'] })
  }

  const llamar = async (url: string, metodo: string, cuerpo?: unknown) => {
    const res = await fetch(url, {
      method: metodo,
      ...(cuerpo ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) } : {}),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || 'No se pudo guardar')
    return json
  }

  const accion = useMutation({
    mutationFn: ({ url, metodo, cuerpo }: { url: string; metodo: string; cuerpo?: unknown }) =>
      llamar(url, metodo, cuerpo),
    onSuccess: refrescar,
    onError: (e: Error) => toast.error(e.message),
  })

  const vincular = useMutation({
    mutationFn: async ({ productoId, grupoIds }: { productoId: string; grupoIds: string[] }) =>
      llamar('/api/pos/catalogo', 'PATCH', { id: productoId, grupoIds }),
    onSuccess: refrescar,
    onError: (e: Error) => toast.error(e.message),
  })

  const grupo = grupos.find((g) => g.id === abierto)
  const filtrados = q.trim()
    ? productos.filter((p) => p.nombre.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40)
    : []

  if (isLoading) {
    return <div className="grid place-items-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
      <div className="space-y-2">
        {grupos.map((g) => (
          <button
            key={g.id}
            onClick={() => { setAbierto(g.id); setQ('') }}
            className={cn(
              'w-full rounded-xl border p-3 text-left',
              g.id === abierto ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'
            )}
          >
            <p className="font-semibold">{g.nombre}</p>
            <p className="text-xs text-slate-500">
              {g.minimo === g.maximo ? `elegir ${g.minimo}` : `de ${g.minimo} a ${g.maximo}`}
              {g.permiteTexto && ' · admite escribir'}
              {' · '}{g.opciones.length} opciones · {g.productos.length} productos
            </p>
          </button>
        ))}

        <div className="flex gap-1.5">
          <Input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder="Nuevo grupo (Salsas, Sabores…)"
            className="h-10 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && nuevo.trim()) {
                accion.mutate({ url: '/api/pos/grupos', metodo: 'POST', cuerpo: { nombre: nuevo, minimo: 1, maximo: 1 } })
                setNuevo('')
              }
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-10"
            disabled={!nuevo.trim()}
            onClick={() => {
              accion.mutate({ url: '/api/pos/grupos', metodo: 'POST', cuerpo: { nombre: nuevo, minimo: 1, maximo: 1 } })
              setNuevo('')
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!grupo ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
          Elegí un grupo para cargarle las opciones y decir a qué productos se les pide.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-slate-500">
                Mínimo
                <Input
                  key={`min-${grupo.id}`}
                  defaultValue={grupo.minimo}
                  inputMode="numeric"
                  className="h-9 w-20"
                  onBlur={(e) =>
                    accion.mutate({ url: '/api/pos/grupos', metodo: 'PATCH', cuerpo: { id: grupo.id, minimo: Number(e.target.value) || 0 } })
                  }
                />
              </label>
              <label className="text-xs text-slate-500">
                Máximo
                <Input
                  key={`max-${grupo.id}`}
                  defaultValue={grupo.maximo}
                  inputMode="numeric"
                  className="h-9 w-20"
                  onBlur={(e) =>
                    accion.mutate({ url: '/api/pos/grupos', metodo: 'PATCH', cuerpo: { id: grupo.id, maximo: Number(e.target.value) || 1 } })
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={!!grupo.permiteTexto}
                  onChange={(e) =>
                    accion.mutate({ url: '/api/pos/grupos', metodo: 'PATCH', cuerpo: { id: grupo.id, permiteTexto: e.target.checked } })
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
                Deja escribir otra cosa
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-sm font-semibold">Opciones</p>
            <div className="flex flex-wrap gap-1.5">
              {grupo.opciones.map((o) => (
                <span key={o.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm">
                  {o.nombre}
                  {o.precioExtra !== 0 && <span className="text-xs text-slate-500">+{Math.round(o.precioExtra)}</span>}
                  <button
                    onClick={() => accion.mutate({ url: `/api/pos/grupos/opciones?id=${o.id}`, metodo: 'DELETE' })}
                    className="grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-slate-200"
                    aria-label="Sacar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
            <NuevaOpcion
              onAgregar={(nombre, precioExtra) =>
                accion.mutate({
                  url: '/api/pos/grupos/opciones',
                  metodo: 'POST',
                  cuerpo: { grupoId: grupo.id, nombre, precioExtra },
                })
              }
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-sm font-semibold">A qué productos se les pide</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {grupo.productos.map((id) => {
                const p = productos.find((x) => x.id === id)
                return (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full bg-slate-900 py-1 pl-3 pr-1 text-sm text-white">
                    {p?.nombre ?? '—'}
                    <button
                      onClick={() =>
                        vincular.mutate({
                          productoId: id,
                          grupoIds: grupos.filter((g) => g.id !== grupo.id && g.productos.includes(id)).map((g) => g.id),
                        })
                      }
                      className="grid h-6 w-6 place-items-center rounded-full text-white/70 hover:bg-white/20"
                      aria-label="Sacar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )
              })}
            </div>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar un producto para sumarlo…"
              className="h-10 text-sm"
            />
            {filtrados.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {filtrados
                  .filter((p) => !grupo.productos.includes(p.id))
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() =>
                        vincular.mutate({
                          productoId: p.id,
                          grupoIds: [
                            ...grupos.filter((g) => g.productos.includes(p.id)).map((g) => g.id),
                            grupo.id,
                          ],
                        })
                      }
                      className="rounded-full bg-slate-100 px-3 py-1 text-sm hover:bg-slate-200"
                    >
                      + {p.nombre}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function NuevaOpcion({ onAgregar }: { onAgregar: (nombre: string, precioExtra: number) => void }) {
  const [nombre, setNombre] = useState('')
  const [extra, setExtra] = useState('')
  const sumar = () => {
    if (!nombre.trim()) return
    onAgregar(nombre.trim(), Number(extra) || 0)
    setNombre('')
    setExtra('')
  }
  return (
    <div className="mt-3 flex gap-1.5">
      <Input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && sumar()}
        placeholder="Nueva opción"
        className="h-10 flex-1 text-sm"
      />
      <Input
        value={extra}
        onChange={(e) => setExtra(e.target.value.replace(/[^\d]/g, ''))}
        placeholder="Extra $"
        className="h-10 w-24 text-sm"
      />
      <Button size="sm" variant="outline" className="h-10" disabled={!nombre.trim()} onClick={sumar}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )
}

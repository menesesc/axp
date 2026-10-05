'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useUser } from '@/hooks/use-user'
import { RecetaCard } from '@/components/recetas/receta-card'
import type { CategoriaReceta, RecetaListada } from '@/components/recetas/tipos'
import { ChefHat, Plus, Search, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function RecetasPage() {
  const qc = useQueryClient()
  const { isLoading: cargandoUsuario } = useUser()
  const [q, setQ] = useState('')
  const [categoriaId, setCategoriaId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['recetas'],
    queryFn: async () => {
      const res = await fetch('/api/recetas')
      if (!res.ok) throw new Error('No se pudo cargar el recetario')
      return res.json() as Promise<{ recetas: RecetaListada[]; puedeEditar: boolean }>
    },
  })

  const { data: cats } = useQuery({
    queryKey: ['receta-categorias'],
    queryFn: async () => {
      const res = await fetch('/api/recetas/categorias')
      if (!res.ok) throw new Error('No se pudieron cargar las categorías')
      return res.json() as Promise<{ categorias: CategoriaReceta[] }>
    },
    staleTime: 5 * 60 * 1000,
  })

  const favorita = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/recetas/${id}/favorita`, { method: 'POST' })
      if (!res.ok) throw new Error('No se pudo guardar')
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recetas'] }),
    onError: (e: Error) => toast.error(e.message),
  })

  const crear = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/recetas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: 'Receta sin título' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo crear')
      return json as { receta: { id: string } }
    },
    onSuccess: (r) => {
      window.location.href = `/recetas/${r.receta.id}?editar=1`
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const recetas = data?.recetas ?? []
  const puedeEditar = data?.puedeEditar ?? false

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase()
    return recetas
      .filter((r) => !categoriaId || r.categoria?.id === categoriaId)
      .filter((r) => !t || r.titulo.toLowerCase().includes(t) || (r.descripcion ?? '').toLowerCase().includes(t))
  }, [recetas, q, categoriaId])

  const destacadas = filtradas.filter((r) => r.favorita || r.destacada)
  const resto = filtradas.filter((r) => !(r.favorita || r.destacada))

  if (cargandoUsuario) return null

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          {/* Logo de la empresa, si lo cargaron en Configuración → Empresa.
              onError lo oculta: si la key quedó colgada, mejor sin logo que
              con el ícono de imagen rota. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/api/configuracion/empresa/logo"
            alt=""
            // mix-blend-multiply funde el blanco del PNG con el fondo claro.
            // Procesar la imagen para hacerlo transparente sería más prolijo,
            // pero recortar por color se come las partes blancas del logo.
            className="hidden h-9 w-auto max-w-[160px] shrink-0 object-contain mix-blend-multiply sm:block"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar receta"
              className="rounded-full border-slate-200 bg-slate-50 pl-9"
            />
          </div>
          {puedeEditar && (
            <>
              <Link
                href="/configuracion/recetario"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
                title="Categorías y dispositivos"
              >
                <Settings2 className="h-4.5 w-4.5" />
              </Link>
              <Button onClick={() => crear.mutate()} disabled={crear.isPending} className="shrink-0 gap-1.5 rounded-full">
                <Plus className="h-4 w-4" />
                Nueva
              </Button>
            </>
          )}
        </div>

        {/* Categorías. Scroll horizontal en mobile: son ocho o más. */}
        <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setCategoriaId(null)}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition',
              categoriaId === null ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 hover:bg-slate-50'
            )}
          >
            Todas
          </button>
          {(cats?.categorias ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoriaId(c.id === categoriaId ? null : c.id)}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition',
                c.id === categoriaId ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 hover:bg-slate-50'
              )}
            >
              {c.emoji && <span className="mr-1">{c.emoji}</span>}
              {c.nombre}
              <span className={cn('ml-1.5 text-xs', c.id === categoriaId ? 'text-white/60' : 'text-slate-400')}>
                {c.recetas}
              </span>
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : filtradas.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <ChefHat className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">
              {q || categoriaId ? 'No hay recetas con ese filtro.' : 'Todavía no hay recetas cargadas.'}
            </p>
          </div>
        ) : (
          <>
            {destacadas.length > 0 && (
              <section>
                <h2 className="mb-3 text-xl font-bold">De la casa</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {destacadas.map((r, i) => (
                    <div key={r.id} className={i === 0 ? 'col-span-2 row-span-2 sm:col-span-2' : ''}>
                      <RecetaCard
                        receta={r}
                        alto={i === 0 ? 'aspect-square sm:h-full sm:min-h-[320px]' : 'aspect-[4/3]'}
                        onFavorita={(id) => favorita.mutate(id)}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {resto.length > 0 && (
              <section>
                <h2 className="mb-3 text-xl font-bold">
                  {destacadas.length > 0 ? 'Todo el recetario' : 'Recetas'}
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {resto.map((r) => (
                    <RecetaCard key={r.id} receta={r} onFavorita={(id) => favorita.mutate(id)} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

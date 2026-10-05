'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUser } from '@/hooks/use-user'
import { SECCION } from '@/lib/permisos'
import type { CategoriaReceta, DispositivoReceta } from '@/components/recetas/tipos'
import { ArrowLeft, EyeOff, Loader2, Plus } from 'lucide-react'

type Fila = { id: string; nombre: string; emoji: string | null; color?: string | null; recetas: number }

/**
 * Categorías y dispositivos del recetario.
 *
 * Nada se borra: se desactiva. Borrar una categoría dejaría recetas sin
 * clasificar y borrar un dispositivo las dejaría sin su equipamiento, y eso es
 * una pérdida silenciosa. Desactivado deja de ofrecerse al cargar.
 */
export default function RecetarioConfigPage() {
  const { canEdit, isLoading } = useUser()
  const puedeEditar = canEdit(SECCION.RECETAS_LIBRO)

  if (isLoading) return null

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <Link href="/recetas" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            Recetario
          </Link>
          <Header title="Recetario" description="Categorías y dispositivos con los que se organiza el libro" />
        </div>

        <Seccion
          titulo="Categorías"
          descripcion="Ordenan todo el recetario. Cada receta pertenece a una."
          endpoint="/api/recetas/categorias"
          queryKey="receta-categorias"
          campo="categorias"
          conColor
          puedeEditar={puedeEditar}
        />

        <Seccion
          titulo="Dispositivos"
          descripcion="El equipamiento de la cocina. Cada receta marca el que necesita."
          endpoint="/api/recetas/dispositivos"
          queryKey="receta-dispositivos"
          campo="dispositivos"
          puedeEditar={puedeEditar}
        />
      </div>
    </DashboardLayout>
  )
}

function Seccion({
  titulo,
  descripcion,
  endpoint,
  queryKey,
  campo,
  conColor = false,
  puedeEditar,
}: {
  titulo: string
  descripcion: string
  endpoint: string
  queryKey: string
  campo: 'categorias' | 'dispositivos'
  conColor?: boolean
  puedeEditar: boolean
}) {
  const qc = useQueryClient()
  const [nuevo, setNuevo] = useState('')
  const [emoji, setEmoji] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: async () => {
      const res = await fetch(endpoint)
      if (!res.ok) throw new Error('No se pudo cargar')
      return res.json() as Promise<Record<string, Array<CategoriaReceta | DispositivoReceta>>>
    },
  })

  const crear = useMutation({
    mutationFn: async () => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nuevo.trim(), emoji: emoji.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo crear')
    },
    onSuccess: () => {
      setNuevo('')
      setEmoji('')
      qc.invalidateQueries({ queryKey: [queryKey] })
      toast.success('Creado')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const actualizar = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'No se pudo guardar')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [queryKey] }),
    onError: (e: Error) => toast.error(e.message),
  })

  const filas = (data?.[campo] ?? []) as Fila[]

  return (
    <section>
      <h2 className="text-lg font-bold">{titulo}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{descripcion}</p>

      <div className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200">
        {isLoading ? (
          <p className="p-6 text-center text-sm text-slate-400">Cargando…</p>
        ) : filas.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">Todavía no hay ninguno.</p>
        ) : (
          filas.map((x) => (
            <div key={x.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-xl">{x.emoji}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{x.nombre}</span>
              <span className="shrink-0 text-xs text-slate-400">
                {x.recetas} receta{x.recetas === 1 ? '' : 's'}
              </span>
              {conColor && x.color && (
                <span className="h-5 w-5 shrink-0 rounded-full border border-slate-200" style={{ background: x.color }} />
              )}
              {puedeEditar && (
                <button
                  onClick={() => {
                    if (confirm(`¿Dar de baja "${x.nombre}"? Deja de ofrecerse, pero las recetas que lo usan no se tocan.`)) {
                      actualizar.mutate({ id: x.id, activo: false })
                    }
                  }}
                  title="Dar de baja"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <EyeOff className="h-4 w-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {puedeEditar && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="🍰"
            className="w-16 text-center"
            maxLength={4}
          />
          <Input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && nuevo.trim() && crear.mutate()}
            placeholder={`Nueva ${titulo.slice(0, -1).toLowerCase()}`}
            className="min-w-[10rem] flex-1"
          />
          <Button onClick={() => crear.mutate()} disabled={!nuevo.trim() || crear.isPending} className="gap-1.5">
            {crear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Agregar
          </Button>
        </div>
      )}
    </section>
  )
}

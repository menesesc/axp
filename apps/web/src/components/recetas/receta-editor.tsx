'use client'

import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fotoUrl, type CategoriaReceta, type DispositivoReceta, type RecetaDetalle } from './tipos'
import { VincularInsumos, clave } from './vincular-insumos'

/**
 * Editor de una receta.
 *
 * Ingredientes y pasos se cargan como texto, una línea cada uno: es lo más
 * rápido para pasar un recetario en papel, que es de donde salen. Una línea
 * terminada en ":" abre una sección ("Masa:", "Relleno:"), igual que lo muestra
 * la ficha.
 */

const DIFICULTADES = ['Fácil', 'Media', 'Difícil']

type Linea = { seccion: string | null; texto: string }

/** Texto libre → filas con su sección. */
function parsear(txt: string): Linea[] {
  const out: Linea[] = []
  let seccion: string | null = null
  for (const bruta of txt.split('\n')) {
    const linea = bruta.trim()
    if (!linea) continue
    if (linea.endsWith(':')) {
      seccion = linea.slice(0, -1).trim() || null
      continue
    }
    out.push({ seccion, texto: linea })
  }
  return out
}

/** "1,2 kg Ojo de bife" → cantidad, unidad y nombre. Sin número, todo es nombre. */
function parsearIngrediente(texto: string) {
  const m = texto.match(/^([\d]+(?:[.,][\d]+)?)\s*([^\s\d]+)\s+(.*)$/)
  if (!m) return { nombre: texto, cantidad: null as number | null, unidad: null as string | null }
  return { cantidad: parseFloat(m[1]!.replace(',', '.')), unidad: m[2]!, nombre: m[3]! }
}

function aTexto(items: Array<{ seccion: string | null; texto: string }>) {
  const out: string[] = []
  let seccion: string | null = null
  for (const it of items) {
    if (it.seccion !== seccion) {
      seccion = it.seccion
      if (seccion) out.push(`${seccion}:`)
    }
    out.push(it.texto)
  }
  return out.join('\n')
}

export function RecetaEditor({
  receta,
  onCerrar,
  onEliminada,
}: {
  receta: RecetaDetalle
  onCerrar: () => void
  onEliminada: () => void
}) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [f, setF] = useState({
    titulo: receta.titulo,
    descripcion: receta.descripcion ?? '',
    categoriaId: receta.categoriaId ?? '',
    dificultad: receta.dificultad ?? 'Media',
    prepMin: receta.prepMin ?? 0,
    totalMin: receta.totalMin ?? 0,
    porciones: receta.porciones,
    autor: receta.autor ?? '',
    youtubeUrl: receta.youtubeUrl ?? '',
    estado: receta.estado,
    fotoKey: receta.fotoKey,
    dispositivoIds: receta.dispositivos.map((d) => d.id),
    ingTexto: aTexto(
      receta.ingredientes.map((i) => ({
        seccion: i.seccion,
        texto: [i.cantidad != null ? String(i.cantidad).replace('.', ',') : null, i.unidad, i.nombre]
          .filter(Boolean)
          .join(' '),
      }))
    ),
    pasoTexto: aTexto(receta.pasos.map((p) => ({ seccion: p.seccion, texto: p.texto }))),
    sugTexto: receta.sugerencias.map((s) => s.texto).join('\n'),
  })
  // nombre normalizado → insumoId. Se guarda aparte del textarea para que
  // editar el texto de los ingredientes no borre lo ya vinculado.
  const [vinculos, setVinculos] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      receta.ingredientes.filter((i) => i.insumoId).map((i) => [clave(i.nombre), i.insumoId!])
    )
  )
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((prev) => ({ ...prev, [k]: v }))

  const { data: cats } = useQuery({
    queryKey: ['receta-categorias'],
    queryFn: async () => (await fetch('/api/recetas/categorias')).json() as Promise<{ categorias: CategoriaReceta[] }>,
  })
  const { data: disp } = useQuery({
    queryKey: ['receta-dispositivos'],
    queryFn: async () => (await fetch('/api/recetas/dispositivos')).json() as Promise<{ dispositivos: DispositivoReceta[] }>,
  })

  const subirFoto = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/recetas/foto', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo subir')
      return json as { fotoKey: string }
    },
    onSuccess: (r) => {
      set('fotoKey', r.fotoKey)
      toast.success('Foto subida')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const guardar = useMutation({
    mutationFn: async () => {
      const ingredientes = parsear(f.ingTexto).map((l) => {
        const ing = parsearIngrediente(l.texto)
        return { seccion: l.seccion, ...ing, insumoId: vinculos[clave(ing.nombre)] ?? null }
      })
      const pasos = parsear(f.pasoTexto).map((l) => ({ seccion: l.seccion, texto: l.texto }))
      const sugerencias = f.sugTexto.split('\n').map((s) => s.trim()).filter(Boolean)

      const res = await fetch(`/api/recetas/${receta.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...f,
          categoriaId: f.categoriaId || null,
          ingredientes,
          pasos,
          sugerencias,
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'No se pudo guardar')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receta', receta.id] })
      qc.invalidateQueries({ queryKey: ['recetas'] })
      toast.success('Receta guardada')
      onCerrar()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const eliminar = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/recetas/${receta.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('No se pudo eliminar')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recetas'] })
      toast.success('Receta eliminada')
      onEliminada()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const url = fotoUrl(f.fotoKey)

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-4 pb-24">
        <button onClick={onCerrar} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          Cancelar
        </button>
        <h1 className="text-2xl font-bold">Editar receta</h1>

        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="mb-2 text-sm font-semibold">Foto y video</p>
          <div className="flex flex-wrap items-start gap-3">
            <div className="relative h-28 w-40 shrink-0 overflow-hidden rounded-xl bg-slate-100">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-slate-300">
                  <ImageIcon className="h-7 w-7" />
                </div>
              )}
            </div>
            <div className="min-w-[14rem] flex-1 space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) subirFoto.mutate(file)
                  e.target.value = ''
                }}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={subirFoto.isPending} className="gap-1.5">
                {subirFoto.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Subir foto
              </Button>
              <p className="text-xs text-slate-400">JPG, PNG o WEBP, hasta 8 MB.</p>
              <label className="block pt-1">
                <span className="mb-1 block text-sm font-medium">Video de YouTube</span>
                <Input
                  value={f.youtubeUrl}
                  onChange={(e) => set('youtubeUrl', e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                />
              </label>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Título</span>
            <Input value={f.titulo} onChange={(e) => set('titulo', e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Descripción</span>
            <textarea
              rows={2}
              value={f.descripcion}
              onChange={(e) => set('descripcion', e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Categoría</span>
            <select
              value={f.categoriaId}
              onChange={(e) => set('categoriaId', e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Sin categoría</option>
              {(cats?.categorias ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Dificultad</span>
            <select
              value={f.dificultad}
              onChange={(e) => set('dificultad', e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {DIFICULTADES.map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Prep. (min)</span>
            <Input type="number" value={f.prepMin} onChange={(e) => set('prepMin', Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Total (min)</span>
            <Input type="number" value={f.totalMin} onChange={(e) => set('totalMin', Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Porciones</span>
            <Input type="number" value={f.porciones} onChange={(e) => set('porciones', Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Estación</span>
            <Input value={f.autor} onChange={(e) => set('autor', e.target.value)} placeholder="Cocina, Pastelería, Barra…" />
          </label>

          <div className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Estado</span>
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {([['borrador', 'Borrador', 'Solo la ve quien edita'], ['publicada', 'Publicada', 'La ve todo el equipo']] as const).map(
                ([v, l, h]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set('estado', v)}
                    className={cn(
                      'flex-1 rounded-md px-3 py-2 text-sm font-semibold transition',
                      f.estado === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    )}
                  >
                    {l}
                    <span className="block text-[11px] font-normal text-slate-400">{h}</span>
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="mb-1 text-sm font-semibold">Dispositivos</p>
          <p className="mb-2.5 text-xs text-slate-400">Qué equipamiento hace falta.</p>
          <div className="flex flex-wrap gap-1.5">
            {(disp?.dispositivos ?? []).map((d) => {
              const on = f.dispositivoIds.includes(d.id)
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() =>
                    set('dispositivoIds', on ? f.dispositivoIds.filter((x) => x !== d.id) : [...f.dispositivoIds, d.id])
                  }
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition',
                    on ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  )}
                >
                  {d.emoji} {d.nombre}
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="mb-1 text-sm font-semibold">Ingredientes</p>
          <p className="mb-2 text-xs text-slate-400">
            Uno por línea: <code>cantidad unidad nombre</code>. Una línea que termine en “:” abre una sección.
          </p>
          <textarea
            rows={8}
            value={f.ingTexto}
            onChange={(e) => set('ingTexto', e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-[13px] outline-none focus:border-emerald-500"
          />
        </div>

        <VincularInsumos
          nombres={[...new Set(parsear(f.ingTexto).map((l) => parsearIngrediente(l.texto).nombre))]}
          vinculos={vinculos}
          onChange={setVinculos}
        />

        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="mb-1 text-sm font-semibold">Preparación</p>
          <p className="mb-2 text-xs text-slate-400">Un paso por línea. Una línea que termine en “:” abre una sección.</p>
          <textarea
            rows={8}
            value={f.pasoTexto}
            onChange={(e) => set('pasoTexto', e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-emerald-500"
          />
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="mb-1 text-sm font-semibold">Sugerencias</p>
          <p className="mb-2 text-xs text-slate-400">Una por línea. Opcional.</p>
          <textarea
            rows={3}
            value={f.sugTexto}
            onChange={(e) => set('sugTexto', e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button
            onClick={() => {
              if (confirm(`¿Eliminar "${receta.titulo}"? No se puede deshacer.`)) eliminar.mutate()
            }}
            disabled={eliminar.isPending}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">Eliminar</span>
          </button>
          <button onClick={onCerrar} className="ml-auto rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
          <Button onClick={() => guardar.mutate()} disabled={guardar.isPending || !f.titulo.trim()} className="gap-1.5">
            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </div>
    </DashboardLayout>
  )
}

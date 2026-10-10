'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { ModoCocina } from '@/components/recetas/modo-cocina'
import { RecetaEditor } from '@/components/recetas/receta-editor'
import { fmtMin, fmtPesos, fotoUrl, type RecetaDetalle } from '@/components/recetas/tipos'
import {
  ArrowLeft, ChefHat, Clock, Gauge, Heart, Minus, Pencil, Play, Plus, Printer, User, Utensils,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function RecetaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const sp = useSearchParams()
  const qc = useQueryClient()

  const [editando, setEditando] = useState(sp.get('editar') === '1')
  const [cocinando, setCocinando] = useState(false)
  const [porciones, setPorciones] = useState<number | null>(null)
  const [hechos, setHechos] = useState<Set<number>>(new Set())
  const [editandoNota, setEditandoNota] = useState(false)
  const [borradorNota, setBorradorNota] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['receta', id],
    queryFn: async () => {
      const res = await fetch(`/api/recetas/${id}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'No se pudo cargar')
      return res.json() as Promise<{ receta: RecetaDetalle; puedeEditar: boolean }>
    },
  })

  const favorita = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/recetas/${id}/favorita`, { method: 'POST' })
      if (!res.ok) throw new Error('No se pudo guardar')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receta', id] })
      qc.invalidateQueries({ queryKey: ['recetas'] })
    },
  })

  const guardarNota = useMutation({
    mutationFn: async (texto: string) => {
      const res = await fetch(`/api/recetas/${id}/nota`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      })
      if (!res.ok) throw new Error('No se pudo guardar la nota')
      return res.json()
    },
    onSuccess: () => {
      setEditandoNota(false)
      qc.invalidateQueries({ queryKey: ['receta', id] })
      toast.success('Nota guardada')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const r = data?.receta
  const base = r?.porciones ?? 1
  const p = porciones ?? base
  const factor = base > 0 ? p / base : 1

  // Los ingredientes y pasos vienen planos con su sección; se agrupan para
  // mostrarlos, conservando el orden en que se guardaron.
  const grupos = useMemo(() => {
    const agrupar = <T extends { seccion: string | null }>(items: T[]) => {
      const out: Array<{ seccion: string | null; items: T[] }> = []
      for (const it of items) {
        const ultimo = out[out.length - 1]
        if (ultimo && ultimo.seccion === it.seccion) ultimo.items.push(it)
        else out.push({ seccion: it.seccion, items: [it] })
      }
      return out
    }
    return { ingredientes: agrupar(r?.ingredientes ?? []), pasos: agrupar(r?.pasos ?? []) }
  }, [r])

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
      </DashboardLayout>
    )
  }
  if (!r) {
    return (
      <DashboardLayout>
        <p className="py-16 text-center text-sm text-slate-500">
          No encontramos esta receta.{' '}
          <Link href="/recetas" className="font-semibold text-slate-900 underline">
            Volver al recetario
          </Link>
        </p>
      </DashboardLayout>
    )
  }

  if (editando) {
    return (
      <RecetaEditor
        receta={r}
        onCerrar={() => {
          setEditando(false)
          router.replace(`/recetas/${id}`)
        }}
        onEliminada={() => router.push('/recetas')}
      />
    )
  }

  const cant = (n: number | null) => {
    if (n == null) return ''
    const v = n * factor
    return Number.isInteger(v) ? String(v) : String(+v.toFixed(2)).replace('.', ',')
  }
  const url = fotoUrl(r.fotoKey)
  let indicePaso = 0

  return (
    <DashboardLayout>
      {cocinando && (
        <ModoCocina
          titulo={r.titulo}
          pasos={r.pasos}
          ingredientes={r.ingredientes}
          porciones={p}
          factor={factor}
          onCerrar={() => setCocinando(false)}
        />
      )}

      <div className="space-y-5">
        <Link href="/recetas" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          Recetario
        </Link>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="relative overflow-hidden rounded-2xl bg-slate-200">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" className="aspect-[4/3] w-full object-cover" />
            ) : (
              <div className="grid aspect-[4/3] w-full place-items-center bg-gradient-to-br from-slate-300 to-slate-400 text-7xl font-bold text-white/30">
                {r.titulo[0]}
              </div>
            )}
            {r.youtubeUrl && (
              <a
                href={r.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 grid place-items-center"
              >
                <span className="grid h-16 w-16 place-items-center rounded-full bg-white/90 shadow-lg backdrop-blur transition hover:scale-105">
                  <Play className="h-7 w-7 translate-x-0.5 fill-slate-900 text-slate-900" />
                </span>
                <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
                  Ver en YouTube
                </span>
              </a>
            )}
          </div>

          <div className="flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {r.categoria && (
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide"
                    style={{ background: `${r.categoria.color ?? '#64748b'}14`, color: r.categoria.color ?? '#475569' }}
                  >
                    {r.categoria.nombre}
                  </span>
                )}
                {r.estado === 'borrador' && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-amber-800">
                    Borrador
                  </span>
                )}
                {r.dispositivos.map((d) => (
                  <span key={d.id} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                    {d.emoji} {d.nombre}
                  </span>
                ))}
              </div>
              <div className="flex shrink-0 gap-1.5">
                {data?.puedeEditar && (
                  <button
                    onClick={() => setEditando(true)}
                    aria-label="Editar receta"
                    className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white hover:bg-slate-50"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <a
                  href={`/recetas/${id}/print${porciones ? `?porciones=${porciones}` : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Imprimir o guardar en PDF"
                  className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white hover:bg-slate-50"
                >
                  <Printer className="h-4 w-4" />
                </a>
                <button
                  onClick={() => favorita.mutate()}
                  aria-label={r.favorita ? 'Quitar de favoritas' : 'Marcar como favorita'}
                  className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white hover:bg-slate-50"
                >
                  <Heart className={cn('h-4 w-4', r.favorita && 'fill-rose-500 text-rose-500')} />
                </button>
              </div>
            </div>

            <h1 className="mt-3 text-3xl font-bold leading-tight">{r.titulo}</h1>
            {r.descripcion && <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{r.descripcion}</p>}

            <dl className="mt-5 space-y-2.5 text-[15px]">
              {r.prepMin != null && (
                <div className="flex items-center gap-3">
                  <ChefHat className="h-5 w-5 text-slate-400" />
                  <span>Prep. <b>{fmtMin(r.prepMin)}</b></span>
                </div>
              )}
              {r.totalMin != null && (
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-slate-400" />
                  <span>Total <b>{fmtMin(r.totalMin)}</b></span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Utensils className="h-5 w-5 text-slate-400" />
                <span><b>{base}</b> porciones</span>
              </div>
              {r.dificultad && (
                <div className="flex items-center gap-3">
                  <Gauge className="h-5 w-5 text-slate-400" />
                  <span>Dificultad <b>{r.dificultad.toLowerCase()}</b></span>
                </div>
              )}
              {r.autor && (
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-slate-400" />
                  <span>{r.autor}</span>
                </div>
              )}
            </dl>

            {r.costo && r.costo.costeados > 0 && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-slate-500">Costo por porción</span>
                  <b className="text-xl">{fmtPesos(r.costo.total / base)}</b>
                </div>
                <div className="mt-1 flex items-baseline justify-between text-xs text-slate-400">
                  <span>Receta completa ({base} porciones)</span>
                  <span>{fmtPesos(r.costo.total)}</span>
                </div>
                {r.costo.faltantes.length > 0 && (
                  <p className="mt-2 text-[11px] leading-snug text-amber-700">
                    Parcial: {r.costo.faltantes.length} ingrediente
                    {r.costo.faltantes.length === 1 ? '' : 's'} sin insumo vinculado o sin compras.
                  </p>
                )}
              </div>
            )}

            {r.pasos.length > 0 && (
              <Button onClick={() => setCocinando(true)} className="mt-5 h-12 gap-2 rounded-xl text-base">
                <ChefHat className="h-5 w-5" />
                Cocinar hoy
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Porciones</h2>
                <div className="flex items-center gap-1 rounded-full border border-slate-200 p-0.5">
                  <button
                    onClick={() => setPorciones(Math.max(1, p - 1))}
                    aria-label="Menos porciones"
                    className="grid h-7 w-7 place-items-center rounded-full hover:bg-slate-100"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-9 text-center text-sm font-bold tabular-nums">{p}</span>
                  <button
                    onClick={() => setPorciones(p + 1)}
                    aria-label="Más porciones"
                    className="grid h-7 w-7 place-items-center rounded-full hover:bg-slate-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {p !== base && <p className="mt-2 text-xs text-emerald-700">Cantidades recalculadas desde {base} porciones.</p>}
            </div>

            {r.ingredientes.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="mb-3 text-lg font-bold">Ingredientes</h2>
                {grupos.ingredientes.map((g, gi) => (
                  <div key={gi}>
                    {g.seccion && (
                      <p className={cn('mb-1.5 text-sm font-semibold text-slate-400', gi > 0 && 'mt-3')}>{g.seccion}</p>
                    )}
                    <ul className="space-y-2">
                      {g.items.map((ing, k) => (
                        <li key={ing.id ?? k} className="flex gap-2.5 text-[15px]">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                          <span className="min-w-0 flex-1">
                            {ing.cantidad != null && (
                              <b className="tabular-nums">{cant(ing.cantidad)} {ing.unidad} </b>
                            )}
                            {ing.cantidad != null ? 'de ' : ''}
                            {ing.nombre}
                            {ing.nota && <span className="block text-[13px] text-slate-400">{ing.nota}</span>}
                            {/* La merma explica por qué del depósito sale más
                                de lo que dice la receta, y por qué el costo no
                                es cantidad x precio a secas. */}
                            {!!ing.mermaPct && ing.cantidadBruta != null && (
                              <span className="block text-[13px] text-amber-700">
                                {cant(ing.cantidadBruta)} {ing.unidad} del depósito · {cant(ing.mermaPct)}% de merma
                              </span>
                            )}
                          </span>
                          {ing.costo != null && (
                            <span className="shrink-0 whitespace-nowrap text-[13px] tabular-nums text-slate-400">
                              {fmtPesos(ing.costo)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {r.dispositivos.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="mb-3 text-lg font-bold">Dispositivos</h2>
                <ul className="space-y-2.5">
                  {r.dispositivos.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 text-[15px]">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-lg">{d.emoji}</span>
                      {d.nombre}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="space-y-5">
            {r.pasos.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="mb-3 text-lg font-bold">Preparación</h2>
                {grupos.pasos.map((g, gi) => (
                  <div key={gi}>
                    {g.seccion && (
                      <p className={cn('mb-2 text-sm font-semibold text-slate-400', gi > 0 && 'mt-4')}>{g.seccion}</p>
                    )}
                    <ol className="space-y-3">
                      {g.items.map((paso) => {
                        const idx = indicePaso++
                        const hecho = hechos.has(idx)
                        return (
                          <li
                            key={paso.id ?? idx}
                            onClick={() =>
                              setHechos((prev) => {
                                const n = new Set(prev)
                                n.has(idx) ? n.delete(idx) : n.add(idx)
                                return n
                              })
                            }
                            className="flex cursor-pointer gap-3"
                          >
                            <span
                              className={cn(
                                'grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold',
                                hecho ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'
                              )}
                            >
                              {hecho ? '✓' : idx + 1}
                            </span>
                            <p className={cn('pt-0.5 text-[15px] leading-relaxed', hecho ? 'text-slate-400 line-through' : 'text-slate-700')}>
                              {paso.texto}
                            </p>
                          </li>
                        )
                      })}
                    </ol>
                  </div>
                ))}
              </div>
            )}

            {r.sugerencias.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="mb-3 text-lg font-bold">Sugerencias</h2>
                <ul className="space-y-2">
                  {r.sugerencias.map((s) => (
                    <li key={s.id} className="flex gap-2.5 text-[15px] text-slate-700">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                      <span>{s.texto}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold">Mis notas</h2>
                {!editandoNota && (
                  <button
                    onClick={() => {
                      setBorradorNota(r.nota ?? '')
                      setEditandoNota(true)
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {r.nota ? 'Editar' : 'Añadir nota'}
                  </button>
                )}
              </div>
              {editandoNota ? (
                <>
                  <textarea
                    autoFocus
                    rows={4}
                    value={borradorNota}
                    onChange={(e) => setBorradorNota(e.target.value)}
                    placeholder="Tus trucos, variaciones o recordatorios."
                    className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-[15px] outline-none focus:border-emerald-500"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      onClick={() => setEditandoNota(false)}
                      className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                    <Button size="sm" onClick={() => guardarNota.mutate(borradorNota)} disabled={guardarNota.isPending}>
                      Guardar
                    </Button>
                  </div>
                </>
              ) : r.nota ? (
                <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-slate-700">{r.nota}</p>
              ) : (
                <p className="mt-1 text-sm text-slate-400">
                  Esta nota solo la ves vos. No la ve el resto del equipo ni aparece en la receta publicada.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

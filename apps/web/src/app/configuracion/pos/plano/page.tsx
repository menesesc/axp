'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LIENZO, PlanoSalon, TIPOS_ELEMENTO, type ElementoPlano } from '@/components/pos/plano-salon'
import type { MesaEstado } from '@/components/pos/mapa-mesas'
import { useUser } from '@/hooks/use-user'
import { SECCION } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { ArrowLeft, LayoutGrid, Loader2, Plus, RotateCw, Trash2 } from 'lucide-react'

/**
 * El diseñador del plano.
 *
 * Se dibuja una vez, cuando se arma el salón, y después casi no se toca. Por
 * eso vive en Configuración y no en la pantalla de venta: lo último que se
 * quiere es que alguien mueva una mesa de lugar con el salón lleno.
 *
 * Arrastrar y soltar, con la grilla de 25 para que nada quede torcido por un
 * píxel. Cada cambio se guarda solo: no hay botón de guardar que alguien se
 * pueda olvidar de apretar.
 */

const PASO = 25
const redondear = (n: number) => Math.round(n / PASO) * PASO

type Pieza = { id: string; tipo: 'mesa' | 'elemento' }

export default function PlanoPage() {
  const { canEdit, isLoading } = useUser()
  const puedeEditar = canEdit(SECCION.POS)

  const [sucursalId, setSucursalId] = useState('')
  const [sectorId, setSectorId] = useState<string | null>(null)
  const [sel, setSel] = useState<Pieza | null>(null)
  const [guardando, setGuardando] = useState(false)
  const svgRef = useRef<HTMLDivElement>(null)

  const estructura = useQuery({
    queryKey: ['pos-estructura'],
    queryFn: async () => {
      const r = await fetch('/api/pos/estructura')
      if (!r.ok) throw new Error('No se pudo cargar')
      return r.json() as Promise<{ sucursales: Array<{ id: string; nombre: string }> }>
    },
  })

  const sucursal = sucursalId || estructura.data?.sucursales[0]?.id || ''

  const salon = useQuery({
    queryKey: ['pos-salon', sucursal],
    enabled: !!sucursal,
    queryFn: async () => {
      const r = await fetch(`/api/pos/salon?sucursalId=${sucursal}`)
      if (!r.ok) throw new Error('No se pudo cargar el salón')
      return r.json() as Promise<{
        sectores: Array<{ id: string; nombre: string; mesas: number }>
        mesas: MesaEstado[]
        elementos: ElementoPlano[]
      }>
    },
  })

  const sector = sectorId ?? salon.data?.sectores[0]?.id ?? null

  const mesas = useMemo(
    () => (salon.data?.mesas ?? []).filter((m) => m.sectorId === sector),
    [salon.data, sector]
  )
  const elementos = useMemo(
    () => (salon.data?.elementos ?? []).filter((e) => e.sectorId === sector),
    [salon.data, sector]
  )

  const sinUbicar = mesas.filter((m) => m.x == null)

  const guardarMesa = useCallback(async (cambios: Record<string, unknown>) => {
    setGuardando(true)
    try {
      const r = await fetch('/api/pos/salon', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cambios),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo guardar')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
      salon.refetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const guardarElemento = useCallback(async (cambios: Record<string, unknown>) => {
    setGuardando(true)
    try {
      const r = await fetch('/api/pos/salon/elementos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cambios),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo guardar')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
      salon.refetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Arrastre.
   *
   * La posición se pinta en el acto moviendo el nodo con un transform, y
   * recién al soltar se guarda: con el plano entero en estado de React, cada
   * movimiento del dedo redibujaba cincuenta mesas.
   */
  const arrastrar = (id: string, tipo: 'mesa' | 'elemento', ev: React.PointerEvent<SVGGElement>) => {
    if (!puedeEditar) return
    ev.preventDefault()
    setSel({ id, tipo })

    const g = ev.currentTarget
    const svg = g.ownerSVGElement
    if (!svg) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return

    const pieza = tipo === 'mesa' ? mesas.find((m) => m.id === id) : elementos.find((e) => e.id === id)
    if (!pieza) return
    const rot = pieza.rotacion
    const x0 = (pieza as { x: number | null }).x ?? 0
    const y0 = (pieza as { y: number | null }).y ?? 0
    const px = ev.clientX
    const py = ev.clientY
    let destino = { x: x0, y: y0 }

    const mover = (e: PointerEvent) => {
      const dx = (e.clientX - px) / ctm.a
      const dy = (e.clientY - py) / ctm.d
      destino = {
        x: Math.min(LIENZO.ancho, Math.max(0, redondear(x0 + dx))),
        y: Math.min(LIENZO.alto, Math.max(0, redondear(y0 + dy))),
      }
      g.setAttribute('transform', `translate(${destino.x} ${destino.y}) rotate(${rot})`)
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      if (destino.x === x0 && destino.y === y0) return
      if (tipo === 'mesa') void guardarMesa({ id, ...destino })
      else void guardarElemento({ id, ...destino })
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  /** Acomoda en filas las que nunca se ubicaron, para arrancar de algo. */
  const acomodar = async () => {
    const porFila = Math.floor((LIENZO.ancho - 100) / 110)
    const cambios = sinUbicar.map((m, i) => ({
      id: m.id,
      x: 80 + (i % porFila) * 110,
      y: 90 + Math.floor(i / porFila) * 120,
    }))
    if (cambios.length === 0) return
    await guardarMesa({ mesas: cambios })
    toast.success(`${cambios.length} mesas acomodadas`)
  }

  const agregarMesa = async () => {
    if (!sector) return
    // El número que sigue al más alto que ya existe, para no pisar ninguno.
    const nums = (salon.data?.mesas ?? []).map((m) => Number(m.nombre)).filter((n) => !isNaN(n))
    const nombre = String((nums.length ? Math.max(...nums) : 0) + 1)
    setGuardando(true)
    try {
      const r = await fetch('/api/pos/salon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sucursalId: sucursal, sectorId: sector, nombre, capacidad: 4, x: 120, y: 120 }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo crear')
      setSel({ id: j.id, tipo: 'mesa' })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
      salon.refetch()
    }
  }

  const agregarElemento = async (tipo: string) => {
    if (!sector) return
    setGuardando(true)
    try {
      const r = await fetch('/api/pos/salon/elementos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sucursalId: sucursal,
          sectorId: sector,
          tipo,
          x: 150,
          y: 150,
          ancho: tipo === 'barra' || tipo === 'pared' ? 240 : tipo === 'columna' ? 40 : 110,
          alto: tipo === 'pared' ? 16 : tipo === 'columna' ? 40 : 60,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo agregar')
      setSel({ id: j.id, tipo: 'elemento' })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
      salon.refetch()
    }
  }

  const borrar = async () => {
    if (!sel) return
    const url =
      sel.tipo === 'mesa' ? `/api/pos/salon?id=${sel.id}` : `/api/pos/salon/elementos?id=${sel.id}`
    const r = await fetch(url, { method: 'DELETE' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      toast.error(j.error || 'No se pudo sacar')
      return
    }
    setSel(null)
    salon.refetch()
  }

  if (isLoading) return null

  const mesaSel = sel?.tipo === 'mesa' ? mesas.find((m) => m.id === sel.id) : undefined
  const elemSel = sel?.tipo === 'elemento' ? elementos.find((e) => e.id === sel.id) : undefined

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <Link href="/configuracion/pos" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            Punto de venta
          </Link>
          <Header title="Plano del salón" description="Cómo está puesto el salón de verdad: mesas, barra, baños, entrada" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(estructura.data?.sucursales.length ?? 0) > 1 && (
            <select
              value={sucursal}
              onChange={(e) => { setSucursalId(e.target.value); setSectorId(null); setSel(null) }}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              {estructura.data!.sucursales.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          )}
          {(salon.data?.sectores ?? []).map((s) => (
            <button
              key={s.id}
              onClick={() => { setSectorId(s.id); setSel(null) }}
              className={cn(
                'h-10 rounded-lg px-3 text-sm font-semibold',
                s.id === sector ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
              )}
            >
              {s.nombre} <span className="font-normal opacity-60">{s.mesas}</span>
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-400">
            {guardando ? 'Guardando…' : 'Se guarda solo'}
          </span>
        </div>

        {puedeEditar && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2">
            <Button size="sm" onClick={agregarMesa} className="gap-1.5">
              <Plus className="h-4 w-4" /> Mesa
            </Button>
            {sinUbicar.length > 0 && (
              <Button size="sm" variant="outline" onClick={acomodar} className="gap-1.5">
                <LayoutGrid className="h-4 w-4" /> Acomodar {sinUbicar.length} sin ubicar
              </Button>
            )}
            <span className="mx-1 h-6 w-px bg-slate-200" />
            {TIPOS_ELEMENTO.map((t) => (
              <button
                key={t.tipo}
                onClick={() => agregarElemento(t.tipo)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-2.5 text-sm text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                <span>{t.icono}</span> {t.nombre}
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_17rem]">
          <div ref={svgRef} className="aspect-[10/7] overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {salon.isLoading ? (
              <div className="grid h-full place-items-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
              </div>
            ) : (
              <PlanoSalon
                mesas={mesas.filter((m) => m.x != null)}
                elementos={elementos}
                seleccion={sel?.id ?? null}
                edicion
                onArrastrar={arrastrar}
                onFondo={() => setSel(null)}
              />
            )}
          </div>

          <aside className="space-y-3">
            {!sel && (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                Tocá una mesa o un elemento para cambiarle el número, la forma, el tamaño o cuánta gente entra.
                Arrastrá para moverlo.
              </p>
            )}

            {mesaSel && (
              <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-semibold">Mesa</p>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Número o nombre</span>
                  <Input
                    key={`n-${mesaSel.id}`}
                    defaultValue={mesaSel.nombre}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v && v !== mesaSel.nombre) void guardarMesa({ id: mesaSel.id, nombre: v })
                    }}
                  />
                </label>

                <div>
                  <span className="mb-1 block text-xs text-slate-500">Cubiertos</span>
                  <div className="flex flex-wrap gap-1">
                    {[2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                      <button
                        key={n}
                        onClick={() => void guardarMesa({ id: mesaSel.id, capacidad: n })}
                        className={cn(
                          'h-9 w-9 rounded-lg text-sm font-semibold',
                          mesaSel.capacidad === n ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="mb-1 block text-xs text-slate-500">Forma</span>
                  <div className="flex gap-1">
                    {([
                      ['rect', 'Rectangular'],
                      ['cuadrada', 'Cuadrada'],
                      ['redonda', 'Redonda'],
                    ] as const).map(([f, label]) => (
                      <button
                        key={f}
                        onClick={() =>
                          void guardarMesa({
                            id: mesaSel.id,
                            forma: f,
                            // Una cuadrada con lados distintos no es cuadrada.
                            ...(f === 'cuadrada' ? { alto: mesaSel.ancho } : {}),
                          })
                        }
                        className={cn(
                          'h-9 flex-1 rounded-lg text-xs font-semibold',
                          mesaSel.forma === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="mb-1 block text-xs text-slate-500">Cabeceras</span>
                  <div className="flex gap-1">
                    {[0, 1, 2].map((n) => (
                      <button
                        key={n}
                        onClick={() => void guardarMesa({ id: mesaSel.id, cabeceras: n })}
                        className={cn(
                          'h-9 flex-1 rounded-lg text-xs font-semibold',
                          mesaSel.cabeceras === n ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                        )}
                      >
                        {n === 0 ? 'Sin' : n === 1 ? 'Una' : 'Dos'}
                      </button>
                    ))}
                  </div>
                </div>

                <Tamano
                  ancho={mesaSel.ancho}
                  alto={mesaSel.alto}
                  onCambiar={(ancho, alto) => void guardarMesa({ id: mesaSel.id, ancho, alto })}
                />

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={() => void guardarMesa({ id: mesaSel.id, rotacion: (mesaSel.rotacion + 45) % 360 })}
                  >
                    <RotateCw className="h-4 w-4" /> Girar
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={borrar}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {elemSel && (
              <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-semibold">
                  {TIPOS_ELEMENTO.find((t) => t.tipo === elemSel.tipo)?.nombre ?? 'Elemento'}
                </p>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Etiqueta</span>
                  <Input
                    key={`e-${elemSel.id}`}
                    defaultValue={elemSel.etiqueta ?? ''}
                    placeholder="Lo que dice en el plano"
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v !== (elemSel.etiqueta ?? '')) void guardarElemento({ id: elemSel.id, etiqueta: v })
                    }}
                  />
                </label>

                <Tamano
                  ancho={elemSel.ancho}
                  alto={elemSel.alto}
                  onCambiar={(ancho, alto) => void guardarElemento({ id: elemSel.id, ancho, alto })}
                />

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={() => void guardarElemento({ id: elemSel.id, rotacion: (elemSel.rotacion + 45) % 360 })}
                  >
                    <RotateCw className="h-4 w-4" /> Girar
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={borrar}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </DashboardLayout>
  )
}

/** Ancho y alto por pasos: nadie quiere tipear píxeles. */
function Tamano({
  ancho,
  alto,
  onCambiar,
}: {
  ancho: number
  alto: number
  onCambiar: (ancho: number, alto: number) => void
}) {
  const paso = (campo: 'ancho' | 'alto', delta: number) => {
    const a = campo === 'ancho' ? Math.max(25, ancho + delta) : ancho
    const b = campo === 'alto' ? Math.max(25, alto + delta) : alto
    onCambiar(a, b)
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {(['ancho', 'alto'] as const).map((campo) => (
        <div key={campo}>
          <span className="mb-1 block text-xs capitalize text-slate-500">{campo}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => paso(campo, -25)}
              className="h-9 w-9 rounded-lg bg-slate-100 text-lg font-bold text-slate-600"
            >
              −
            </button>
            <span className="flex-1 text-center text-sm tabular-nums">{campo === 'ancho' ? ancho : alto}</span>
            <button
              onClick={() => paso(campo, 25)}
              className="h-9 w-9 rounded-lg bg-slate-100 text-lg font-bold text-slate-600"
            >
              +
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

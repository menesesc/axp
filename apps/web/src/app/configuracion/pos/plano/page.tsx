'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LIENZO, PlanoSalon, TIPOS_ELEMENTO, lienzoDe, type ElementoPlano } from '@/components/pos/plano-salon'
import type { MesaEstado } from '@/components/pos/mapa-mesas'
import { useUser } from '@/hooks/use-user'
import { SECCION } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { ArrowLeft, LayoutGrid, Loader2, Maximize2, Plus, RotateCw, Save, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'

/**
 * El diseñador del plano.
 *
 * Se dibuja una vez, cuando se arma el salón, y después casi no se toca. Por
 * eso vive en Configuración y no en la pantalla de venta: lo último que se
 * quiere es que alguien mueva una mesa de lugar con el salón lleno.
 *
 * Arrastrar y soltar, con la grilla de 25 para que nada quede torcido por un
 * píxel. Se diseña sobre un borrador que se ve al instante y se guarda todo
 * junto con un botón; si quedan cambios sin guardar, avisa antes de salir.
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
        sectores: Array<{ id: string; nombre: string; mesas: number; planoZoom: number }>
        mesas: MesaEstado[]
        elementos: ElementoPlano[]
      }>
    },
  })

  /*
   * Borrador del plano.
   *
   * Todo lo que se toca (mover, girar, tamaño, cubiertos, zoom) cambia acá, en
   * el momento y sin ir al servidor; "Guardar" manda todo junto. Antes cada
   * toque guardaba y recargaba el salón entero, y diseñar era lento.
   * Agregar o sacar una pieza sí va al servidor en el acto (necesita su id),
   * pero sin pisar lo que se estaba editando.
   */
  const [mesasB, setMesasB] = useState<Record<string, MesaEstado>>({})
  const [elemsB, setElemsB] = useState<Record<string, ElementoPlano>>({})
  const [zoomB, setZoomB] = useState<Record<string, number>>({})
  const [tocados, setTocados] = useState<Set<string>>(new Set())

  // Sincroniza el borrador con lo guardado, sin pisar lo que se editó.
  useEffect(() => {
    const d = salon.data
    if (!d) return
    setMesasB((prev) => {
      const out: Record<string, MesaEstado> = {}
      for (const m of d.mesas) out[m.id] = tocados.has(m.id) && prev[m.id] ? prev[m.id]! : m
      return out
    })
    setElemsB((prev) => {
      const out: Record<string, ElementoPlano> = {}
      for (const e of d.elementos) out[e.id] = tocados.has(e.id) && prev[e.id] ? prev[e.id]! : e
      return out
    })
    setZoomB((prev) => {
      const out: Record<string, number> = {}
      for (const se of d.sectores) out[se.id] = tocados.has(`z-${se.id}`) && prev[se.id] != null ? prev[se.id]! : se.planoZoom ?? 1
      return out
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salon.data])

  const tocar = (id: string) => setTocados((t) => (t.has(id) ? t : new Set(t).add(id)))
  const editarMesa = (id: string, c: Partial<MesaEstado>) => {
    setMesasB((b) => (b[id] ? { ...b, [id]: { ...b[id]!, ...c } } : b))
    tocar(id)
  }
  const editarElem = (id: string, c: Partial<ElementoPlano>) => {
    setElemsB((b) => (b[id] ? { ...b, [id]: { ...b[id]!, ...c } } : b))
    tocar(id)
  }

  const sector = sectorId ?? salon.data?.sectores[0]?.id ?? null
  const zoom = (sector && zoomB[sector]) || 1
  const lienzo = lienzoDe(zoom)
  const setZoom = (z: number) => {
    if (!sector) return
    setZoomB((b) => ({ ...b, [sector]: Math.min(1.5, Math.max(0.3, Math.round(z * 20) / 20)) }))
    tocar(`z-${sector}`)
  }

  const mesas = useMemo(() => Object.values(mesasB).filter((m) => m.sectorId === sector), [mesasB, sector])
  const elementos = useMemo(() => Object.values(elemsB).filter((e) => e.sectorId === sector), [elemsB, sector])
  const sinUbicar = mesas.filter((m) => m.x == null)

  // Qué cambió respecto de lo guardado, campo por campo.
  const pendientes = useMemo(() => {
    const d = salon.data
    if (!d) return { mesas: [], elementos: [], zooms: [] as Array<{ id: string; planoZoom: number }> }
    const CAMPOS_MESA = ['nombre', 'capacidad', 'x', 'y', 'forma', 'ancho', 'alto', 'rotacion', 'cabeceras'] as const
    const CAMPOS_ELEM = ['etiqueta', 'x', 'y', 'ancho', 'alto', 'rotacion'] as const
    const mesas = d.mesas.flatMap((o) => {
      const b = mesasB[o.id]
      if (!b || !tocados.has(o.id)) return []
      const c: Record<string, unknown> = {}
      for (const k of CAMPOS_MESA) if (b[k] !== o[k]) c[k] = b[k]
      return Object.keys(c).length ? [{ id: o.id, ...c }] : []
    })
    const elementos = d.elementos.flatMap((o) => {
      const b = elemsB[o.id]
      if (!b || !tocados.has(o.id)) return []
      const c: Record<string, unknown> = {}
      for (const k of CAMPOS_ELEM) if (b[k] !== o[k]) c[k] = b[k]
      return Object.keys(c).length ? [{ id: o.id, ...c }] : []
    })
    const zooms = d.sectores.filter((se) => zoomB[se.id] != null && zoomB[se.id] !== (se.planoZoom ?? 1)).map((se) => ({ id: se.id, planoZoom: zoomB[se.id]! }))
    return { mesas, elementos, zooms }
  }, [salon.data, mesasB, elemsB, zoomB, tocados])
  const nCambios = pendientes.mesas.length + pendientes.elementos.length + pendientes.zooms.length

  // Que no se pierda un plano a medio diseñar por cerrar la pestaña.
  useEffect(() => {
    if (nCambios === 0) return
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [nCambios])

  const enviar = async (url: string, body: unknown) => {
    const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'No se pudo guardar')
  }

  const guardar = async () => {
    if (nCambios === 0 || guardando) return
    setGuardando(true)
    try {
      await Promise.all([
        pendientes.mesas.length ? enviar('/api/pos/salon', { mesas: pendientes.mesas }) : null,
        pendientes.elementos.length ? enviar('/api/pos/salon/elementos', { elementos: pendientes.elementos }) : null,
        ...pendientes.zooms.map((z) => enviar('/api/pos/salon/sector', z)),
      ])
      setTocados(new Set())
      await salon.refetch()
      toast.success('Plano guardado')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  const descartar = () => {
    setTocados(new Set())
    setSel(null)
    const d = salon.data
    if (!d) return
    setMesasB(Object.fromEntries(d.mesas.map((m) => [m.id, m])))
    setElemsB(Object.fromEntries(d.elementos.map((e) => [e.id, e])))
    setZoomB(Object.fromEntries(d.sectores.map((se) => [se.id, se.planoZoom ?? 1])))
  }

  // Ctrl/⌘ + S guarda.
  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void guardar()
      }
    }
    window.addEventListener('keydown', atajo)
    return () => window.removeEventListener('keydown', atajo)
  })

  /**
   * Arrastre.
   *
   * La posición se pinta en el acto moviendo el nodo con un transform, y al
   * soltar pasa al borrador: con el plano entero en estado de React, cada
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

    const pieza = tipo === 'mesa' ? mesasB[id] : elemsB[id]
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
        x: Math.min(lienzo.ancho, Math.max(0, redondear(x0 + dx))),
        y: Math.min(lienzo.alto, Math.max(0, redondear(y0 + dy))),
      }
      g.setAttribute('transform', `translate(${destino.x} ${destino.y}) rotate(${rot})`)
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      if (destino.x === x0 && destino.y === y0) return
      if (tipo === 'mesa') editarMesa(id, destino)
      else editarElem(id, destino)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  /** Acomoda en filas las que nunca se ubicaron, para arrancar de algo. */
  const acomodar = () => {
    const porFila = Math.max(1, Math.floor((lienzo.ancho - 100) / 110))
    sinUbicar.forEach((m, i) => editarMesa(m.id, { x: 80 + (i % porFila) * 110, y: 90 + Math.floor(i / porFila) * 120 }))
    if (sinUbicar.length) toast.success(`${sinUbicar.length} mesas acomodadas. Guardá para que quede.`)
  }

  /** Zoom justo para que entre todo lo que hay en el sector, con un margen. */
  const encajar = () => {
    const piezas = [
      ...mesas.filter((m) => m.x != null).map((m) => ({ x: m.x!, y: m.y!, a: m.ancho, h: m.alto })),
      ...elementos.map((e) => ({ x: e.x, y: e.y, a: e.ancho, h: e.alto })),
    ]
    if (piezas.length === 0) return setZoom(1)
    const maxX = Math.max(...piezas.map((p) => p.x + p.a / 2 + 30)) + 40
    const maxY = Math.max(...piezas.map((p) => p.y + p.h / 2 + 30)) + 40
    setZoom(Math.floor(Math.min(LIENZO.ancho / maxX, LIENZO.alto / maxY, 1.5) * 20) / 20)
  }

  const agregarMesa = async () => {
    if (!sector) return
    // El número que sigue al más alto que ya existe, para no pisar ninguno.
    const nums = Object.values(mesasB).map((m) => Number(m.nombre)).filter((n) => !isNaN(n))
    const nombre = String((nums.length ? Math.max(...nums) : 0) + 1)
    try {
      const r = await fetch('/api/pos/salon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sucursalId: sucursal, sectorId: sector, nombre, capacidad: 4, x: 120, y: 120 }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo crear')
      await salon.refetch()
      setSel({ id: j.id, tipo: 'mesa' })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const agregarElemento = async (tipo: string) => {
    if (!sector) return
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
      await salon.refetch()
      setSel({ id: j.id, tipo: 'elemento' })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const borrar = async () => {
    if (!sel) return
    const url = sel.tipo === 'mesa' ? `/api/pos/salon?id=${sel.id}` : `/api/pos/salon/elementos?id=${sel.id}`
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

  const mesaSel = sel?.tipo === 'mesa' ? mesasB[sel.id] : undefined
  const elemSel = sel?.tipo === 'elemento' ? elemsB[sel.id] : undefined

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <Link href="/configuracion/pos" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            Punto de venta
          </Link>
          <Header
            title="Plano del salón"
            description="Cómo está puesto el salón de verdad: mesas, barra, baños, entrada."
            actions={
              puedeEditar ? (
                <>
                  <Button onClick={guardar} disabled={nCambios === 0 || guardando}>
                    {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {guardando ? 'Guardando…' : nCambios ? `Guardar ${nCambios} ${nCambios === 1 ? 'cambio' : 'cambios'}` : 'Guardado'}
                  </Button>
                  {nCambios > 0 && !guardando && (
                    <Button variant="ghost" onClick={descartar}>
                      <Undo2 className="h-4 w-4" /> Descartar
                    </Button>
                  )}
                </>
              ) : undefined
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(estructura.data?.sucursales.length ?? 0) > 1 && (
            <select
              value={sucursal}
              onChange={(e) => {
                if (nCambios && !confirm('Hay cambios sin guardar en este plano. ¿Cambiar de sucursal igual?')) return
                setSucursalId(e.target.value)
                setSectorId(null)
                setSel(null)
                setTocados(new Set())
              }}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              {estructura.data!.sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          )}
          {(salon.data?.sectores ?? []).map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSectorId(s.id)
                setSel(null)
              }}
              className={cn(
                'h-10 rounded-lg px-3 text-sm font-semibold',
                s.id === sector ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
              )}
            >
              {s.nombre} <span className="font-normal opacity-60">{s.mesas}</span>
            </button>
          ))}

          {/* Zoom del plano de este sector: se guarda con el plano y así lo ven la caja y el mozo. */}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-500">Zoom del plano</span>
            <div className="flex items-center rounded-xl border border-slate-900/[0.12] bg-white">
              <button type="button" onClick={() => setZoom(zoom - 0.1)} disabled={!puedeEditar || zoom <= 0.3} className="grid h-9 w-9 place-items-center text-slate-500 hover:text-slate-900 disabled:opacity-30" aria-label="Alejar">
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="w-12 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom(zoom + 0.1)} disabled={!puedeEditar || zoom >= 1.5} className="grid h-9 w-9 place-items-center text-slate-500 hover:text-slate-900 disabled:opacity-30" aria-label="Acercar">
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
            {puedeEditar && (
              <Button variant="outline" size="sm" onClick={encajar} title="Elige el zoom para que entre todo el salón">
                <Maximize2 className="h-4 w-4" /> Que entre todo
              </Button>
            )}
          </div>
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
          <div className="aspect-[10/7] overflow-hidden rounded-2xl border border-slate-200 bg-white">
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
                zoom={zoom}
                onArrastrar={arrastrar}
                onFondo={() => setSel(null)}
              />
            )}
          </div>

          <aside className="space-y-3">
            {!sel && (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                Tocá una mesa o un elemento para cambiarle el número, la forma, el tamaño o cuánta gente entra. Arrastrá para moverlo.
                Los cambios se ven al instante; cuando termines, tocá <b>Guardar</b> (o Ctrl+S).
              </p>
            )}

            {mesaSel && (
              <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-semibold">Mesa</p>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Número o nombre</span>
                  <Input
                    value={mesaSel.nombre}
                    onChange={(e) => editarMesa(mesaSel.id, { nombre: e.target.value.slice(0, 30) })}
                  />
                </label>

                <div>
                  <span className="mb-1 block text-xs text-slate-500">Cubiertos</span>
                  <div className="flex flex-wrap gap-1">
                    {[2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                      <button
                        key={n}
                        onClick={() => editarMesa(mesaSel.id, { capacidad: n })}
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
                          editarMesa(mesaSel.id, {
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
                        onClick={() => editarMesa(mesaSel.id, { cabeceras: n })}
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

                <Tamano ancho={mesaSel.ancho} alto={mesaSel.alto} onCambiar={(ancho, alto) => editarMesa(mesaSel.id, { ancho, alto })} />

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={() => editarMesa(mesaSel.id, { rotacion: (mesaSel.rotacion + 45) % 360 })}
                  >
                    <RotateCw className="h-4 w-4" /> Girar
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={borrar} aria-label="Sacar mesa">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {elemSel && (
              <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-semibold">{TIPOS_ELEMENTO.find((t) => t.tipo === elemSel.tipo)?.nombre ?? 'Elemento'}</p>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Etiqueta</span>
                  <Input
                    value={elemSel.etiqueta ?? ''}
                    placeholder="Lo que dice en el plano"
                    onChange={(e) => editarElem(elemSel.id, { etiqueta: e.target.value.slice(0, 40) })}
                  />
                </label>

                <Tamano ancho={elemSel.ancho} alto={elemSel.alto} onCambiar={(ancho, alto) => editarElem(elemSel.id, { ancho, alto })} />

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={() => editarElem(elemSel.id, { rotacion: (elemSel.rotacion + 45) % 360 })}
                  >
                    <RotateCw className="h-4 w-4" /> Girar
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={borrar} aria-label="Sacar elemento">
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

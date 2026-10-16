'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { ArrowLeft, Copy, LayoutGrid, Loader2, Maximize2, Plus, RotateCw, Save, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'

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
  // Selección: una o varias piezas (clic, Shift/⌘+clic o arrastrando sobre el fondo).
  const [sel, setSel] = useState<Pieza[]>([])
  const portapapeles = useRef<{ mesas: MesaEstado[]; elementos: ElementoPlano[] }>({ mesas: [], elementos: [] })
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
    setSel([])
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

    // Shift o ⌘/Ctrl + clic suma o saca la pieza de la selección, sin mover.
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
      setSel((s) => (s.some((p) => p.id === id) ? s.filter((p) => p.id !== id) : [...s, { id, tipo }]))
      return
    }
    // Arrastrar una pieza seleccionada mueve toda la selección; si no lo
    // estaba, pasa a ser la única seleccionada.
    const grupo = sel.some((p) => p.id === id) ? sel : [{ id, tipo }]
    if (grupo !== sel) setSel(grupo)

    const svg = ev.currentTarget.ownerSVGElement
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return

    const piezas = grupo.flatMap((p) => {
      const d = p.tipo === 'mesa' ? mesasB[p.id] : elemsB[p.id]
      const g = svg.querySelector<SVGGElement>(`[data-pieza="${p.id}"]`)
      if (!d || !g) return []
      return [{ ...p, g, x0: (d as { x: number | null }).x ?? 0, y0: (d as { y: number | null }).y ?? 0, rot: d.rotacion }]
    })
    const px = ev.clientX
    const py = ev.clientY
    let dx = 0
    let dy = 0

    const mover = (e: PointerEvent) => {
      dx = redondear((e.clientX - px) / ctm.a)
      dy = redondear((e.clientY - py) / ctm.d)
      for (const p of piezas) {
        const x = Math.min(lienzo.ancho, Math.max(0, p.x0 + dx))
        const y = Math.min(lienzo.alto, Math.max(0, p.y0 + dy))
        p.g.setAttribute('transform', `translate(${x} ${y}) rotate(${p.rot})`)
      }
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      if (dx === 0 && dy === 0) return
      moverPiezas(piezas.map((p) => ({ ...p, x: Math.min(lienzo.ancho, Math.max(0, p.x0 + dx)), y: Math.min(lienzo.alto, Math.max(0, p.y0 + dy)) })))
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  /** Pasa al borrador la nueva posición de varias piezas de una vez. */
  const moverPiezas = (lista: Array<{ id: string; tipo: 'mesa' | 'elemento'; x: number; y: number }>) => {
    const mesasM = lista.filter((p) => p.tipo === 'mesa')
    const elemsM = lista.filter((p) => p.tipo === 'elemento')
    if (mesasM.length) setMesasB((b) => {
      const out = { ...b }
      for (const p of mesasM) if (out[p.id]) out[p.id] = { ...out[p.id]!, x: p.x, y: p.y }
      return out
    })
    if (elemsM.length) setElemsB((b) => {
      const out = { ...b }
      for (const p of elemsM) if (out[p.id]) out[p.id] = { ...out[p.id]!, x: p.x, y: p.y }
      return out
    })
    setTocados((t) => {
      const n = new Set(t)
      for (const p of lista) n.add(p.id)
      return n
    })
  }

  /** Selección por área: arrastrar sobre el fondo dibuja un rectángulo. */
  const iniciarMarco = (ev: React.PointerEvent<SVGSVGElement>) => {
    const sumar = ev.shiftKey || ev.metaKey || ev.ctrlKey
    if (!sumar) setSel([])
    if (!puedeEditar) return
    const svg = ev.currentTarget
    const ctm = svg.getScreenCTM()
    const marco = svg.querySelector<SVGRectElement>('[data-marco]')
    if (!ctm || !marco) return
    const aLienzo = (cx: number, cy: number) => ({ x: (cx - ctm.e) / ctm.a, y: (cy - ctm.f) / ctm.d })
    const inicio = aLienzo(ev.clientX, ev.clientY)
    let area = { x: inicio.x, y: inicio.y, w: 0, h: 0 }

    const mover = (e: PointerEvent) => {
      const p = aLienzo(e.clientX, e.clientY)
      area = { x: Math.min(inicio.x, p.x), y: Math.min(inicio.y, p.y), w: Math.abs(p.x - inicio.x), h: Math.abs(p.y - inicio.y) }
      marco.setAttribute('display', 'inline')
      marco.setAttribute('x', String(area.x))
      marco.setAttribute('y', String(area.y))
      marco.setAttribute('width', String(area.w))
      marco.setAttribute('height', String(area.h))
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      marco.setAttribute('display', 'none')
      if (area.w < 4 && area.h < 4) return
      // Entra lo que toca el rectángulo, aunque sea en parte.
      const toca = (x: number, y: number, a: number, h: number) =>
        x + a / 2 >= area.x && x - a / 2 <= area.x + area.w && y + h / 2 >= area.y && y - h / 2 <= area.y + area.h
      const dentro: Pieza[] = [
        ...mesas.filter((m) => m.x != null && toca(m.x, m.y!, m.ancho, m.alto)).map((m) => ({ id: m.id, tipo: 'mesa' as const })),
        ...elementos.filter((e) => toca(e.x, e.y, e.ancho, e.alto)).map((e) => ({ id: e.id, tipo: 'elemento' as const })),
      ]
      setSel((s) => (sumar ? [...s, ...dentro.filter((d) => !s.some((p) => p.id === d.id))] : dentro))
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  /** Copia lo seleccionado (con su forma, tamaño, giro y cubiertos). */
  const copiar = () => {
    portapapeles.current = {
      mesas: sel.filter((p) => p.tipo === 'mesa').map((p) => mesasB[p.id]!).filter(Boolean),
      elementos: sel.filter((p) => p.tipo === 'elemento').map((p) => elemsB[p.id]!).filter(Boolean),
    }
    const n = portapapeles.current.mesas.length + portapapeles.current.elementos.length
    if (n) toast.success(`${n} ${n === 1 ? 'pieza copiada' : 'piezas copiadas'}`)
  }

  /**
   * Pega lo copiado justo al lado (corrido hacia la derecha), en el sector que
   * se está viendo. Las mesas toman los números que siguen al más alto.
   */
  const pegar = async () => {
    const { mesas: ms, elementos: es } = portapapeles.current
    if (!sector || ms.length + es.length === 0) return
    const piezas = [...ms, ...es]
    const ancho = Math.max(...piezas.map((p) => (p.x ?? 0) + p.ancho / 2)) - Math.min(...piezas.map((p) => (p.x ?? 0) - p.ancho / 2))
    let desplazar = redondear(Math.max(50, ancho + 25))
    // Si se va del lienzo hacia la derecha, se pega abajo.
    const bajar = Math.max(...piezas.map((p) => (p.x ?? 0))) + desplazar > lienzo.ancho
    const off = bajar ? { x: 0, y: redondear(Math.max(...piezas.map((p) => p.alto)) + 50) } : { x: desplazar, y: 0 }
    if (bajar) desplazar = 0

    let num = Math.max(0, ...Object.values(mesasB).map((m) => Number(m.nombre)).filter((n) => !isNaN(n)))
    const nuevos: Pieza[] = []
    try {
      for (const m of [...ms].sort((a, b) => Number(a.nombre) - Number(b.nombre))) {
        num += 1
        const r = await fetch('/api/pos/salon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sucursalId: sucursal,
            sectorId: sector,
            nombre: String(num),
            capacidad: m.capacidad,
            forma: m.forma,
            ancho: m.ancho,
            alto: m.alto,
            rotacion: m.rotacion,
            cabeceras: m.cabeceras,
            x: Math.min(lienzo.ancho, Math.max(0, (m.x ?? 120) + off.x)),
            y: Math.min(lienzo.alto, Math.max(0, (m.y ?? 120) + off.y)),
          }),
        })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'No se pudo pegar')
        nuevos.push({ id: j.id, tipo: 'mesa' })
      }
      for (const e of es) {
        const r = await fetch('/api/pos/salon/elementos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sucursalId: sucursal,
            sectorId: sector,
            tipo: e.tipo,
            etiqueta: e.etiqueta,
            color: e.color,
            ancho: e.ancho,
            alto: e.alto,
            rotacion: e.rotacion,
            x: Math.min(lienzo.ancho, Math.max(0, e.x + off.x)),
            y: Math.min(lienzo.alto, Math.max(0, e.y + off.y)),
          }),
        })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'No se pudo pegar')
        nuevos.push({ id: j.id, tipo: 'elemento' })
      }
    } catch (err) {
      toast.error((err as Error).message)
    }
    await salon.refetch()
    setSel(nuevos)
    // Pegar de nuevo deja la próxima copia al lado de esta.
    portapapeles.current = {
      mesas: ms.map((m) => ({ ...m, x: (m.x ?? 0) + off.x, y: (m.y ?? 0) + off.y })),
      elementos: es.map((e) => ({ ...e, x: e.x + off.x, y: e.y + off.y })),
    }
  }

  const duplicar = async () => {
    copiar()
    await pegar()
  }

  // Atajos del diseñador. No actúan mientras se escribe en un campo.
  useEffect(() => {
    const atajos = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || !puedeEditar) return
      const cmd = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      if (cmd && k === 'c' && sel.length) {
        e.preventDefault()
        copiar()
      } else if (cmd && k === 'v') {
        e.preventDefault()
        void pegar()
      } else if (cmd && k === 'd' && sel.length) {
        e.preventDefault()
        void duplicar()
      } else if (cmd && k === 'a') {
        e.preventDefault()
        setSel([
          ...mesas.filter((m) => m.x != null).map((m) => ({ id: m.id, tipo: 'mesa' as const })),
          ...elementos.map((el) => ({ id: el.id, tipo: 'elemento' as const })),
        ])
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length) {
        e.preventDefault()
        // Con el teclado se confirma siempre: un Backspace suelto no saca una mesa.
        if (sel.length === 1 && !confirm('¿Sacar la pieza seleccionada del plano?')) return
        void borrar()
      } else if (e.key === 'Escape') {
        setSel([])
      } else if (e.key.startsWith('Arrow') && sel.length) {
        e.preventDefault()
        const paso = e.shiftKey ? PASO * 4 : PASO
        const d = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[e.key] ?? [0, 0]
        moverPiezas(
          sel.flatMap((p) => {
            const pz = p.tipo === 'mesa' ? mesasB[p.id] : elemsB[p.id]
            const x = (pz as { x: number | null } | undefined)?.x
            if (!pz || x == null) return []
            return [{ ...p, x: Math.min(lienzo.ancho, Math.max(0, x + d[0]!)), y: Math.min(lienzo.alto, Math.max(0, (pz as { y: number }).y + d[1]!)) }]
          })
        )
      }
    }
    window.addEventListener('keydown', atajos)
    return () => window.removeEventListener('keydown', atajos)
  })

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
      setSel([{ id: j.id, tipo: 'mesa' }])
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
      setSel([{ id: j.id, tipo: 'elemento' }])
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const borrar = async () => {
    if (!sel.length) return
    if (sel.length > 1 && !confirm(`¿Sacar ${sel.length} piezas del plano?`)) return
    const errores: string[] = []
    for (const p of sel) {
      const url = p.tipo === 'mesa' ? `/api/pos/salon?id=${p.id}` : `/api/pos/salon/elementos?id=${p.id}`
      const r = await fetch(url, { method: 'DELETE' })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        errores.push(j.error || 'No se pudo sacar')
      }
    }
    if (errores.length) toast.error(errores[0])
    setSel([])
    salon.refetch()
  }

  if (isLoading) return null

  const una = sel.length === 1 ? sel[0]! : null
  const mesaSel = una?.tipo === 'mesa' ? mesasB[una.id] : undefined
  const elemSel = una?.tipo === 'elemento' ? elemsB[una.id] : undefined

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
                setSel([])
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
                setSel([])
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
                seleccion={sel.map((p) => p.id)}
                edicion
                zoom={zoom}
                onArrastrar={arrastrar}
                onFondo={iniciarMarco}
              />
            )}
          </div>

          <aside className="space-y-3">
            {sel.length > 1 && (
              <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-semibold">{sel.length} piezas seleccionadas</p>
                <p className="text-xs text-slate-500">Arrastrá cualquiera para mover todas juntas, o usá las flechas del teclado.</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={duplicar}>
                    <Copy className="h-4 w-4" /> Duplicar
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={borrar} aria-label="Sacar las seleccionadas">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {sel.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                Tocá una mesa o un elemento para cambiarle el número, la forma, el tamaño o cuánta gente entra. Arrastrá para moverlo.
                Los cambios se ven al instante; cuando termines, tocá <b>Guardar</b> (o Ctrl+S).
              </p>
            )}
            {sel.length === 0 && puedeEditar && (
              <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-500">
                <p className="mb-2 text-sm font-semibold text-slate-700">Atajos</p>
                <ul className="space-y-1">
                  <li>Arrastrá sobre el fondo para seleccionar varias</li>
                  <li><b>Shift</b> o <b>⌘/Ctrl</b> + clic: sumar o sacar de la selección</li>
                  <li><b>⌘/Ctrl + C</b> y <b>⌘/Ctrl + V</b>: copiar y pegar al lado</li>
                  <li><b>⌘/Ctrl + D</b>: duplicar · <b>⌘/Ctrl + A</b>: todo</li>
                  <li><b>Flechas</b>: mover (con Shift, más) · <b>Supr</b>: sacar</li>
                </ul>
              </div>
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
                  <Button size="sm" variant="outline" onClick={duplicar} aria-label="Duplicar mesa" title="Duplicar (⌘/Ctrl + D)">
                    <Copy className="h-4 w-4" />
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
                  <Button size="sm" variant="outline" onClick={duplicar} aria-label="Duplicar elemento" title="Duplicar (⌘/Ctrl + D)">
                    <Copy className="h-4 w-4" />
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

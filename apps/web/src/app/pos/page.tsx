'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { GrillaProductos, type CategoriaPos, type ProductoPos } from '@/components/pos/grilla-productos'
import { cn } from '@/lib/utils'
import { ChefHat, Loader2, Minus, Plus, Receipt, Trash2, Users } from 'lucide-react'

/**
 * Pantalla de venta.
 *
 * Pensada para dedo: todo lo que se toca mide 64 px o más y no hay hover.
 * Ocupa la ventana entera, sin el layout de la app, porque en una tablet cada
 * píxel de menú es un píxel menos de carta.
 *
 * En restaurante lo primero son los cubiertos: el mozo los carga al sentar la
 * mesa y de ahí sale el promedio por cubierto, que es el número con el que se
 * mira el negocio. En fastfood no se pregunta.
 *
 * El pedido se arma en memoria y se guarda entero en cada cambio, con un id
 * que genera la pantalla. Eso es lo que después permite que ande sin internet:
 * el id no depende del servidor y reenviar lo mismo no duplica nada.
 */

const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
const uuid = () => crypto.randomUUID()

interface Linea {
  id: string
  productoId: string
  nombre: string
  cantidad: number
  precioUnitario: number
  alicuotaIva: number
  enviado: boolean
}

export default function PosPage() {
  const qc = useQueryClient()
  const [cajaId, setCajaId] = useState<string>('')
  const [modo, setModo] = useState<'salon' | 'rapida'>('salon')
  const [pedidoId, setPedidoId] = useState<string | null>(null)
  const [comensales, setComensales] = useState<number | null>(null)
  const [lineas, setLineas] = useState<Linea[]>([])

  const { data: cat } = useQuery({
    queryKey: ['pos-catalogo'],
    queryFn: async () => {
      const r = await fetch('/api/pos/catalogo')
      if (!r.ok) throw new Error('No se pudo cargar el catálogo')
      return r.json() as Promise<{ categorias: CategoriaPos[]; productos: ProductoPos[] }>
    },
  })

  const { data: ses } = useQuery({
    queryKey: ['pos-sesion', cajaId],
    queryFn: async () => {
      const r = await fetch(`/api/pos/sesion${cajaId ? `?cajaId=${cajaId}` : ''}`)
      if (!r.ok) throw new Error('No se pudo cargar la caja')
      return r.json() as Promise<{
        cajas: Array<{ id: string; nombre: string; sucursal: string; sucursalId: string }>
        sesion: { id: string; numero: number; fondoInicial: number; vendido: number } | null
      }>
    },
    refetchInterval: 30_000,
  })

  // Con una sola caja no tiene sentido preguntar cuál.
  useEffect(() => {
    if (!cajaId && ses?.cajas.length === 1) setCajaId(ses.cajas[0]!.id)
  }, [ses, cajaId])

  const abrir = useMutation({
    mutationFn: async (fondo: number) => {
      const r = await fetch('/api/pos/sesion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cajaId, fondoInicial: fondo }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo abrir')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-sesion'] })
      toast.success('Caja abierta')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const guardar = useMutation({
    mutationFn: async (ls: Linea[]) => {
      const sucursalId = ses?.cajas.find((c) => c.id === cajaId)?.sucursalId
      if (!sucursalId || !pedidoId) return
      const r = await fetch('/api/pos/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: pedidoId,
          sucursalId,
          sesionId: ses?.sesion?.id ?? null,
          tipo: modo === 'salon' ? 'mesa' : 'mostrador',
          comensales: comensales ?? 1,
          items: ls.map((l) => ({
            id: l.id,
            productoId: l.productoId,
            nombre: l.nombre,
            cantidad: l.cantidad,
            precioUnitario: l.precioUnitario,
            alicuotaIva: l.alicuotaIva,
          })),
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo guardar')
      return j as { numero: number; total: number }
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const enviar = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/pos/pedidos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pedidoId, accion: 'enviar' }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo enviar')
      return j as { enviados: number }
    },
    onSuccess: (r) => {
      setLineas((ls) => ls.map((l) => ({ ...l, enviado: true })))
      toast.success(`${r.enviados} a cocina`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const total = useMemo(() => lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0), [lineas])

  const agregar = (p: ProductoPos) => {
    setLineas((ls) => {
      const i = ls.findIndex((l) => l.productoId === p.id && !l.enviado)
      const out =
        i >= 0
          ? ls.map((l, k) => (k === i ? { ...l, cantidad: l.cantidad + 1 } : l))
          : [...ls, { id: uuid(), productoId: p.id, nombre: p.nombre, cantidad: 1, precioUnitario: p.precio, alicuotaIva: p.alicuotaIva, enviado: false }]
      guardar.mutate(out)
      return out
    })
  }

  const cambiar = (id: string, delta: number) => {
    setLineas((ls) => {
      const out = ls
        .map((l) => (l.id === id ? { ...l, cantidad: l.cantidad + delta } : l))
        .filter((l) => l.cantidad > 0 || l.enviado)
      guardar.mutate(out)
      return out
    })
  }

  const nuevoPedido = (c: number | null) => {
    setPedidoId(uuid())
    setComensales(c)
    setLineas([])
  }


  // ---- caja cerrada -------------------------------------------------------
  if (!ses) {
    return <Centro><Loader2 className="h-8 w-8 animate-spin text-slate-300" /></Centro>
  }
  if (ses.cajas.length === 0) {
    return (
      <Centro>
        <p className="text-lg text-slate-600">No hay cajas configuradas.</p>
        <a href="/configuracion/pos" className="mt-2 text-sm text-blue-600 underline">
          Crear una sucursal y su caja
        </a>
      </Centro>
    )
  }
  if (!ses.sesion) {
    return (
      <Centro>
        <p className="text-xl font-semibold">Abrir caja</p>
        {ses.cajas.length > 1 && (
          <select
            value={cajaId}
            onChange={(e) => setCajaId(e.target.value)}
            className="mt-4 h-14 rounded-xl border border-slate-200 px-4 text-lg"
          >
            <option value="">Elegí la caja</option>
            {ses.cajas.map((c) => <option key={c.id} value={c.id}>{c.sucursal} — {c.nombre}</option>)}
          </select>
        )}
        <FondoInicial disabled={!cajaId || abrir.isPending} onAbrir={(f) => abrir.mutate(f)} />
      </Centro>
    )
  }

  // ---- sin pedido: cubiertos o arranque directo ---------------------------
  if (!pedidoId) {
    return (
      <Centro>
        <div className="mb-6 flex gap-2">
          {(['salon', 'rapida'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setModo(m)}
              className={cn(
                'h-14 rounded-xl px-6 text-base font-semibold',
                modo === m ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
              )}
            >
              {m === 'salon' ? 'Salón' : 'Venta rápida'}
            </button>
          ))}
        </div>

        {modo === 'salon' ? (
          <>
            <p className="flex items-center gap-2 text-xl font-semibold">
              <Users className="h-5 w-5 text-slate-400" /> ¿Cuántos cubiertos?
            </p>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((n) => (
                <button
                  key={n}
                  onClick={() => nuevoPedido(n)}
                  className="h-20 w-20 rounded-xl bg-slate-100 text-2xl font-bold active:scale-95"
                >
                  {n}
                </button>
              ))}
            </div>
          </>
        ) : (
          <button
            onClick={() => nuevoPedido(null)}
            className="h-20 rounded-xl bg-slate-900 px-10 text-xl font-semibold text-white active:scale-95"
          >
            Nuevo pedido
          </button>
        )}
      </Centro>
    )
  }

  // ---- pedido en curso ----------------------------------------------------
  return (
    <div className="flex h-dvh flex-col bg-slate-50 lg:flex-row">
      <div className="min-h-0 flex-1 p-3">
        <GrillaProductos
          categorias={cat?.categorias ?? []}
          productos={cat?.productos ?? []}
          onElegir={agregar}
        />
      </div>

      <aside className="flex max-h-[45dvh] w-full shrink-0 flex-col border-t border-slate-200 bg-white lg:max-h-none lg:w-[26rem] lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <span className="text-sm text-slate-500">
            {comensales ? `${comensales} cubiertos` : 'Venta rápida'}
          </span>
          <button
            onClick={() => { setPedidoId(null); setLineas([]) }}
            className="text-sm text-slate-400 underline"
          >
            Cancelar
          </button>
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
          {lineas.length === 0 && (
            <li className="p-10 text-center text-slate-400">Tocá un producto para agregarlo</li>
          )}
          {lineas.map((l) => (
            <li key={l.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium">{l.nombre}</p>
                <p className="text-sm text-slate-400">
                  {pesos(l.precioUnitario)}
                  {l.enviado && <span className="ml-2 text-emerald-600">en cocina</span>}
                </p>
              </div>
              <button
                onClick={() => cambiar(l.id, -1)}
                disabled={l.enviado}
                className="grid h-12 w-12 place-items-center rounded-lg bg-slate-100 disabled:opacity-30"
                aria-label="Quitar uno"
              >
                {l.cantidad === 1 ? <Trash2 className="h-5 w-5" /> : <Minus className="h-5 w-5" />}
              </button>
              <span className="w-8 text-center text-lg font-bold tabular-nums">{l.cantidad}</span>
              <button
                onClick={() => cambiar(l.id, 1)}
                className="grid h-12 w-12 place-items-center rounded-lg bg-slate-100"
                aria-label="Agregar uno"
              >
                <Plus className="h-5 w-5" />
              </button>
              <span className="w-24 text-right text-base font-semibold tabular-nums">
                {pesos(l.cantidad * l.precioUnitario)}
              </span>
            </li>
          ))}
        </ul>

        <div className="border-t border-slate-200 p-3">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-slate-500">Total</span>
            <span className="text-3xl font-bold tabular-nums">{pesos(total)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => enviar.mutate()}
              disabled={enviar.isPending || lineas.every((l) => l.enviado) || lineas.length === 0}
              className="flex h-16 items-center justify-center gap-2 rounded-xl bg-slate-900 text-base font-semibold text-white disabled:opacity-30 active:scale-[0.98]"
            >
              <ChefHat className="h-5 w-5" /> A cocina
            </button>
            <button
              disabled
              title="En la próxima etapa"
              className="flex h-16 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-base font-semibold text-white disabled:opacity-30"
            >
              <Receipt className="h-5 w-5" /> Cobrar
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-slate-50 p-6 text-center">{children}</div>
  )
}

function FondoInicial({ disabled, onAbrir }: { disabled: boolean; onAbrir: (fondo: number) => void }) {
  const [fondo, setFondo] = useState('0')
  return (
    <div className="mt-6 flex flex-col items-center gap-3">
      <label className="text-sm text-slate-500">Fondo inicial</label>
      <input
        value={fondo}
        onChange={(e) => setFondo(e.target.value.replace(/\D/g, ''))}
        inputMode="numeric"
        className="h-16 w-48 rounded-xl border border-slate-200 text-center text-2xl font-bold tabular-nums"
      />
      <button
        onClick={() => onAbrir(Number(fondo) || 0)}
        disabled={disabled}
        className="h-16 rounded-xl bg-slate-900 px-10 text-lg font-semibold text-white disabled:opacity-30 active:scale-95"
      >
        Abrir caja
      </button>
    </div>
  )
}

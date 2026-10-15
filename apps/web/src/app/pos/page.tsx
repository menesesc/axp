'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Carrito } from '@/components/pos/carrito'
import { CrearMesas } from '@/components/pos/crear-mesas'
import { Cubiertos } from '@/components/pos/cubiertos'
import { MapaMesas, LeyendaMesas, type MesaEstado } from '@/components/pos/mapa-mesas'
import { SelectorProductos } from '@/components/pos/selector-productos'
import type { CategoriaPos, ProductoPos } from '@/components/pos/grilla-productos'
import type { GrupoPos } from '@/components/pos/opciones-producto'
import { usePedido } from '@/lib/pos/usar-pedido'
import { cn } from '@/lib/utils'
import { Loader2, Receipt, ReceiptText } from 'lucide-react'

/**
 * Pantalla del cajero.
 *
 * En un restaurante el mapa del salón es la pantalla, no un menú al que se
 * entra: de un vistazo hay que ver qué mesa está libre, cuál pidió la cuenta
 * y cuál lleva veinte minutos esperando un plato. Por eso queda siempre a la
 * izquierda, y abrir una mesa agrega columnas a la derecha en vez de tapar el
 * mapa.
 *
 * Cualquier caja cobra cualquier mesa: el mapa trae las dos plantas, no sólo
 * la del salón donde está parada la caja.
 *
 * Todo lo que se toca mide 48 px o más y no hay hover: en una tablet no
 * existe.
 */

export default function PosPage() {
  const qc = useQueryClient()
  const [cajaId, setCajaId] = useState<string>('')
  const [modo, setModo] = useState<'salon' | 'rapida'>('salon')
  const [sectorId, setSectorId] = useState<string | null>(null)
  const [abriendo, setAbriendo] = useState<MesaEstado | null>(null)

  const { data: cat } = useQuery({
    queryKey: ['pos-catalogo'],
    queryFn: async () => {
      const r = await fetch('/api/pos/catalogo')
      if (!r.ok) throw new Error('No se pudo cargar el catálogo')
      return r.json() as Promise<{ categorias: CategoriaPos[]; productos: ProductoPos[]; grupos: GrupoPos[] }>
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

  const sucursalId = ses?.cajas.find((c) => c.id === cajaId)?.sucursalId

  const salon = useQuery({
    queryKey: ['pos-salon', sucursalId],
    enabled: !!sucursalId,
    queryFn: async () => {
      const r = await fetch(`/api/pos/salon?sucursalId=${sucursalId}`)
      if (!r.ok) throw new Error('No se pudo cargar el salón')
      return r.json() as Promise<{
        sectores: Array<{ id: string; nombre: string; mesas: number }>
        mesas: MesaEstado[]
      }>
    },
    // Quince segundos: el mapa tiene que envejecer poco, y son dos consultas
    // chicas. Lo que mira el encargado es justamente el tiempo.
    refetchInterval: 15_000,
  })

  useEffect(() => {
    if (!sectorId && salon.data?.sectores.length) setSectorId(salon.data.sectores[0]!.id)
  }, [salon.data, sectorId])

  const pedido = usePedido({ sucursalId, sesionId: ses?.sesion?.id ?? null })

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

  const precuenta = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/pos/pedidos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pedido.pedidoId, accion: 'precuenta' }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo imprimir')
    },
    onSuccess: () => {
      pedido.setBloqueado(true)
      toast.success('Precuenta impresa')
      salon.refetch()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const tocarMesa = (m: MesaEstado) => {
    if (m.estado === 'libre' || !m.pedidoId) setAbriendo(m)
    else void pedido.abrirPedido(m.pedidoId)
  }

  const salir = useCallback(async () => {
    await pedido.cerrar()
    salon.refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido.cerrar])

  // Escape cierra la mesa, que es lo mismo que mandar a cocina: en el salón
  // uno se va de la mesa, no "confirma el pedido".
  useEffect(() => {
    if (!pedido.pedidoId) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void salir()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [pedido.pedidoId, salir])

  const mesas = useMemo(
    () => (salon.data?.mesas ?? []).filter((m) => !sectorId || m.sectorId === sectorId),
    [salon.data, sectorId]
  )

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

  const enMesa = !!pedido.pedidoId
  const sector = salon.data?.sectores.find((s) => s.id === sectorId)

  return (
    <div className="flex h-dvh flex-col bg-slate-50 lg:flex-row">
      {/* El mapa. Se achica cuando hay una mesa abierta, pero no se va: en
          pantalla grande el cajero sigue viendo el resto del salón. */}
      <section
        className={cn(
          'flex min-h-0 flex-col p-3',
          enMesa ? 'hidden xl:flex xl:w-[23rem] xl:shrink-0' : 'flex-1'
        )}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(['salon', 'rapida'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setModo(m); pedido.limpiar() }}
              className={cn(
                'h-12 rounded-xl px-4 text-sm font-semibold',
                modo === m ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'
              )}
            >
              {m === 'salon' ? 'Salón' : 'Venta rápida'}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-400">
            Caja {ses.cajas.find((c) => c.id === cajaId)?.nombre} · turno {ses.sesion.numero}
          </span>
        </div>

        {modo === 'rapida' ? (
          <div className="grid flex-1 place-items-center">
            <button
              onClick={pedido.nuevoMostrador}
              disabled={enMesa}
              className="h-20 rounded-xl bg-slate-900 px-10 text-xl font-semibold text-white disabled:opacity-30 active:scale-95"
            >
              Nuevo pedido
            </button>
          </div>
        ) : (
          <>
            {(salon.data?.sectores.length ?? 0) > 1 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {salon.data!.sectores.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSectorId(s.id)}
                    className={cn(
                      'h-12 rounded-xl px-4 text-base font-semibold',
                      s.id === sectorId ? 'bg-white shadow-sm ring-2 ring-slate-900' : 'bg-white text-slate-500'
                    )}
                  >
                    {s.nombre}
                    <span className="ml-2 text-xs font-normal opacity-60">{s.mesas}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {salon.isLoading ? (
                <div className="grid place-items-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                </div>
              ) : mesas.length === 0 && sector && sucursalId ? (
                <CrearMesas sucursalId={sucursalId} sectorId={sector.id} onListo={() => salon.refetch()} />
              ) : (
                <MapaMesas mesas={mesas} onAbrir={tocarMesa} />
              )}
            </div>
            <div className="mt-3 shrink-0">
              <LeyendaMesas />
            </div>
          </>
        )}
      </section>

      {enMesa && (
        <>
          <div className="min-h-0 flex-1 p-3">
            <SelectorProductos
              categorias={cat?.categorias ?? []}
              productos={cat?.productos ?? []}
              grupos={cat?.grupos ?? []}
              onAgregar={(p, opciones, nota) =>
                pedido.bloqueado
                  ? toast.error('La mesa tiene la precuenta impresa')
                  : pedido.agregar(p, opciones, nota)
              }
            />
          </div>

          <Carrito
            titulo={pedido.mesa ? `Mesa ${pedido.mesa.nombre}` : 'Venta rápida'}
            subtitulo={pedido.comensales ? `${pedido.comensales} cubiertos` : null}
            lineas={pedido.lineas}
            bloqueado={pedido.bloqueado}
            onCambiar={pedido.cambiar}
            onCerrar={() => void salir()}
          >
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => precuenta.mutate()}
                disabled={pedido.bloqueado || precuenta.isPending || pedido.lineas.length === 0}
                className="flex h-16 items-center justify-center gap-2 rounded-xl bg-slate-100 text-base font-semibold text-slate-700 disabled:opacity-30 active:scale-[0.98]"
              >
                <ReceiptText className="h-5 w-5" /> Precuenta
              </button>
              <button
                disabled
                title="En la próxima etapa"
                className="flex h-16 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-base font-semibold text-white disabled:opacity-30"
              >
                <Receipt className="h-5 w-5" /> Cobrar
              </button>
            </div>
            <button
              onClick={() => void salir()}
              disabled={pedido.cerrando}
              className="mt-2 h-16 w-full rounded-xl bg-slate-900 text-lg font-semibold text-white disabled:opacity-40 active:scale-[0.99]"
            >
              {pedido.sinEnviar > 0 ? `Comandar y salir · ${pedido.sinEnviar}` : 'Salir de la mesa'}
            </button>
          </Carrito>
        </>
      )}

      {abriendo && (
        <Cubiertos
          mesa={abriendo.nombre}
          onCancelar={() => setAbriendo(null)}
          onElegir={(n) => {
            pedido.abrirMesaLibre({ id: abriendo.id, nombre: abriendo.nombre }, n)
            setAbriendo(null)
          }}
        />
      )}
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

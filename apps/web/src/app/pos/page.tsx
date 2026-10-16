'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Carrito } from '@/components/pos/carrito'
import { CrearMesas } from '@/components/pos/crear-mesas'
import { Cubiertos } from '@/components/pos/cubiertos'
import { MapaMesas, LeyendaMesas, type MesaEstado } from '@/components/pos/mapa-mesas'
import { PlanoSalon, type ElementoPlano } from '@/components/pos/plano-salon'
import { SelectorProductos } from '@/components/pos/selector-productos'
import { Autorizacion } from '@/components/pos/autorizacion'
import { CifrasSalon, MesasAbiertas, Reloj, duracion } from '@/components/pos/resumen-salon'
import type { Linea } from '@/components/pos/carrito'
import type { CategoriaPos, ProductoPos } from '@/components/pos/grilla-productos'
import type { GrupoPos } from '@/components/pos/opciones-producto'
import { usePedido } from '@/lib/pos/usar-pedido'
import { cn } from '@/lib/utils'
import { ListPlus, Loader2, Receipt, ReceiptText } from 'lucide-react'

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
  // En pantalla chica sólo entra una cosa: el consumo o la carta. Se arranca
  // por el consumo, que es lo que se mira al llegar a la mesa.
  const [vista, setVista] = useState<'detalle' | 'productos'>('detalle')
  const [anulando, setAnulando] = useState<Linea | null>(null)

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
        sesion: { id: string; numero: number; fondoInicial: number; vendido: number; pedidos?: number; abiertaAt?: string; usuario?: string | null } | null
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
        sectores: Array<{ id: string; nombre: string; mesas: number; planoZoom?: number }>
        mesas: MesaEstado[]
        elementos: ElementoPlano[]
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
    setVista('detalle')
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
  const elementos = useMemo(
    () => (salon.data?.elementos ?? []).filter((e) => !sectorId || e.sectorId === sectorId),
    [salon.data, sectorId]
  )
  // Si el salón está dibujado se muestra el plano; si todavía nadie lo dibujó,
  // la grilla, que sirve igual para vender.
  const ubicadas = mesas.filter((m) => m.x != null)
  // Zoom guardado del plano de este sector (se elige en el diseñador).
  const zoomPlano = salon.data?.sectores.find((s) => s.id === sectorId)?.planoZoom ?? 1

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

  const caja = ses.cajas.find((c) => c.id === cajaId)
  const horaApertura = ses.sesion.abiertaAt ? ses.sesion.abiertaAt.slice(11, 16) : null
  // Datos en vivo de la mesa abierta (tiempo, cocina), para el encabezado del consumo.
  const mesaViva = pedido.mesa ? salon.data?.mesas.find((m) => m.id === pedido.mesa!.id) : undefined

  return (
    <div className="flex h-dvh flex-col bg-[#f3f6fb]">
      {/* Barra de la caja: siempre arriba, con lo que se mira de reojo. */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200/80 bg-white px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-b from-[#4aa6ff] to-[#1f7fe6] text-sm font-bold text-white">
            {caja?.nombre?.slice(0, 2).toUpperCase() ?? 'PV'}
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">
              {caja?.sucursal} · {caja?.nombre}
            </p>
            <p className="text-xs text-slate-500">
              Turno {ses.sesion.numero}
              {horaApertura ? ` · abierto ${horaApertura}` : ''}
              {ses.sesion.usuario ? ` · ${ses.sesion.usuario}` : ''}
            </p>
          </div>
        </div>

        <div className="flex rounded-xl bg-slate-100 p-1">
          {(['salon', 'rapida'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setModo(m)
                pedido.limpiar()
              }}
              className={cn(
                'h-10 rounded-lg px-4 text-sm font-semibold transition-colors',
                modo === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              )}
            >
              {m === 'salon' ? 'Salón' : 'Venta rápida'}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="text-right leading-tight">
            <p className="text-[11px] text-slate-500">Vendido en el turno</p>
            <p className="text-lg font-bold tabular-nums [font-family:var(--font-display),system-ui]">
              ${Math.round(ses.sesion.vendido ?? 0).toLocaleString('es-AR')}
              {ses.sesion.pedidos != null && <span className="ml-1.5 text-xs font-normal text-slate-400">{ses.sesion.pedidos} pedidos</span>}
            </p>
          </div>
          <Reloj className="hidden text-2xl font-semibold text-slate-700 sm:inline" />
          <a href="/configuracion/pos/plano" className="hidden h-10 items-center rounded-xl px-3 text-xs font-semibold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 md:inline-flex">
            Editar plano
          </a>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* El salón. Se oculta mientras se carga una mesa: todo el ancho es para
          la carta y el consumo. */}
      <section className={cn('min-h-0 flex-1 gap-3 p-3', enMesa ? 'hidden' : 'flex flex-col lg:flex-row')}>
        {modo === 'rapida' ? (
          <div className="grid flex-1 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white/60">
            <div className="text-center">
              <p className="text-lg font-semibold">Venta rápida</p>
              <p className="mb-5 mt-1 text-sm text-slate-500">Mostrador o para llevar, sin mesa.</p>
              <button
                onClick={pedido.nuevoMostrador}
                disabled={enMesa}
                className="h-20 rounded-2xl bg-gradient-to-b from-[#4aa6ff] to-[#1f7fe6] px-12 text-xl font-semibold text-white shadow-[0_14px_30px_-12px_rgba(31,127,230,0.8)] disabled:opacity-30 active:scale-95"
              >
                Nuevo pedido
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex min-h-0 flex-1 flex-col">
              {(salon.data?.sectores.length ?? 0) > 1 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {salon.data!.sectores.map((s) => {
                    const abiertasSector = (salon.data?.mesas ?? []).filter((m) => m.sectorId === s.id && m.estado !== 'libre').length
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSectorId(s.id)}
                        className={cn(
                          'h-11 rounded-xl px-4 text-sm font-semibold transition-colors',
                          s.id === sectorId ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
                        )}
                      >
                        {s.nombre}
                        <span className="ml-2 text-xs font-normal opacity-70">
                          {abiertasSector}/{s.mesas}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                {salon.isLoading ? (
                  <div className="grid h-full place-items-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                  </div>
                ) : mesas.length === 0 && sector && sucursalId ? (
                  <CrearMesas sucursalId={sucursalId} sectorId={sector.id} onListo={() => salon.refetch()} />
                ) : ubicadas.length > 0 ? (
                  <div className="h-full min-h-[18rem]">
                    <PlanoSalon mesas={ubicadas} elementos={elementos} onTocarMesa={tocarMesa} zoom={zoomPlano} />
                  </div>
                ) : (
                  <MapaMesas mesas={mesas} onAbrir={tocarMesa} />
                )}
              </div>
              <div className="mt-2 shrink-0 px-1">
                <LeyendaMesas />
              </div>
            </div>

            {/* Lo que pide atención: cifras y mesas abiertas por urgencia. */}
            <aside className="flex min-h-0 flex-col gap-3 lg:w-[24rem] lg:shrink-0">
              <CifrasSalon mesas={salon.data?.mesas ?? []} />
              <MesasAbiertas className="min-h-[14rem] flex-1" mesas={salon.data?.mesas ?? []} onAbrir={tocarMesa} />
            </aside>
          </>
        )}
      </section>

      {enMesa && (
        <>
          <div className={cn('min-h-0 flex-1 flex-col p-3', vista === 'productos' ? 'flex' : 'hidden lg:flex')}>
            <div className="min-h-0 flex-1">
              <SelectorProductos
                categorias={cat?.categorias ?? []}
                productos={cat?.productos ?? []}
                grupos={cat?.grupos ?? []}
                enPedido={pedido.lineas.reduce<Record<string, number>>((acc, l) => ((acc[l.productoId] = (acc[l.productoId] ?? 0) + l.cantidad), acc), {})}
                onAgregar={(p, opciones, nota) =>
                  pedido.bloqueado
                    ? toast.error('La mesa tiene la precuenta impresa')
                    : pedido.agregar(p, opciones, nota)
                }
              />
            </div>
            <button
              onClick={() => setVista('detalle')}
              className="mt-2 flex h-14 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 text-base font-semibold text-white lg:hidden"
            >
              Ver el consumo
              {pedido.lineas.length > 0 && ` · ${pedido.lineas.length}`}
            </button>
          </div>

          <Carrito
            className={cn('flex-1 lg:flex-none', vista === 'detalle' ? 'flex' : 'hidden lg:flex')}
            titulo={pedido.mesa ? `Mesa ${pedido.mesa.nombre}` : 'Venta rápida'}
            subtitulo={[
              pedido.comensales ? `${pedido.comensales} cubiertos` : null,
              mesaViva?.mozo ?? null,
              mesaViva?.minutos != null ? `abierta hace ${duracion(mesaViva.minutos)}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || null}
            lineas={pedido.lineas}
            bloqueado={pedido.bloqueado}
            onCambiar={pedido.cambiar}
            onMarca={pedido.marcar}
            onAnular={(l) => setAnulando(l)}
            onCerrar={() => void salir()}
          >
            <button
              onClick={() => setVista('productos')}
              className="mb-2 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 text-base font-semibold text-slate-700 lg:hidden"
            >
              <ListPlus className="h-5 w-5" /> Agregar producto
            </button>
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

      </div>

      {anulando && (
        <Autorizacion
          titulo="Sacar un plato comandado"
          detalle={`${anulando.cantidad} × ${anulando.nombre}. La cocina ya lo tiene.`}
          accion="anular_item_enviado"
          onCancelar={() => setAnulando(null)}
          onAutorizado={(usuarioId, motivo) => {
            void pedido.anularItem(anulando.id, motivo, usuarioId)
            setAnulando(null)
          }}
        />
      )}

      {abriendo && (
        <Cubiertos
          mesa={abriendo.nombre}
          sugerido={abriendo.capacidad}
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

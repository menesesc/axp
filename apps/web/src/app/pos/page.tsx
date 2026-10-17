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
import { BotoneraMesa, accionesMesa } from '@/components/pos/botonera-mesa'
import { Cobro } from '@/components/pos/cobro'
import { Descuento } from '@/components/pos/descuento'
import { NombreCliente } from '@/components/pos/nombre-cliente'
import { useUser } from '@/hooks/use-user'
import type { Linea } from '@/components/pos/carrito'
import type { CategoriaPos, ProductoPos } from '@/components/pos/grilla-productos'
import type { GrupoPos } from '@/components/pos/opciones-producto'
import { usePedido } from '@/lib/pos/usar-pedido'
import { cn } from '@/lib/utils'
import { ChefHat, ListPlus, Loader2, Pencil, Users, Utensils, Wallet, X } from 'lucide-react'

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
  const { isAdmin, user } = useUser()
  const [cajaId, setCajaId] = useState<string>('')
  const [modo, setModo] = useState<'salon' | 'rapida'>('salon')
  const [sectorId, setSectorId] = useState<string | null>(null)
  const [abriendo, setAbriendo] = useState<MesaEstado | null>(null)
  // En pantalla chica sólo entra una cosa: el consumo o la carta. Se arranca
  // por el consumo, que es lo que se mira al llegar a la mesa.
  const [vista, setVista] = useState<'detalle' | 'productos'>('detalle')
  const [anulando, setAnulando] = useState<Linea[] | null>(null)
  // Los importes no viven en la pantalla: el salón la ve de reojo todo el
  // tiempo y lo vendido no es asunto de la mesa de al lado. Están acá
  // adentro, a un toque.
  const [verTurno, setVerTurno] = useState(false)
  const [cobrando, setCobrando] = useState(false)
  const [descontando, setDescontando] = useState(false)
  const [editandoCliente, setEditandoCliente] = useState(false)

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
        sesion: {
          id: string
          numero: number
          fondoInicial: number
          vendido: number
          pedidos?: number
          abiertaAt?: string
          usuario?: string | null
          turno?: string | null
        } | null
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

  /** Manda a cocina lo que falte, sin salir de la mesa. */
  const comandar = useCallback(async () => {
    try {
      const n = await pedido.enviar()
      if (n > 0) toast.success(`${n} a cocina`)
      salon.refetch()
    } catch (e) {
      toast.error((e as Error).message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido.enviar])

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
  const ocupadas = mesas.filter((m) => m.estado !== 'libre')
  const cubiertosSalon = ocupadas.reduce((acc, m) => acc + (m.comensales ?? 0), 0)
  const demoradas = ocupadas.filter((m) => m.enCocina > 0 && (m.minutosCocina ?? 0) >= 15).length
  const horaApertura = ses.sesion.abiertaAt ? ses.sesion.abiertaAt.slice(11, 16) : null
  // Datos en vivo de la mesa abierta (tiempo, cocina), para el encabezado del consumo.
  const mesaViva = pedido.mesa ? salon.data?.mesas.find((m) => m.id === pedido.mesa!.id) : undefined
  const horaMesa = pedido.abiertoAt ? pedido.abiertoAt.slice(11, 16) : null

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#f3f6fb]">
      {/* Barra de la caja. Nada de importes: esta pantalla la ve medio salón
          y lo vendido no es asunto de la mesa de al lado. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white px-3 py-2">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-b from-[#4aa6ff] to-[#1f7fe6] text-sm font-bold text-white">
            {caja?.nombre?.slice(0, 2).toUpperCase() ?? 'PV'}
          </span>
          {/* El turno con su horario debajo: es lo que define todo lo demás
              —qué se vendió, quién responde por la caja— y se mira seguido. */}
          <div className="leading-tight">
            <p className="text-sm font-semibold">{ses.sesion.turno ?? `Turno ${ses.sesion.numero}`}</p>
            <p className="truncate text-xs text-slate-500">
              {horaApertura ? `abierto ${horaApertura}` : caja?.nombre}
            </p>
          </div>
        </div>

        {/* Los salones y, al final, la venta rápida: lo que se elige acá es
            dónde se está parado, no una configuración. */}
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {(salon.data?.sectores ?? []).map((sec) => {
            const activo = modo === 'salon' && sec.id === sectorId
            const abiertasSector = (salon.data?.mesas ?? []).filter((m) => m.sectorId === sec.id && m.estado !== 'libre').length
            return (
              <button
                key={sec.id}
                onClick={() => {
                  setModo('salon')
                  setSectorId(sec.id)
                }}
                className={cn(
                  'h-11 shrink-0 rounded-xl px-4 text-sm font-semibold transition-colors',
                  activo ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                )}
              >
                {sec.nombre}
                <span className={cn('ml-2 text-xs font-normal', activo ? 'text-white/60' : 'text-slate-400')}>
                  {abiertasSector}/{sec.mesas}
                </span>
              </button>
            )
          })}
          <button
            onClick={() => {
              setModo('rapida')
              pedido.limpiar()
            }}
            className={cn(
              'h-11 shrink-0 rounded-xl px-4 text-sm font-semibold transition-colors',
              modo === 'rapida' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
            )}
          >
            Venta rápida
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* Quién está en la caja, a la derecha: es de quien se habla cuando
              el arqueo no cierra. */}
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-sm font-semibold">{ses.sesion.usuario || user?.nombre}</p>
            <p className="text-xs text-slate-500">{caja?.nombre}</p>
          </div>
          <Reloj className="hidden text-2xl font-semibold text-slate-700 sm:inline" />
          <button
            onClick={() => setVerTurno(true)}
            title="Caja del turno"
            aria-label="Caja del turno"
            className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <Wallet className="h-5 w-5" />
          </button>
          {/* El plano se dibuja una vez y se toca poco: un ícono, y sólo
              para quien administra. */}
          {isAdmin && (
            <a
              href="/configuracion/pos/plano"
              title="Editar el plano del salón"
              aria-label="Editar el plano del salón"
              className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              <Pencil className="h-4 w-4" />
            </a>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
      {/* El salón, a pantalla completa. Se oculta mientras se carga una mesa:
          ahí lo que importa es el consumo, no dónde está la mesa. */}
      <section className={cn('min-h-0 flex-1 flex-col p-2', enMesa ? 'hidden' : 'flex')}>
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
            <div className="min-h-0 flex-1 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              {salon.isLoading ? (
                <div className="grid h-full place-items-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                </div>
              ) : mesas.length === 0 && sector && sucursalId ? (
                <CrearMesas sucursalId={sucursalId} sectorId={sector.id} onListo={() => salon.refetch()} />
              ) : ubicadas.length > 0 ? (
                <PlanoSalon mesas={ubicadas} elementos={elementos} onTocarMesa={tocarMesa} zoom={zoomPlano} />
              ) : (
                <div className="h-full overflow-y-auto">
                  <MapaMesas mesas={mesas} onAbrir={tocarMesa} />
                </div>
              )}
            </div>

            {/* Una franja fina con lo que se mira sin pensar. Sin un peso:
                para eso está la billetera de arriba. */}
            <div className="mt-2 flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 px-2">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Utensils className="h-4 w-4 text-slate-400" />
                {ocupadas.length}/{mesas.length} ocupadas
              </span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Users className="h-4 w-4 text-slate-400" />
                {cubiertosSalon} cubiertos
              </span>
              <span
                className={cn(
                  'flex items-center gap-1.5 text-sm font-semibold',
                  demoradas > 0 ? 'text-red-600' : 'text-emerald-600'
                )}
              >
                <ChefHat className="h-4 w-4" />
                {demoradas > 0 ? `${demoradas} demorada${demoradas > 1 ? 's' : ''} en cocina` : 'cocina al día'}
              </span>
              <span className="ml-auto">
                <LeyendaMesas />
              </span>
            </div>
          </>
        )}
      </section>

      {enMesa && (
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
            {/* El consumo primero: es lo que se mira estando en la mesa. */}
            <Carrito
              className={cn('flex-1 lg:flex-none lg:border-r', vista === 'detalle' ? 'flex' : 'hidden lg:flex')}
              titulo={pedido.mesa ? `Mesa ${pedido.mesa.nombre}` : 'Venta rápida'}
              cliente={pedido.cliente}
              sincronizado={pedido.sincronizado}
              onCliente={() => setEditandoCliente(true)}
              onRepetir={(l) =>
                pedido.agregar(
                  { id: l.productoId, nombre: l.nombre, precio: l.precioUnitario, alicuotaIva: l.alicuotaIva },
                  l.opciones,
                  l.nota
                )
              }
              subtitulo={[
                pedido.comensales ? `${pedido.comensales} cub.` : null,
                horaMesa ? `desde ${horaMesa}` : null,
                mesaViva?.minutos != null ? `hace ${duracion(mesaViva.minutos)}` : null,
                mesaViva?.mozo ?? ses.sesion.usuario ?? user?.nombre ?? null,
              ]
                .filter(Boolean)
                .join(' · ') || null}
              lineas={pedido.lineas}
              bloqueado={pedido.bloqueado}
              onCambiar={pedido.cambiar}
              onMarca={pedido.marcar}
              onAnular={(ls) => setAnulando(ls)}
            >
              <button
                onClick={() => setVista('productos')}
                className="mb-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm font-semibold text-slate-700 lg:hidden"
              >
                <ListPlus className="h-4 w-4" /> Agregar producto
              </button>
              <BotoneraMesa
                acciones={accionesMesa({
                  sinEnviar: pedido.sinEnviar,
                  vacio: pedido.lineas.length === 0,
                  bloqueado: pedido.bloqueado,
                  onComandar: () => void comandar(),
                  onCuenta: () => precuenta.mutate(),
                  onCobrar: () => setCobrando(true),
                  onDescuento: () => setDescontando(true),
                  onSalir: () => void salir(),
                })}
              />
            </Carrito>

            <div className={cn('min-h-0 min-w-0 flex-1 flex-col p-3', vista === 'productos' ? 'flex' : 'hidden lg:flex')}>
              <div className="min-h-0 min-w-0 flex-1">
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
          </div>
        </section>
      )}

      </div>

      {anulando && anulando.length > 0 && (
        <Autorizacion
          titulo="Sacar un plato comandado"
          detalle={`${anulando.reduce((s, l) => s + l.cantidad, 0)} × ${anulando[0]!.nombre}. La cocina ya lo tiene.`}
          accion="anular_item_enviado"
          onCancelar={() => setAnulando(null)}
          onAutorizado={(usuarioId, motivo) => {
            for (const l of anulando) void pedido.anularItem(l.id, motivo, usuarioId)
            setAnulando(null)
          }}
        />
      )}

      {cobrando && pedido.pedidoId && (
        <Cobro
          pedidoId={pedido.pedidoId}
          titulo={pedido.mesa ? `mesa ${pedido.mesa.nombre}` : 'el pedido'}
          total={pedido.lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0) * (1 - pedido.descuento.pct / 100) - pedido.descuento.importe}
          onCerrar={() => setCobrando(false)}
          onCobrado={() => {
            setCobrando(false)
            pedido.limpiar()
            salon.refetch()
            qc.invalidateQueries({ queryKey: ['pos-sesion'] })
          }}
        />
      )}

      {descontando && (
        <Descuento
          total={pedido.lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0)}
          pct={pedido.descuento.pct}
          importe={pedido.descuento.importe}
          onCerrar={() => setDescontando(false)}
          onAplicar={(pct, importe, motivo) => {
            void pedido.aplicarDescuento(pct, importe, motivo)
            setDescontando(false)
          }}
        />
      )}

      {editandoCliente && (
        <NombreCliente
          valor={pedido.cliente}
          onCerrar={() => setEditandoCliente(false)}
          onGuardar={(nombre) => {
            pedido.ponerCliente(nombre)
            setEditandoCliente(false)
          }}
        />
      )}

      {/* La caja del turno, con los importes. Acá adentro y no en la barra:
          la pantalla del salón la ve cualquiera que pase. */}
      {verTurno && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setVerTurno(false)}>
          <div
            className="flex h-full w-full max-w-md flex-col bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-lg font-bold">Caja del turno</p>
                <p className="text-xs text-slate-500">
                  {ses.sesion.turno ?? `Turno ${ses.sesion.numero}`}
                  {horaApertura ? ` · desde ${horaApertura}` : ''}
                </p>
              </div>
              <button
                onClick={() => setVerTurno(false)}
                aria-label="Cerrar"
                className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-3 rounded-2xl bg-slate-900 px-4 py-3 text-white">
              <p className="text-xs text-white/60">Vendido en el turno</p>
              <p className="text-3xl font-bold tabular-nums">
                ${Math.round(ses.sesion.vendido ?? 0).toLocaleString('es-AR')}
              </p>
              <p className="mt-0.5 text-xs text-white/60">
                {ses.sesion.pedidos ?? 0} pedidos · fondo ${Math.round(ses.sesion.fondoInicial ?? 0).toLocaleString('es-AR')}
              </p>
            </div>

            <CifrasSalon mesas={salon.data?.mesas ?? []} />
            <MesasAbiertas
              className="mt-3 min-h-[12rem] flex-1"
              mesas={salon.data?.mesas ?? []}
              onAbrir={(m) => {
                setVerTurno(false)
                tocarMesa(m)
              }}
            />
          </div>
        </div>
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

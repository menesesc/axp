'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Carrito } from '@/components/pos/carrito'
import { Cubiertos } from '@/components/pos/cubiertos'
import { MapaMesas, LeyendaMesas, type MesaEstado } from '@/components/pos/mapa-mesas'
import { PlanoSalon, type ElementoPlano } from '@/components/pos/plano-salon'
import { SelectorProductos } from '@/components/pos/selector-productos'
import { Autorizacion } from '@/components/pos/autorizacion'
import { BotoneraMesa, accionesMesa } from '@/components/pos/botonera-mesa'
import { MesasAbiertas, Reloj, duracion } from '@/components/pos/resumen-salon'
import type { Linea } from '@/components/pos/carrito'
import type { CategoriaPos, ProductoPos } from '@/components/pos/grilla-productos'
import type { GrupoPos } from '@/components/pos/opciones-producto'
import { usePedido } from '@/lib/pos/usar-pedido'
import { cn } from '@/lib/utils'
import { Delete, ListPlus, Loader2, LogOut } from 'lucide-react'

/**
 * Pantalla de mozos.
 *
 * Es la tablet que está colgada en el salón y la usan todos. Por eso el PIN:
 * no identifica un dispositivo sino a quién está cargando, que cambia cada
 * dos minutos. Y por eso vuelve sola al PIN cuando queda quieta: el que la
 * agarra después no tiene que fijarse de quién es la sesión.
 *
 * El mozo abre cualquier mesa libre y sigue cargando en las suyas. En la que
 * abrió otro no entra: si hace falta cambiar algo ahí, está el cajero, que ve
 * todo el salón.
 */

const ESPERA_PIN = 120_000

export default function MozoPage() {
  const [usuario, setUsuario] = useState<{ id: string; nombre: string; rol: string } | null>(null)
  const [abriendo, setAbriendo] = useState<MesaEstado | null>(null)
  const [numero, setNumero] = useState('')
  // El celular muestra el consumo y un botón para agregar. Nada más entra.
  const [vista, setVista] = useState<'detalle' | 'productos'>('detalle')
  const [anulando, setAnulando] = useState<Linea[] | null>(null)

  const { data: cat } = useQuery({
    queryKey: ['pos-catalogo'],
    queryFn: async () => {
      const r = await fetch('/api/pos/catalogo')
      if (!r.ok) throw new Error('No se pudo cargar el catálogo')
      return r.json() as Promise<{ categorias: CategoriaPos[]; productos: ProductoPos[]; grupos: GrupoPos[] }>
    },
    enabled: !!usuario,
  })

  const { data: ses } = useQuery({
    queryKey: ['pos-sesion', ''],
    queryFn: async () => {
      const r = await fetch('/api/pos/sesion')
      if (!r.ok) throw new Error('No se pudo cargar la caja')
      return r.json() as Promise<{
        cajas: Array<{ id: string; nombre: string; sucursal: string; sucursalId: string }>
      }>
    },
  })
  const sucursalId = ses?.cajas[0]?.sucursalId

  const salon = useQuery({
    queryKey: ['pos-salon', sucursalId],
    enabled: !!sucursalId && !!usuario,
    queryFn: async () => {
      const r = await fetch(`/api/pos/salon?sucursalId=${sucursalId}`)
      if (!r.ok) throw new Error('No se pudo cargar el salón')
      return r.json() as Promise<{
        sectores: Array<{ id: string; nombre: string; mesas: number; planoZoom?: number }>
        mesas: MesaEstado[]
        elementos: ElementoPlano[]
      }>
    },
    refetchInterval: 15_000,
  })

  const [sectorId, setSectorId] = useState<string | null>(null)
  useEffect(() => {
    if (!sectorId && salon.data?.sectores.length) setSectorId(salon.data.sectores[0]!.id)
  }, [salon.data, sectorId])

  const pedido = usePedido({ sucursalId, mozoId: usuario?.id ?? null })

  /** La precuenta la pide el mozo en la mesa: bloquea la carga y se imprime. */
  const precuenta = useCallback(async () => {
    try {
      const r = await fetch('/api/pos/pedidos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pedido.pedidoId, accion: 'precuenta' }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo imprimir')
      pedido.setBloqueado(true)
      toast.success('Precuenta impresa')
      salon.refetch()
    } catch (e) {
      toast.error((e as Error).message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido.pedidoId])

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
    setNumero('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido.cerrar])

  useEffect(() => {
    if (!pedido.pedidoId) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void salir()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [pedido.pedidoId, salir])

  // Vuelve sola al PIN si nadie la toca. Dos minutos: lo que tarda un mozo en
  // dejarla y que la agarre otro.
  useEffect(() => {
    if (!usuario || pedido.pedidoId) return
    const t = setTimeout(() => { setUsuario(null); setNumero('') }, ESPERA_PIN)
    return () => clearTimeout(t)
  }, [usuario, pedido.pedidoId, numero])

  const mesas = useMemo(
    () => (salon.data?.mesas ?? []).filter((m) => !sectorId || m.sectorId === sectorId),
    [salon.data, sectorId]
  )
  const elementos = useMemo(
    () => (salon.data?.elementos ?? []).filter((e) => !sectorId || e.sectorId === sectorId),
    [salon.data, sectorId]
  )
  const ubicadas = mesas.filter((m) => m.x != null)
  // Zoom guardado del plano de este sector (se elige en el diseñador).
  const zoomPlano = salon.data?.sectores.find((s) => s.id === sectorId)?.planoZoom ?? 1

  const tocarMesa = (m: MesaEstado) => {
    setVista('detalle')
    if (m.estado === 'libre' || !m.pedidoId) {
      setAbriendo(m)
    } else if (m.estado === 'cuenta' || m.estado === 'facturada') {
      toast.error(`La mesa ${m.nombre} ya pidió la cuenta`)
    } else if (m.mozoId && m.mozoId !== usuario?.id) {
      toast.error(`La mesa ${m.nombre} la abrió ${m.mozo ?? 'otro mozo'}`)
    } else {
      void pedido.abrirPedido(m.pedidoId)
    }
  }

  const porNumero = () => {
    const m = (salon.data?.mesas ?? []).find((x) => x.nombre === numero.replace(/^0+/, ''))
    if (!m) {
      toast.error(`No hay mesa ${numero}`)
      return
    }
    setNumero('')
    tocarMesa(m)
  }

  if (!usuario) return <TecladoPin onEntrar={setUsuario} />

  const mesaViva = pedido.mesa ? salon.data?.mesas.find((m) => m.id === pedido.mesa!.id) : undefined
  const mias = (salon.data?.mesas ?? []).filter((m) => m.estado !== 'libre' && m.mozoId === usuario.id)

  if (pedido.pedidoId) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 lg:flex-row">
        <div className={cn('min-h-0 min-w-0 flex-1 flex-col p-3', vista === 'productos' ? 'flex' : 'hidden lg:flex')}>
          <div className="min-h-0 min-w-0 flex-1">
            <SelectorProductos
              categorias={cat?.categorias ?? []}
              productos={cat?.productos ?? []}
              grupos={cat?.grupos ?? []}
              enPedido={pedido.lineas.reduce<Record<string, number>>((acc, l) => ((acc[l.productoId] = (acc[l.productoId] ?? 0) + l.cantidad), acc), {})}
              onAgregar={(p, opciones, nota) => pedido.agregar(p, opciones, nota)}
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
          titulo={pedido.mesa ? `Mesa ${pedido.mesa.nombre}` : 'Pedido'}
          subtitulo={[
            `${pedido.comensales ?? 1} cubiertos`,
            usuario.nombre,
            mesaViva?.minutos != null ? `abierta hace ${duracion(mesaViva.minutos)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          sincronizado={pedido.sincronizado}
          lineas={pedido.lineas}
          bloqueado={pedido.bloqueado}
          onCambiar={pedido.cambiar}
          onMarca={pedido.marcar}
          onAnular={(ls) => setAnulando(ls)}
          onRepetir={(l) =>
            pedido.agregar(
              { id: l.productoId, nombre: l.nombre, precio: l.precioUnitario, alicuotaIva: l.alicuotaIva },
              l.opciones,
              l.nota
            )
          }
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
              onCuenta: () => void precuenta(),
              onSalir: () => void salir(),
            })}
          />
        </Carrito>

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
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#f3f6fb]">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white px-4 py-2.5">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-b from-[#4aa6ff] to-[#1f7fe6] text-base font-bold text-white">
          {usuario.nombre.slice(0, 1).toUpperCase()}
        </span>
        <div className="leading-tight">
          <p className="text-base font-bold">{usuario.nombre}</p>
          <p className="text-xs text-slate-500">
            {mias.length === 0 ? 'Sin mesas abiertas' : `${mias.length} ${mias.length === 1 ? 'mesa abierta' : 'mesas abiertas'}`}
          </p>
        </div>
        <Reloj className="ml-auto text-2xl font-semibold text-slate-700" />
        <button
          onClick={() => setUsuario(null)}
          className="flex h-12 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 active:bg-slate-50"
        >
          <LogOut className="h-4 w-4" /> Salir
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:flex-row lg:overflow-hidden">
        <div className="flex shrink-0 flex-col gap-3 lg:w-80">
          <MesasAbiertas
            titulo="Tus mesas"
            mesas={salon.data?.mesas ?? []}
            soloMozoId={usuario.id}
            onAbrir={tocarMesa}
            className="max-h-[22rem] lg:max-h-none lg:min-h-0 lg:flex-1"
          />
          <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <p className="mb-2 text-sm font-semibold">Abrir por número</p>
            <div className="mb-2 h-14 rounded-xl border-2 border-slate-200 bg-slate-50 text-center text-3xl font-bold leading-[3.1rem] tabular-nums">
              {numero || <span className="text-slate-300">—</span>}
            </div>
            <Teclas onDigito={(d) => setNumero((n) => (n + d).slice(0, 4))} onBorrar={() => setNumero((n) => n.slice(0, -1))} />
            <button
              onClick={porNumero}
              disabled={!numero}
              className="mt-2 h-14 w-full rounded-xl bg-gradient-to-b from-[#4aa6ff] to-[#1f7fe6] text-lg font-semibold text-white disabled:opacity-30 active:scale-[0.99]"
            >
              Abrir mesa {numero}
            </button>
          </div>
        </div>

        <div className="flex min-h-[22rem] flex-1 flex-col">
          {(salon.data?.sectores.length ?? 0) > 1 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {salon.data!.sectores.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSectorId(s.id)}
                  className={cn(
                    'h-11 rounded-xl px-4 text-sm font-semibold',
                    s.id === sectorId ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
                  )}
                >
                  {s.nombre}
                </button>
              ))}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            {salon.isLoading ? (
              <div className="grid place-items-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
              </div>
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
      </div>

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

function TecladoPin({ onEntrar }: { onEntrar: (u: { id: string; nombre: string; rol: string }) => void }) {
  const [pin, setPin] = useState('')
  const [probando, setProbando] = useState(false)

  const entrar = useCallback(async (valor: string) => {
    setProbando(true)
    try {
      const r = await fetch('/api/pos/mozo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: valor }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo entrar')
      onEntrar(j.usuario)
    } catch (e) {
      toast.error((e as Error).message)
      setPin('')
    } finally {
      setProbando(false)
    }
  }, [onEntrar])

  return (
    <div className="grid h-dvh place-items-center bg-[#f3f6fb] p-4">
      <div className="w-full max-w-xs rounded-3xl border border-slate-200/80 bg-white p-6 text-center shadow-[0_20px_50px_-24px_rgba(15,35,70,0.35)]">
        <Reloj className="text-4xl font-bold text-slate-800 [font-family:var(--font-display),system-ui]" />
        <p className="mt-3 text-lg font-semibold">Ingresá tu PIN</p>
        <p className="text-xs text-slate-500">Para cargar las mesas a tu nombre</p>
        <div className="my-5 flex justify-center gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className={cn(
                'h-4 w-4 rounded-full',
                i < pin.length ? 'bg-slate-900' : i < 4 ? 'bg-slate-200' : 'bg-slate-100'
              )}
            />
          ))}
        </div>
        <Teclas
          onDigito={(d) => setPin((p) => (p.length >= 6 ? p : p + d))}
          onBorrar={() => setPin((p) => p.slice(0, -1))}
        />
        <button
          onClick={() => entrar(pin)}
          disabled={pin.length < 4 || probando}
          className="mt-3 h-16 w-full rounded-xl bg-gradient-to-b from-[#4aa6ff] to-[#1f7fe6] text-lg font-semibold text-white disabled:opacity-30 active:scale-[0.99]"
        >
          {probando ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
    </div>
  )
}

function Teclas({ onDigito, onBorrar }: { onDigito: (d: string) => void; onBorrar: () => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <button
          key={d}
          onClick={() => onDigito(d)}
          className="h-16 rounded-xl bg-slate-50 text-2xl font-bold ring-1 ring-slate-200 active:scale-95 active:bg-slate-100"
        >
          {d}
        </button>
      ))}
      <span />
      <button onClick={() => onDigito('0')} className="h-16 rounded-xl bg-slate-50 text-2xl font-bold ring-1 ring-slate-200 active:scale-95 active:bg-slate-100">
        0
      </button>
      <button onClick={onBorrar} aria-label="Borrar" className="grid h-16 place-items-center rounded-xl bg-slate-50 ring-1 ring-slate-200 active:scale-95 active:bg-slate-100">
        <Delete className="h-6 w-6 text-slate-500" />
      </button>
    </div>
  )
}

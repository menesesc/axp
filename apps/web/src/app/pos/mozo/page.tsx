'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Carrito } from '@/components/pos/carrito'
import { Cubiertos } from '@/components/pos/cubiertos'
import { MapaMesas, LeyendaMesas, type MesaEstado } from '@/components/pos/mapa-mesas'
import { SelectorProductos } from '@/components/pos/selector-productos'
import type { CategoriaPos, ProductoPos } from '@/components/pos/grilla-productos'
import type { GrupoPos } from '@/components/pos/opciones-producto'
import { usePedido } from '@/lib/pos/usar-pedido'
import { cn } from '@/lib/utils'
import { Delete, Loader2, LogOut } from 'lucide-react'

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
        sectores: Array<{ id: string; nombre: string; mesas: number }>
        mesas: MesaEstado[]
      }>
    },
    refetchInterval: 15_000,
  })

  const [sectorId, setSectorId] = useState<string | null>(null)
  useEffect(() => {
    if (!sectorId && salon.data?.sectores.length) setSectorId(salon.data.sectores[0]!.id)
  }, [salon.data, sectorId])

  const pedido = usePedido({ sucursalId, mozoId: usuario?.id ?? null })

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

  const tocarMesa = (m: MesaEstado) => {
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

  if (pedido.pedidoId) {
    return (
      <div className="flex h-dvh flex-col bg-slate-50 lg:flex-row">
        <div className="min-h-0 flex-1 p-3">
          <SelectorProductos
            categorias={cat?.categorias ?? []}
            productos={cat?.productos ?? []}
            grupos={cat?.grupos ?? []}
            onAgregar={(p, opciones, nota) => pedido.agregar(p, opciones, nota)}
          />
        </div>
        <Carrito
          titulo={pedido.mesa ? `Mesa ${pedido.mesa.nombre}` : 'Pedido'}
          subtitulo={`${pedido.comensales ?? 1} cubiertos · ${usuario.nombre}`}
          lineas={pedido.lineas}
          onCambiar={pedido.cambiar}
          onCerrar={() => void salir()}
        >
          <button
            onClick={() => void salir()}
            disabled={pedido.cerrando}
            className="h-16 w-full rounded-xl bg-slate-900 text-lg font-semibold text-white disabled:opacity-40 active:scale-[0.99]"
          >
            {pedido.sinEnviar > 0 ? `Comandar · ${pedido.sinEnviar}` : 'Salir de la mesa'}
          </button>
        </Carrito>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col bg-slate-50 p-3">
      <div className="mb-3 flex items-center gap-3">
        <p className="text-lg font-bold">{usuario.nombre}</p>
        <button
          onClick={() => setUsuario(null)}
          className="ml-auto flex h-12 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-600"
        >
          <LogOut className="h-4 w-4" /> Salir
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="shrink-0 lg:w-64">
          <p className="mb-2 text-sm text-slate-500">Número de mesa</p>
          <div className="mb-2 h-16 rounded-xl border-2 border-slate-200 bg-white text-center text-3xl font-bold leading-[3.5rem] tabular-nums">
            {numero || <span className="text-slate-300">—</span>}
          </div>
          <Teclas
            onDigito={(d) => setNumero((n) => (n + d).slice(0, 4))}
            onBorrar={() => setNumero((n) => n.slice(0, -1))}
          />
          <button
            onClick={porNumero}
            disabled={!numero}
            className="mt-2 h-16 w-full rounded-xl bg-slate-900 text-lg font-semibold text-white disabled:opacity-30 active:scale-[0.99]"
          >
            Abrir mesa
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
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
                </button>
              ))}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {salon.isLoading ? (
              <div className="grid place-items-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
              </div>
            ) : (
              <MapaMesas mesas={mesas} onAbrir={tocarMesa} />
            )}
          </div>
          <div className="mt-3 shrink-0">
            <LeyendaMesas />
          </div>
        </div>
      </div>

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
    <div className="grid h-dvh place-items-center bg-slate-50 p-4">
      <div className="w-full max-w-xs text-center">
        <p className="text-xl font-bold">Tu PIN</p>
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
          className="mt-3 h-16 w-full rounded-xl bg-slate-900 text-lg font-semibold text-white disabled:opacity-30 active:scale-[0.99]"
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
          className="h-16 rounded-xl bg-white text-2xl font-bold shadow-sm active:scale-95"
        >
          {d}
        </button>
      ))}
      <span />
      <button onClick={() => onDigito('0')} className="h-16 rounded-xl bg-white text-2xl font-bold shadow-sm active:scale-95">
        0
      </button>
      <button onClick={onBorrar} aria-label="Borrar" className="grid h-16 place-items-center rounded-xl bg-white shadow-sm active:scale-95">
        <Delete className="h-6 w-6 text-slate-500" />
      </button>
    </div>
  )
}

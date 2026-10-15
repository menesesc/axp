'use client'

import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Linea } from '@/components/pos/carrito'
import type { OpcionElegida } from '@/components/pos/opciones-producto'

/**
 * El pedido que se está cargando, con su ida y vuelta al servidor.
 *
 * Lo usan las dos pantallas —la del cajero, que ve el mapa, y la del mozo,
 * que entra con PIN— y hacen exactamente lo mismo con él, así que vive acá y
 * no duplicado en cada una.
 *
 * El id lo genera la pantalla. Eso hace que el pedido exista apenas se toca
 * el primer producto, sin esperar un viaje al servidor, y que reintentar el
 * guardado no duplique nada: el mismo id, la misma fila.
 */

export interface MesaAbierta {
  id: string
  nombre: string
}

const uuid = () => crypto.randomUUID()

export function usePedido(opts: {
  sucursalId: string | undefined
  sesionId?: string | null
  mozoId?: string | null
}) {
  const [pedidoId, setPedidoId] = useState<string | null>(null)
  const [mesa, setMesa] = useState<MesaAbierta | null>(null)
  const [comensales, setComensales] = useState<number | null>(null)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [bloqueado, setBloqueado] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [cerrando, setCerrando] = useState(false)

  // Lo último que se mandó, para no pisar un guardado nuevo con la respuesta
  // de uno viejo cuando el mozo toca tres productos seguidos.
  const envio = useRef(0)

  const guardar = useCallback(
    async (ls: Linea[], datos?: { mesaId?: string | null; comensales?: number | null; id?: string }) => {
      const id = datos?.id ?? pedidoId
      if (!opts.sucursalId || !id) return
      const turno = ++envio.current
      try {
        const r = await fetch('/api/pos/pedidos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            sucursalId: opts.sucursalId,
            sesionId: opts.sesionId ?? null,
            mesaId: datos?.mesaId !== undefined ? datos.mesaId : (mesa?.id ?? null),
            mozoId: opts.mozoId ?? null,
            tipo: (datos?.mesaId !== undefined ? datos.mesaId : mesa?.id) ? 'mesa' : 'mostrador',
            comensales: (datos?.comensales !== undefined ? datos.comensales : comensales) ?? 1,
            items: ls.map((l) => ({
              id: l.id,
              productoId: l.productoId,
              nombre: l.nombre,
              cantidad: l.cantidad,
              precioUnitario: l.precioUnitario,
              alicuotaIva: l.alicuotaIva,
              nota: l.nota,
              opciones: l.opciones,
            })),
          }),
        })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'No se pudo guardar')
      } catch (e) {
        if (turno === envio.current) toast.error((e as Error).message)
      }
    },
    [opts.sucursalId, opts.sesionId, opts.mozoId, pedidoId, mesa, comensales]
  )

  /** Abre una mesa que estaba libre: pedido nuevo con los cubiertos cargados. */
  const abrirMesaLibre = useCallback(
    (m: MesaAbierta, cubiertos: number) => {
      const id = uuid()
      setPedidoId(id)
      setMesa(m)
      setComensales(cubiertos)
      setLineas([])
      setBloqueado(false)
      // Se guarda vacío para que la mesa se pinte ocupada en el resto de las
      // pantallas desde el momento en que el mozo la tomó, no cuando cargue
      // el primer plato.
      void guardar([], { id, mesaId: m.id, comensales: cubiertos })
    },
    [guardar]
  )

  /** Vuelve a abrir un pedido que ya existe, con lo que la cocina ya tiene. */
  const abrirPedido = useCallback(async (id: string) => {
    setCargando(true)
    try {
      const r = await fetch(`/api/pos/pedidos?pedidoId=${id}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo abrir la mesa')
      const p = j.pedido as {
        id: string
        estado: string
        comensales: number | null
        mesaId: string | null
        mesa: string | null
      }
      setPedidoId(p.id)
      setMesa(p.mesaId ? { id: p.mesaId, nombre: p.mesa ?? '' } : null)
      setComensales(p.comensales)
      setBloqueado(p.estado === 'bloqueado')
      setLineas(
        (j.items as Array<Record<string, unknown>>)
          .filter((i) => !i.anulado)
          .map((i) => ({
            id: String(i.id),
            productoId: String(i.productoId ?? ''),
            nombre: String(i.nombre),
            cantidad: Number(i.cantidad),
            precioUnitario: Number(i.precioUnitario),
            alicuotaIva: Number(i.alicuotaIva),
            enviado: Boolean(i.enviado),
            nota: (i.nota as string | null) ?? null,
            opciones: (i.opciones as OpcionElegida[]) ?? [],
          }))
      )
      return p
    } catch (e) {
      toast.error((e as Error).message)
      return null
    } finally {
      setCargando(false)
    }
  }, [])

  /** Venta de mostrador: sin mesa y sin cubiertos. */
  const nuevoMostrador = useCallback(() => {
    setPedidoId(uuid())
    setMesa(null)
    setComensales(null)
    setLineas([])
    setBloqueado(false)
  }, [])

  const agregar = useCallback(
    (
      p: { id: string; nombre: string; precio: number; alicuotaIva: number },
      opciones: OpcionElegida[] = [],
      nota: string | null = null
    ) => {
      setLineas((ls) => {
        const extra = opciones.reduce((s, o) => s + o.precioExtra, 0)
        // Dos unidades del mismo plato se juntan en una línea sólo si tienen
        // lo mismo elegido y la misma observación. Si no, la cocina recibe
        // dos pedidos distintos y tiene que poder distinguirlos.
        const igual = (l: Linea) =>
          l.productoId === p.id &&
          !l.enviado &&
          l.nota === nota &&
          l.opciones.length === opciones.length &&
          l.opciones.every((o) => opciones.some((x) => x.opcionId === o.opcionId))
        const i = ls.findIndex(igual)
        const out =
          i >= 0
            ? ls.map((l, k) => (k === i ? { ...l, cantidad: l.cantidad + 1 } : l))
            : [
                ...ls,
                {
                  id: uuid(),
                  productoId: p.id,
                  nombre: p.nombre,
                  cantidad: 1,
                  precioUnitario: p.precio + extra,
                  alicuotaIva: p.alicuotaIva,
                  enviado: false,
                  nota,
                  opciones,
                },
              ]
        void guardar(out)
        return out
      })
    },
    [guardar]
  )

  const cambiar = useCallback(
    (id: string, delta: number) => {
      setLineas((ls) => {
        const out = ls
          .map((l) => (l.id === id ? { ...l, cantidad: l.cantidad + delta } : l))
          .filter((l) => l.cantidad > 0 || l.enviado)
        void guardar(out)
        return out
      })
    },
    [guardar]
  )

  const enviar = useCallback(async () => {
    if (!pedidoId) return 0
    const r = await fetch('/api/pos/pedidos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pedidoId, accion: 'enviar' }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || 'No se pudo enviar')
    setLineas((ls) => ls.map((l) => ({ ...l, enviado: true })))
    return (j.enviados as number) ?? 0
  }, [pedidoId])

  const limpiar = useCallback(() => {
    setPedidoId(null)
    setMesa(null)
    setComensales(null)
    setLineas([])
    setBloqueado(false)
  }, [])

  /**
   * Salir de la mesa manda a cocina lo que falte.
   *
   * Es lo que pasa en el salón: el mozo carga, se va y espera que la comanda
   * salga. Dejar un botón aparte sólo sirve para que alguna vez quede un
   * plato cargado que la cocina nunca vio.
   */
  const cerrar = useCallback(async () => {
    const pendientes = lineas.filter((l) => !l.enviado).length
    setCerrando(true)
    try {
      if (pendientes > 0) {
        const n = await enviar()
        if (n > 0) toast.success(`${n} a cocina`)
      }
      limpiar()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCerrando(false)
    }
  }, [lineas, enviar, limpiar])

  return {
    pedidoId,
    mesa,
    comensales,
    lineas,
    bloqueado,
    cargando,
    cerrando,
    sinEnviar: lineas.filter((l) => !l.enviado).length,
    abrirMesaLibre,
    abrirPedido,
    nuevoMostrador,
    agregar,
    cambiar,
    enviar,
    cerrar,
    limpiar,
    setBloqueado,
  }
}

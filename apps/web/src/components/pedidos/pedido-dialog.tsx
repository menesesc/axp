'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { hoyAR } from '@/lib/fechas'
import { Copy, Loader2, Plus, Send, Trash2, Undo2, X } from 'lucide-react'
import { fmtCant, fmtFecha, parseCantidad, textoPedido, type InsumoCat, type Pedido } from './tipos'

interface Linea {
  insumoId: string
  nombre: string
  unidad: string
  vendida: number | null
  pedida: string
  enviada: string
}

const aTexto = (n: number | null) => (n === null ? '' : String(Math.round(n * 1000) / 1000).replace('.', ','))

/**
 * Detalle de un pedido. El que pide edita cantidades y agrega insumos; el
 * central (permiso de despacho) carga lo que realmente envió y lo registra.
 */
export function PedidoDialog({
  pedido: inicial,
  insumos,
  edita,
  despacha,
  onClose,
}: {
  pedido: Pedido
  insumos: InsumoCat[]
  edita: boolean
  despacha: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  // Copia local: "Guardar" deja el diálogo abierto con lo que devolvió el server.
  const [pedido, setPedido] = useState(inicial)
  const pendiente = pedido.estado === 'pendiente'
  const [lineas, setLineas] = useState<Linea[]>([])
  const [nota, setNota] = useState(pedido.nota ?? '')
  const [agregar, setAgregar] = useState('')
  const [fechaEnvio, setFechaEnvio] = useState(hoyAR())
  const [ocupado, setOcupado] = useState<string | null>(null)

  useEffect(() => {
    setLineas(
      pedido.items.map((it) => ({
        insumoId: it.insumoId,
        nombre: it.nombre,
        unidad: it.unidad,
        vendida: it.cantidadVendida,
        pedida: aTexto(it.cantidadPedida),
        enviada: aTexto(it.cantidadEnviada ?? it.cantidadPedida),
      }))
    )
    setNota(pedido.nota ?? '')
  }, [pedido])

  const invalidas = lineas.some((l) => parseCantidad(l.pedida) === undefined || parseCantidad(l.enviada) === undefined)
  const pedidoCambio = useMemo(() => {
    if (nota.trim() !== (pedido.nota ?? '')) return true
    if (lineas.length !== pedido.items.length) return true
    const orig = new Map(pedido.items.map((it) => [it.insumoId, it.cantidadPedida]))
    return lineas.some((l) => orig.get(l.insumoId) !== (parseCantidad(l.pedida) ?? 0))
  }, [lineas, nota, pedido])

  const disponibles = insumos.filter((i) => !lineas.some((l) => l.insumoId === i.id))

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['pedidos'] })
    qc.invalidateQueries({ queryKey: ['conciliacion-stock'] })
  }

  const llamar = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    const r = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(r.error || 'Error')
    return r
  }

  const accion = async (clave: string, fn: () => Promise<unknown>, ok: string, cerrar = true) => {
    setOcupado(clave)
    try {
      await fn()
      toast.success(ok)
      refrescar()
      if (cerrar) onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setOcupado(null)
    }
  }

  const guardarPedido = async () => {
    const r = await llamar(`/api/pedidos/${pedido.id}`, 'PATCH', {
      nota,
      items: lineas.map((l) => ({ insumoId: l.insumoId, cantidadPedida: parseCantidad(l.pedida) ?? 0 })),
    })
    setPedido(r.pedido)
  }

  const enviar = () =>
    accion(
      'enviar',
      async () => {
        if (edita && pedidoCambio) await guardarPedido()
        await llamar(`/api/pedidos/despacho/${pedido.id}`, 'POST', {
          fechaEnvio,
          items: lineas.map((l) => ({ insumoId: l.insumoId, cantidadEnviada: parseCantidad(l.enviada) ?? 0 })),
        })
      },
      `Pedido #${pedido.numero} enviado a ${pedido.destinoDeposito.nombre}`
    )

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoPedido({ ...pedido, nota: nota || null }))
      toast.success('Pedido copiado')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  const set = (i: number, campo: 'pedida' | 'enviada', v: string) =>
    setLineas((ls) =>
      ls.map((l, j) => {
        if (j !== i) return l
        // Mientras nadie tocó lo enviado, acompaña a lo pedido.
        const sigue = campo === 'pedida' && l.enviada === l.pedida
        return { ...l, [campo]: v, ...(sigue ? { enviada: v } : {}) }
      })
    )

  const editaPedida = pendiente && edita
  const editaEnviada = pendiente && despacha
  const mostrarEnviada = despacha || pedido.estado === 'enviado'

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Pedido #{pedido.numero} · {pedido.destinoDeposito.nombre}
          </DialogTitle>
          <DialogDescription>
            {pedido.origenDeposito.nombre} → {pedido.destinoDeposito.nombre}
            {pedido.fechaVentas && ` · ventas del ${fmtFecha(pedido.fechaVentas)}`}
            {pedido.origen === 'ventas' && ' · generado automáticamente'}
            {pedido.estado === 'enviado' && ` · enviado el ${fmtFecha(pedido.fechaEnvio)}`}
            {pedido.estado === 'cancelado' && ' · cancelado'}
          </DialogDescription>
        </DialogHeader>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="text-left font-medium px-3 py-2">Insumo</th>
                <th className="text-right font-medium px-3 py-2">Vendido</th>
                <th className="text-right font-medium px-3 py-2">Pedido</th>
                {mostrarEnviada && <th className="text-right font-medium px-3 py-2">Enviado</th>}
                {editaPedida && <th className="w-8" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {lineas.map((l, i) => {
                const env = parseCantidad(l.enviada)
                const ped = parseCantidad(l.pedida)
                const difiere = typeof env === 'number' && typeof ped === 'number' && Math.abs(env - ped) > 1e-9
                return (
                  <tr key={l.insumoId}>
                    <td className="px-3 py-1.5">
                      {l.nombre}
                      <span className="text-xs text-slate-400 ml-1">{l.unidad}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-400 tabular-nums">{fmtCant(l.vendida) || '—'}</td>
                    <td className="px-3 py-1.5 text-right">
                      {editaPedida ? (
                        <Input
                          inputMode="decimal"
                          value={l.pedida}
                          onChange={(e) => set(i, 'pedida', e.target.value)}
                          className={`w-24 h-8 text-right tabular-nums ml-auto ${ped === undefined ? 'border-red-400' : ''}`}
                        />
                      ) : (
                        <span className="tabular-nums">{l.pedida || '0'}</span>
                      )}
                    </td>
                    {mostrarEnviada && (
                      <td className="px-3 py-1.5 text-right">
                        {editaEnviada ? (
                          <Input
                            inputMode="decimal"
                            value={l.enviada}
                            onChange={(e) => set(i, 'enviada', e.target.value)}
                            className={`w-24 h-8 text-right tabular-nums ml-auto ${
                              env === undefined ? 'border-red-400' : difiere ? 'border-amber-400 bg-amber-50' : ''
                            }`}
                          />
                        ) : (
                          <span className={`tabular-nums ${difiere ? 'text-amber-700 font-medium' : ''}`}>
                            {pedido.estado === 'enviado' ? l.enviada || '0' : '—'}
                          </span>
                        )}
                      </td>
                    )}
                    {editaPedida && (
                      <td className="pr-2">
                        <button
                          type="button"
                          onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}
                          className="text-slate-300 hover:text-red-600"
                          title="Quitar"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
              {lineas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                    Sin insumos. Agregá lo que necesitás.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {(editaPedida || editaEnviada) && disponibles.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={agregar}
              onChange={(e) => setAgregar(e.target.value)}
              className="flex-1 h-9 border border-slate-200 rounded-md px-2 text-sm bg-white"
            >
              <option value="">Agregar insumo…</option>
              {disponibles.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nombre} ({i.unidadBase})
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              disabled={!agregar}
              onClick={() => {
                const ins = insumos.find((i) => i.id === agregar)
                if (!ins) return
                setLineas((ls) => [
                  ...ls,
                  { insumoId: ins.id, nombre: ins.nombre, unidad: ins.unidadBase, vendida: null, pedida: editaPedida ? '' : '0', enviada: '' },
                ])
                setAgregar('')
              }}
              className="gap-1"
            >
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          </div>
        )}

        {editaPedida ? (
          <Textarea placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} rows={2} />
        ) : (
          pedido.nota && <p className="text-sm text-slate-600 bg-slate-50 rounded-md px-3 py-2">{pedido.nota}</p>
        )}

        {editaEnviada && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            Fecha de envío
            <Input type="date" value={fechaEnvio} max={hoyAR()} onChange={(e) => e.target.value && setFechaEnvio(e.target.value)} className="w-auto h-8" />
            <span className="text-xs text-slate-400">Desde ese día sale del central y entra a {pedido.destinoDeposito.nombre}.</span>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            {pendiente && edita && (
              <Button
                variant="ghost"
                className="text-red-600 hover:text-red-700"
                disabled={!!ocupado}
                onClick={() => accion('cancelar', () => llamar(`/api/pedidos/${pedido.id}`, 'PATCH', { estado: 'cancelado' }), 'Pedido cancelado')}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Cancelar pedido
              </Button>
            )}
            {pedido.estado === 'cancelado' && edita && (
              <Button
                variant="ghost"
                disabled={!!ocupado}
                onClick={() => accion('reabrir', () => llamar(`/api/pedidos/${pedido.id}`, 'PATCH', { estado: 'pendiente' }), 'Pedido reabierto')}
              >
                <Undo2 className="h-4 w-4 mr-1" /> Reabrir
              </Button>
            )}
            {pedido.estado === 'enviado' && despacha && (
              <Button
                variant="ghost"
                className="text-red-600 hover:text-red-700"
                disabled={!!ocupado}
                onClick={() => accion('anular', () => llamar(`/api/pedidos/despacho/${pedido.id}`, 'DELETE'), 'Envío anulado: el pedido volvió a pendiente')}
              >
                <Undo2 className="h-4 w-4 mr-1" /> Anular envío
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={copiar} className="gap-1">
              <Copy className="h-4 w-4" /> Copiar
            </Button>
            {editaPedida && (
              <Button
                variant="outline"
                disabled={!pedidoCambio || invalidas || !!ocupado}
                onClick={() => accion('guardar', guardarPedido, 'Pedido guardado', false)}
              >
                {ocupado === 'guardar' && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Guardar
              </Button>
            )}
            {editaEnviada && (
              <Button disabled={invalidas || lineas.length === 0 || !!ocupado} onClick={enviar} className="gap-1">
                {ocupado === 'enviar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Registrar envío
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

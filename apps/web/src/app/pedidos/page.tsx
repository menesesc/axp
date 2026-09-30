'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUser } from '@/hooks/use-user'
import { SECCION } from '@/lib/permisos'
import { ayerAR, hoyAR } from '@/lib/fechas'
import { PedidoDialog } from '@/components/pedidos/pedido-dialog'
import { PlantillasTab } from '@/components/pedidos/plantillas-tab'
import { fmtCant, fmtFecha, type Catalogo, type Pedido } from '@/components/pedidos/tipos'
import { Loader2, PackageCheck, Plus, RefreshCw, Send, Sparkles } from 'lucide-react'

type Estado = 'pendiente' | 'enviado' | 'cancelado'

const ESTADO_LABEL: Record<Estado, string> = { pendiente: 'Pendientes', enviado: 'Enviados', cancelado: 'Cancelados' }

export default function PedidosPage() {
  const { isLoading, canEdit } = useUser()
  const edita = canEdit(SECCION.CONCILIACION_PEDIDOS)
  const despacha = canEdit(SECCION.CONCILIACION_DESPACHO)
  const qc = useQueryClient()
  const [estado, setEstado] = useState<Estado>('pendiente')
  const [destinoId, setDestinoId] = useState('')
  const [abierto, setAbierto] = useState<Pedido | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [enviando, setEnviando] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)

  const { data: catalogo } = useQuery({
    queryKey: ['pedidos-catalogo'],
    queryFn: async () => {
      const res = await fetch('/api/pedidos/catalogo')
      if (!res.ok) throw new Error('Error cargando datos')
      return res.json() as Promise<Catalogo>
    },
    enabled: !isLoading,
  })

  const { data, isLoading: cargando } = useQuery({
    queryKey: ['pedidos', estado, destinoId],
    queryFn: async () => {
      const p = new URLSearchParams({ estado })
      if (destinoId) p.set('destinoId', destinoId)
      const res = await fetch(`/api/pedidos?${p}`)
      if (!res.ok) throw new Error('Error cargando pedidos')
      return res.json() as Promise<{ pedidos: Pedido[] }>
    },
    enabled: !isLoading,
  })
  const pedidos = useMemo(() => data?.pedidos ?? [], [data])

  if (isLoading) return null

  const destinos = (catalogo?.depositos ?? []).filter((d) => !d.esCentral)

  const enviarSeleccion = async () => {
    setEnviando(true)
    try {
      const res = await fetch('/api/pedidos/despacho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...seleccion] }),
      })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error || 'Error')
      toast.success(`${r.enviados} pedido${r.enviados === 1 ? '' : 's'} enviado${r.enviados === 1 ? '' : 's'}`)
      setSeleccion(new Set())
      qc.invalidateQueries({ queryKey: ['pedidos'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setEnviando(false)
    }
  }

  const sincronizar = async () => {
    setSincronizando(true)
    try {
      const res = await fetch('/api/pedidos/sincronizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: ayerAR() }),
      })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error || 'Error')
      toast.success(
        r.creados + r.actualizados > 0
          ? `Ventas del ${fmtFecha(r.fecha)}: ${r.creados} pedidos creados, ${r.actualizados} actualizados`
          : `Ventas del ${fmtFecha(r.fecha)}: no hay cambios (revisá recetas y depósitos de salida)`
      )
      qc.invalidateQueries({ queryKey: ['pedidos'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setSincronizando(false)
    }
  }

  const toggle = (id: string) =>
    setSeleccion((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <DashboardLayout>
      <Header
        title="Pedidos internos"
        description="Cada depósito le pide al central. Los pedidos del día se arman solos con lo vendido según las recetas; el central registra lo que envía y el stock se mueve de un depósito a otro."
        actions={
          edita ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={sincronizar} disabled={sincronizando} className="gap-1" title="Regenera los pedidos automáticos con las ventas de ayer">
                {sincronizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Actualizar desde ventas
              </Button>
              <Button onClick={() => setNuevo(true)} className="gap-1">
                <Plus className="h-4 w-4" /> Nuevo pedido
              </Button>
            </div>
          ) : undefined
        }
      />

      <Tabs defaultValue="pedidos">
        <TabsList>
          <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
          <TabsTrigger value="plantillas">Plantillas</TabsTrigger>
        </TabsList>

        <TabsContent value="pedidos" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-slate-200 p-0.5 text-sm bg-white">
              {(Object.keys(ESTADO_LABEL) as Estado[]).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    setEstado(e)
                    setSeleccion(new Set())
                  }}
                  className={`px-3 py-1 rounded ${estado === e ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                >
                  {ESTADO_LABEL[e]}
                </button>
              ))}
            </div>
            <div className="inline-flex flex-wrap gap-1">
              {[{ id: '', nombre: 'Todos' }, ...destinos].map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDestinoId(d.id)}
                  className={`rounded-full border px-3 py-1 text-sm ${destinoId === d.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
                >
                  {d.nombre}
                </button>
              ))}
            </div>
            {despacha && estado === 'pendiente' && seleccion.size > 0 && (
              <Button onClick={enviarSeleccion} disabled={enviando} className="ml-auto gap-1">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar {seleccion.size} tal cual
              </Button>
            )}
          </div>

          {cargando ? (
            <div className="bg-white border rounded-lg p-12 text-center text-slate-400 text-sm">Cargando…</div>
          ) : pedidos.length === 0 ? (
            <div className="bg-white border rounded-lg p-12 text-center text-sm text-slate-500">
              <PackageCheck className="h-10 w-10 mx-auto mb-2 text-slate-300" />
              {estado === 'pendiente'
                ? 'No hay pedidos pendientes. Se generan solos al llegar los cierres de venta.'
                : `No hay pedidos ${ESTADO_LABEL[estado].toLowerCase()}.`}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {pedidos.map((p) => {
                const conCantidad = p.items.filter((it) => (p.estado === 'enviado' ? (it.cantidadEnviada ?? 0) : it.cantidadPedida) > 0)
                return (
                  <div
                    key={p.id}
                    className={`bg-white border rounded-lg p-4 cursor-pointer hover:border-slate-400 transition-colors ${seleccion.has(p.id) ? 'ring-2 ring-slate-900' : ''}`}
                    onClick={() => setAbierto(p)}
                  >
                    <div className="flex items-start gap-3 mb-2">
                      {despacha && p.estado === 'pendiente' && (
                        <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
                          <Checkbox checked={seleccion.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">
                          {p.destinoDeposito.nombre} <span className="text-slate-400 font-normal">#{p.numero}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {p.fechaVentas ? `Ventas del ${fmtFecha(p.fechaVentas)}` : `Creado el ${fmtFecha(p.createdAt)}`}
                          {p.estado === 'enviado' && ` · enviado ${fmtFecha(p.fechaEnvio)}`}
                        </p>
                      </div>
                      {p.origen === 'ventas' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-violet-700 bg-violet-50 rounded-full px-2 py-0.5 shrink-0">
                          <Sparkles className="h-3 w-3" /> Automático
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-600 bg-slate-100 rounded-full px-2 py-0.5 shrink-0">Manual</span>
                      )}
                    </div>
                    <ul className="text-sm text-slate-600 space-y-0.5">
                      {conCantidad.slice(0, 5).map((it) => (
                        <li key={it.insumoId} className="flex justify-between gap-2">
                          <span className="truncate">{it.nombre}</span>
                          <span className="tabular-nums text-slate-500 shrink-0">
                            {fmtCant(p.estado === 'enviado' ? it.cantidadEnviada : it.cantidadPedida)} {it.unidad}
                          </span>
                        </li>
                      ))}
                      {conCantidad.length > 5 && <li className="text-xs text-slate-400">y {conCantidad.length - 5} más…</li>}
                      {conCantidad.length === 0 && <li className="text-xs text-slate-400">Sin insumos cargados</li>}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="plantillas" className="mt-4">
          {catalogo ? <PlantillasTab catalogo={catalogo} edita={edita} /> : <p className="text-sm text-slate-400">Cargando…</p>}
        </TabsContent>
      </Tabs>

      {abierto && catalogo && (
        <PedidoDialog pedido={abierto} insumos={catalogo.insumos} edita={edita} despacha={despacha} onClose={() => setAbierto(null)} />
      )}
      {nuevo && catalogo && (
        <NuevoPedidoDialog
          catalogo={catalogo}
          onClose={() => setNuevo(false)}
          onCreado={(p) => {
            setNuevo(false)
            setEstado('pendiente')
            qc.invalidateQueries({ queryKey: ['pedidos'] })
            setAbierto(p)
          }}
        />
      )}
    </DashboardLayout>
  )
}

/**
 * Pedido manual: destino + (opcional) lo vendido en un día + (opcional) una
 * plantilla. Se crea y se abre para ajustar cantidades.
 */
function NuevoPedidoDialog({
  catalogo,
  onClose,
  onCreado,
}: {
  catalogo: Catalogo
  onClose: () => void
  onCreado: (p: Pedido) => void
}) {
  const destinos = catalogo.depositos.filter((d) => !d.esCentral)
  const [destinoId, setDestinoId] = useState(destinos[0]?.id ?? '')
  const [conVentas, setConVentas] = useState(true)
  const [fechaVentas, setFechaVentas] = useState(hoyAR())
  const [plantillaId, setPlantillaId] = useState('')
  const [creando, setCreando] = useState(false)
  const plantillas = catalogo.plantillas.filter((p) => !p.destinoId || p.destinoId === destinoId)

  const crear = async () => {
    setCreando(true)
    try {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinoId, fechaVentas: conVentas ? fechaVentas : null, plantillaId: plantillaId || null }),
      })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error || 'Error')
      onCreado(r.pedido)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setCreando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo pedido</DialogTitle>
          <DialogDescription>Se sugiere lo vendido en el día; después ajustás las cantidades.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500">Depósito que pide</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {destinos.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDestinoId(d.id)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${destinoId === d.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200'}`}
                >
                  {d.nombre}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={conVentas} onCheckedChange={(v) => setConVentas(v === true)} />
            Sugerir lo vendido el
            <Input
              type="date"
              value={fechaVentas}
              max={hoyAR()}
              disabled={!conVentas}
              onChange={(e) => e.target.value && setFechaVentas(e.target.value)}
              className="w-auto h-8"
            />
          </label>
          <div>
            <label className="text-xs text-slate-500">Plantilla (opcional)</label>
            <select
              value={plantillaId}
              onChange={(e) => setPlantillaId(e.target.value)}
              className="w-full h-9 border border-slate-200 rounded-md px-2 text-sm bg-white mt-1"
            >
              <option value="">Sin plantilla</option>
              {plantillas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.items.length} insumos)
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={crear} disabled={!destinoId || creando}>
            {creando && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Crear pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

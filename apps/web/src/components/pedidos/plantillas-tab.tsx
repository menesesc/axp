'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FileStack, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { fmtCant, parseCantidad, type Catalogo, type Plantilla } from './tipos'

/**
 * Plantillas de pedido: listas fijas para lo que no sale de las recetas
 * (limpieza, descartables, mise en place…). Pueden incluir insumos que
 * también están en recetas. Se usan al crear un pedido nuevo.
 */
export function PlantillasTab({ catalogo, edita }: { catalogo: Catalogo; edita: boolean }) {
  const [editando, setEditando] = useState<Plantilla | 'nueva' | null>(null)
  const qc = useQueryClient()
  const nombreDeposito = (id: string | null) => catalogo.depositos.find((d) => d.id === id)?.nombre

  const eliminar = async (p: Plantilla) => {
    if (!window.confirm(`¿Eliminar la plantilla "${p.nombre}"?`)) return
    const res = await fetch(`/api/pedidos/plantillas/${p.id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('No se pudo eliminar')
      return
    }
    toast.success('Plantilla eliminada')
    qc.invalidateQueries({ queryKey: ['pedidos-catalogo'] })
  }

  return (
    <div className="space-y-4">
      {edita && (
        <Button onClick={() => setEditando('nueva')} className="gap-1">
          <Plus className="h-4 w-4" /> Nueva plantilla
        </Button>
      )}
      {catalogo.plantillas.length === 0 ? (
        <div className="bg-white border rounded-lg p-10 text-center text-sm text-slate-500">
          <FileStack className="h-10 w-10 mx-auto mb-2 text-slate-300" />
          Todavía no hay plantillas. Creá una para lo que pedís seguido y no sale de las recetas.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {catalogo.plantillas.map((p) => (
            <div key={p.id} className="bg-white border rounded-lg p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-medium">{p.nombre}</p>
                  <p className="text-xs text-slate-400">{nombreDeposito(p.destinoId) ?? 'Cualquier depósito'} · {p.items.length} insumos</p>
                </div>
                {edita && (
                  <div className="flex">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditando(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600" onClick={() => eliminar(p)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              <ul className="text-sm text-slate-600 space-y-0.5 max-h-40 overflow-y-auto">
                {p.items.map((it) => (
                  <li key={it.insumoId} className="flex justify-between">
                    <span className="truncate">{it.nombre}</span>
                    <span className="tabular-nums text-slate-500 shrink-0 ml-2">
                      {fmtCant(it.cantidad)} {it.unidad}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {editando && (
        <PlantillaDialog catalogo={catalogo} plantilla={editando === 'nueva' ? null : editando} onClose={() => setEditando(null)} />
      )}
    </div>
  )
}

function PlantillaDialog({ catalogo, plantilla, onClose }: { catalogo: Catalogo; plantilla: Plantilla | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState(plantilla?.nombre ?? '')
  const [destinoId, setDestinoId] = useState(plantilla?.destinoId ?? '')
  const [lineas, setLineas] = useState(
    (plantilla?.items ?? []).map((it) => ({ ...it, texto: String(it.cantidad).replace('.', ',') }))
  )
  const [agregar, setAgregar] = useState('')
  const [guardando, setGuardando] = useState(false)

  const disponibles = catalogo.insumos.filter((i) => !lineas.some((l) => l.insumoId === i.id))
  const invalidas = lineas.some((l) => {
    const v = parseCantidad(l.texto)
    return v === undefined || v === null || v <= 0
  })

  const guardar = async () => {
    setGuardando(true)
    try {
      const res = await fetch(plantilla ? `/api/pedidos/plantillas/${plantilla.id}` : '/api/pedidos/plantillas', {
        method: plantilla ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          destinoId: destinoId || null,
          items: lineas.map((l) => ({ insumoId: l.insumoId, cantidad: parseCantidad(l.texto) })),
        }),
      })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error || 'Error al guardar')
      toast.success('Plantilla guardada')
      qc.invalidateQueries({ queryKey: ['pedidos-catalogo'] })
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plantilla ? 'Editar plantilla' : 'Nueva plantilla'}</DialogTitle>
          <DialogDescription>Cantidades fijas que se suman a un pedido al elegir esta plantilla.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[1fr_160px] gap-2">
          <Input placeholder="Nombre (ej. Limpieza semanal)" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <select value={destinoId} onChange={(e) => setDestinoId(e.target.value)} className="h-10 border border-slate-200 rounded-md px-2 text-sm bg-white">
            <option value="">Cualquier depósito</option>
            {catalogo.depositos
              .filter((d) => !d.esCentral)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
          </select>
        </div>
        <div className="border rounded-lg divide-y">
          {lineas.map((l, i) => (
            <div key={l.insumoId} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="flex-1 truncate">{l.nombre}</span>
              <Input
                inputMode="decimal"
                value={l.texto}
                onChange={(e) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))}
                className="w-24 h-8 text-right tabular-nums"
              />
              <span className="text-xs text-slate-500 w-6">{l.unidad}</span>
              <button type="button" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {lineas.length === 0 && <p className="px-3 py-4 text-center text-sm text-slate-400">Agregá insumos a la plantilla.</p>}
        </div>
        <select
          value={agregar}
          onChange={(e) => {
            const ins = catalogo.insumos.find((x) => x.id === e.target.value)
            if (ins) setLineas((ls) => [...ls, { insumoId: ins.id, nombre: ins.nombre, unidad: ins.unidadBase, cantidad: 0, texto: '' }])
            setAgregar('')
          }}
          className="h-9 border border-slate-200 rounded-md px-2 text-sm bg-white"
        >
          <option value="">Agregar insumo…</option>
          {disponibles.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nombre} ({i.unidadBase})
            </option>
          ))}
        </select>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={!nombre.trim() || lineas.length === 0 || invalidas || guardando}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { CbuInline, etiquetaDoc } from './batch-shared'
import { formatCurrency, formatNumeroOrden, cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, FileSpreadsheet, Loader2, Pencil, Trash2, Layers, AlertTriangle } from 'lucide-react'

interface Borrador {
  id: string
  numero: number
  fecha: string
  montoTotal: number
  nota: string | null
  proveedor: { id: string; razonSocial: string; cuit: string | null; cbu: string | null }
  documentos: Array<{ id: string; tipo: string; letra: string | null; numeroCompleto: string | null; montoAplicado: number }>
  problemas: string[]
}

/**
 * Bandeja "A transferir": los borradores listos para el banco. Se eligen los
 * que salen hoy y se arma el lote, que los emite y genera el archivo Galicia.
 */
export function TransferTray({ canEdit }: { canEdit: boolean }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const { data, isLoading } = useQuery<{ borradores: Borrador[] }>({
    queryKey: ['pagos-bandeja'],
    queryFn: async () => {
      const res = await fetch('/api/pagos/bandeja')
      if (!res.ok) throw new Error('Error al cargar')
      return res.json()
    },
  })
  const borradores = useMemo(() => data?.borradores ?? [], [data])
  const listos = borradores.filter((b) => b.problemas.length === 0)
  const seleccionados = listos.filter((b) => sel.has(b.id))
  const totalSel = seleccionados.reduce((s, b) => s + b.montoTotal, 0)

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['pagos-bandeja'] })
    queryClient.invalidateQueries({ queryKey: ['pagos'] })
    queryClient.invalidateQueries({ queryKey: ['pagos-stats'] })
  }

  const armarLote = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/pagos/lotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagoIds: seleccionados.map((b) => b.id) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'No se pudo armar el lote')
      return d as { loteId: string }
    },
    onSuccess: ({ loteId }) => {
      refrescar()
      queryClient.invalidateQueries({ queryKey: ['pagos-lotes'] })
      router.push(`/pagos/lotes/${loteId}?descargar=1`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const eliminar = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/pagos/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('No se pudo eliminar')
    },
    onSuccess: (_d, id) => {
      setSel((s) => {
        const n = new Set(s)
        n.delete(id)
        return n
      })
      setConfirmDelete(null)
      refrescar()
      toast.success('Borrador eliminado')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    set((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const todosSel = listos.length > 0 && seleccionados.length === listos.length

  if (isLoading) {
    return <div className="bg-white border rounded-lg p-8 text-center text-sm text-slate-400">Cargando borradores…</div>
  }

  if (borradores.length === 0) {
    return (
      <div className="bg-white border rounded-lg p-10 text-center">
        <Layers className="h-8 w-8 mx-auto text-slate-300 mb-2" />
        <p className="text-sm font-medium text-slate-600">No hay borradores para transferir</p>
        <p className="text-xs text-slate-400 mt-1">Usá “Pagar en lote” para elegir qué documentos pagar de cada proveedor.</p>
        {canEdit && (
          <Button variant="primary" size="sm" className="mt-4" asChild>
            <Link href="/pagos/lote">Pagar en lote</Link>
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-slate-50 text-xs font-medium text-slate-500">
          <Checkbox
            checked={todosSel ? true : seleccionados.length > 0 ? 'indeterminate' : false}
            onCheckedChange={() => setSel(todosSel ? new Set() : new Set(listos.map((b) => b.id)))}
            disabled={listos.length === 0}
            aria-label="Seleccionar todos los borradores listos"
          />
          <span className="flex-1">
            {borradores.length} borrador{borradores.length !== 1 && 'es'}
            {listos.length < borradores.length && ` · ${borradores.length - listos.length} con algo pendiente`}
          </span>
          <span>Monto</span>
          <span className="w-16" />
        </div>
        <div className="divide-y">
          {borradores.map((b) => {
            const abierto = abiertos.has(b.id)
            const listo = b.problemas.length === 0
            return (
              <div key={b.id} className={cn(sel.has(b.id) && 'bg-blue-50/40')}>
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <Checkbox
                    checked={sel.has(b.id)}
                    onCheckedChange={() => toggle(setSel, b.id)}
                    disabled={!listo}
                    aria-label={`Incluir OP ${b.numero}`}
                  />
                  <button type="button" onClick={() => toggle(setAbiertos, b.id)} className="text-slate-400" aria-label="Ver documentos">
                    {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-400">OP {formatNumeroOrden(b.numero)}</span>
                      <span className="text-sm font-medium text-slate-800 truncate">{b.proveedor.razonSocial}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <CbuInline proveedorId={b.proveedor.id} cbu={b.proveedor.cbu} compact onSaved={refrescar} />
                      <span className="text-[11px] text-slate-400">
                        {b.documentos.length} doc{b.documentos.length !== 1 && 's'}
                      </span>
                      {b.problemas
                        .filter((p) => p !== 'Proveedor sin CBU')
                        .map((p) => (
                          <span key={p} className="inline-flex items-center gap-1 text-[11px] text-amber-700">
                            <AlertTriangle className="h-3 w-3" />
                            {p}
                          </span>
                        ))}
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(b.montoTotal)}</span>
                  <div className="w-16 flex justify-end gap-0.5">
                    {canEdit &&
                      (confirmDelete === b.id ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-2 text-xs"
                          onClick={() => eliminar.mutate(b.id)}
                          disabled={eliminar.isPending}
                          onBlur={() => setConfirmDelete(null)}
                        >
                          Borrar
                        </Button>
                      ) : (
                        <>
                          <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                            <Link href={`/pagos/${b.id}/editar`} aria-label="Editar borrador">
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => setConfirmDelete(b.id)} aria-label="Eliminar borrador">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ))}
                  </div>
                </div>
                {abierto && (
                  <div className="pl-16 pr-24 pb-2.5 space-y-0.5">
                    {b.documentos.map((d) => (
                      <div key={d.id} className="flex justify-between text-xs">
                        <span className="font-mono text-slate-600">{etiquetaDoc(d)}</span>
                        <span className={cn('tabular-nums', d.montoAplicado < 0 ? 'text-emerald-700' : 'text-slate-600')}>
                          {formatCurrency(d.montoAplicado)}
                        </span>
                      </div>
                    ))}
                    {b.nota && <p className="text-xs text-slate-400 italic pt-1">{b.nota}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {canEdit && seleccionados.length > 0 && (
        <div className="sticky bottom-4 z-30 rounded-lg border bg-white/95 backdrop-blur shadow-lg px-4 py-3 flex items-center gap-4 flex-wrap">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800">
              {seleccionados.length} transferencia{seleccionados.length !== 1 && 's'}
            </p>
            <p className="text-xs text-slate-500">Se emiten las órdenes y se descarga el archivo para Galicia Office</p>
          </div>
          <p className="text-lg font-semibold tabular-nums text-slate-900">{formatCurrency(totalSel)}</p>
          <Button variant="primary" onClick={() => armarLote.mutate()} disabled={armarLote.isPending}>
            {armarLote.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Generar archivo Galicia
          </Button>
        </div>
      )}
    </div>
  )
}

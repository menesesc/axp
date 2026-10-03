'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { CbuInline, etiquetaDoc, fechaCorta } from '@/components/payments/batch-shared'
import { useUser } from '@/hooks/use-user'
import { formatCurrency, cn } from '@/lib/utils'
import { hoyAR } from '@/lib/fechas'
import { toast } from 'sonner'
import { ArrowLeft, ChevronDown, ChevronRight, Loader2, Search, Layers } from 'lucide-react'

interface Doc {
  id: string
  tipo: string
  letra: string | null
  numeroCompleto: string | null
  fechaEmision: string | null
  fechaVencimiento: string | null
  total: number
}

interface Grupo {
  proveedor: { id: string; razonSocial: string; cuit: string | null; cbu: string | null }
  documentos: Doc[]
}

/**
 * Pagar en lote: todos los proveedores con documentos pendientes en una sola
 * pantalla. Se tildan los documentos a pagar (nada viene tildado: la decisión
 * de qué se paga sigue siendo explícita, como en el wizard) y se crea un
 * borrador por proveedor con una transferencia por el total.
 */
export default function PagarEnLotePage() {
  const { clienteId, isAdmin } = useUser()
  const router = useRouter()
  const queryClient = useQueryClient()
  const hoy = hoyAR()

  const [fecha, setFecha] = useState(hoy)
  const [search, setSearch] = useState('')
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [cbuLocal, setCbuLocal] = useState<Record<string, string>>({})

  const { data, isLoading } = useQuery<{ proveedores: Grupo[] }>({
    queryKey: ['pagos-lote-pendientes', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/pagos/lote')
      if (!res.ok) throw new Error('Error al cargar')
      return res.json()
    },
    enabled: !!clienteId,
  })

  const grupos = useMemo(() => {
    const q = search.trim().toLowerCase()
    const all = data?.proveedores ?? []
    return q ? all.filter((g) => g.proveedor.razonSocial.toLowerCase().includes(q) || g.proveedor.cuit?.includes(q)) : all
  }, [data, search])

  const resumen = useMemo(() => {
    const porProveedor = (data?.proveedores ?? [])
      .map((g) => {
        const docs = g.documentos.filter((d) => sel.has(d.id))
        return { g, docs, total: docs.reduce((s, d) => s + d.total, 0) }
      })
      .filter((x) => x.docs.length > 0)
    return {
      porProveedor,
      documentos: porProveedor.reduce((s, x) => s + x.docs.length, 0),
      total: porProveedor.reduce((s, x) => s + x.total, 0),
      invalidos: porProveedor.filter((x) => x.total <= 0),
    }
  }, [data, sel])

  const crear = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/pagos/lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha,
          items: resumen.porProveedor.map((x) => ({ proveedorId: x.g.proveedor.id, documentoIds: x.docs.map((d) => d.id) })),
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'No se pudieron crear los borradores')
      return d as { pagoIds: string[] }
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ['pagos'] })
      queryClient.invalidateQueries({ queryKey: ['pagos-stats'] })
      queryClient.invalidateQueries({ queryKey: ['pagos-bandeja'] })
      toast.success(`${d.pagoIds.length} borradores creados`)
      router.push('/pagos?vista=transferir')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleDoc = (id: string) =>
    setSel((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const toggleProveedor = (g: Grupo) =>
    setSel((s) => {
      const n = new Set(s)
      const todos = g.documentos.every((d) => n.has(d.id))
      for (const d of g.documentos) {
        if (todos) n.delete(d.id)
        else n.add(d.id)
      }
      return n
    })

  const toggleAbierto = (id: string) =>
    setAbiertos((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  if (!clienteId) return null
  if (!isAdmin) {
    return (
      <DashboardLayout>
        <p className="text-center py-8 text-sm text-slate-500">No tenés permisos para crear órdenes de pago</p>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/pagos" aria-label="Volver">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Header
            title="Pagar en lote"
            description="Elegí qué documentos pagar de cada proveedor. Se crea un borrador por proveedor, con una transferencia por el total."
          />
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Fecha de las órdenes</label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-40 h-9" />
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Buscar proveedor o CUIT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-64 h-9 text-sm"
            />
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAbiertos(new Set(grupos.map((g) => g.proveedor.id)))}>
              Expandir todo
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAbiertos(new Set())}>
              Contraer
            </Button>
          </div>
        </div>

        <div className="bg-white border rounded-lg divide-y">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-slate-400">Cargando documentos pendientes…</div>
          ) : grupos.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No hay documentos confirmados pendientes de pago</div>
          ) : (
            grupos.map((g) => {
              const abierto = abiertos.has(g.proveedor.id)
              const selDocs = g.documentos.filter((d) => sel.has(d.id))
              const totalPend = g.documentos.reduce((s, d) => s + d.total, 0)
              const totalSel = selDocs.reduce((s, d) => s + d.total, 0)
              const estadoCheck =
                selDocs.length === 0 ? false : selDocs.length === g.documentos.length ? true : ('indeterminate' as const)
              const cbu = cbuLocal[g.proveedor.id] ?? g.proveedor.cbu
              return (
                <div key={g.proveedor.id}>
                  <div
                    className={cn('flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50', selDocs.length > 0 && 'bg-blue-50/40')}
                    onClick={() => toggleAbierto(g.proveedor.id)}
                  >
                    <Checkbox
                      checked={estadoCheck}
                      onCheckedChange={() => toggleProveedor(g)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Seleccionar todos los documentos de ${g.proveedor.razonSocial}`}
                    />
                    {abierto ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{g.proveedor.razonSocial}</p>
                      <div className="mt-0.5">
                        <CbuInline
                          proveedorId={g.proveedor.id}
                          cbu={cbu}
                          compact
                          onSaved={(v) => setCbuLocal((m) => ({ ...m, [g.proveedor.id]: v }))}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {selDocs.length > 0 ? (
                        <>
                          <p className={cn('text-sm font-semibold tabular-nums', totalSel <= 0 ? 'text-red-600' : 'text-blue-700')}>
                            {formatCurrency(totalSel)}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {selDocs.length} de {g.documentos.length} docs · pend. {formatCurrency(totalPend)}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium tabular-nums text-slate-700">{formatCurrency(totalPend)}</p>
                          <p className="text-[11px] text-slate-400">{g.documentos.length} docs pendientes</p>
                        </>
                      )}
                    </div>
                  </div>

                  {abierto && (
                    <div className="px-4 pb-3 pl-14">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[11px] uppercase tracking-wide text-slate-400">
                            <th className="w-8" />
                            <th className="text-left font-medium py-1">Documento</th>
                            <th className="text-left font-medium py-1">Emisión</th>
                            <th className="text-left font-medium py-1">Vencimiento</th>
                            <th className="text-right font-medium py-1">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.documentos.map((d) => {
                            const vencido = !!d.fechaVencimiento && d.fechaVencimiento < hoy
                            return (
                              <tr key={d.id} className="border-t border-slate-100 cursor-pointer hover:bg-slate-50" onClick={() => toggleDoc(d.id)}>
                                <td className="py-1.5">
                                  <Checkbox checked={sel.has(d.id)} onCheckedChange={() => toggleDoc(d.id)} onClick={(e) => e.stopPropagation()} aria-label={`Pagar ${etiquetaDoc(d)}`} />
                                </td>
                                <td className="py-1.5 font-mono text-xs text-slate-700">{etiquetaDoc(d)}</td>
                                <td className="py-1.5 text-xs text-slate-500">{fechaCorta(d.fechaEmision)}</td>
                                <td className={cn('py-1.5 text-xs', vencido ? 'text-red-600 font-medium' : 'text-slate-500')}>
                                  {fechaCorta(d.fechaVencimiento)}
                                  {vencido && ' · vencido'}
                                </td>
                                <td className={cn('py-1.5 text-right tabular-nums', d.total < 0 ? 'text-emerald-700' : 'text-slate-800')}>
                                  {formatCurrency(d.total)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
        {/* Barra de acción: queda pegada abajo mientras se recorre la lista */}
        {resumen.porProveedor.length > 0 && (
          <div className="sticky bottom-4 z-30 rounded-lg border bg-white/95 backdrop-blur shadow-lg">
            <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
              <Layers className="h-5 w-5 text-blue-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">
                  {resumen.porProveedor.length} proveedor{resumen.porProveedor.length !== 1 && 'es'} · {resumen.documentos} documento
                  {resumen.documentos !== 1 && 's'}
                </p>
                {resumen.invalidos.length > 0 ? (
                  <p className="text-xs text-red-600">
                    {resumen.invalidos.map((x) => x.g.proveedor.razonSocial).join(', ')}: el total debe ser mayor a cero
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">Se crean como borradores: podés revisarlos antes de generar el archivo del banco</p>
                )}
              </div>
              <p className="text-lg font-semibold tabular-nums text-slate-900">{formatCurrency(resumen.total)}</p>
              <Button variant="primary" onClick={() => crear.mutate()} disabled={crear.isPending || resumen.invalidos.length > 0}>
                {crear.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Crear {resumen.porProveedor.length} borrador{resumen.porProveedor.length !== 1 && 'es'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

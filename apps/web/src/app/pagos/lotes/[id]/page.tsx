'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { descargarArchivo, fechaCorta } from '@/components/payments/batch-shared'
import { useUser } from '@/hooks/use-user'
import { formatCurrency, formatNumeroOrden, cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  ArrowLeft,
  FileSpreadsheet,
  FileDown,
  UploadCloud,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Eye,
} from 'lucide-react'

interface Orden {
  id: string
  numero: number
  estado: string
  montoTotal: number
  comprobanteKey: string | null
  proveedor: { id: string; razonSocial: string; cuit: string | null; cbu: string | null }
  documentosCount: number
  descripcion: string
}

interface Lote {
  id: string
  numero: number
  fecha: string
  partesGalicia: number
  ordenes: Orden[]
}

interface PaginaLeida {
  archivo: number
  pagina: number
  nombre: string
  leido: { cbu: string | null; cuit: string | null; monto: number | null; operacion: string | null; fecha: string | null }
  pagoId: string | null
  coincidencia: 'exacta' | 'probable' | 'ninguna'
  motivo: string
}

const clavePagina = (p: { archivo: number; pagina: number }) => `${p.archivo}:${p.pagina}`

export default function LotePage() {
  // Next 14 / React 18: `params` no es una Promise ni existe `use()`.
  const { id } = useParams<{ id: string }>()
  const { clienteId, isAdmin } = useUser()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [archivos, setArchivos] = useState<File[]>([])
  const [paginas, setPaginas] = useState<PaginaLeida[] | null>(null)
  const [asignado, setAsignado] = useState<Record<string, string>>({})
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [descargando, setDescargando] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const { data, isLoading } = useQuery<{ lote: Lote }>({
    queryKey: ['pagos-lote', id],
    queryFn: async () => {
      const res = await fetch(`/api/pagos/lotes/${id}`)
      if (!res.ok) throw new Error('Lote no encontrado')
      return res.json()
    },
    enabled: !!clienteId,
  })
  const lote = data?.lote

  const descargarGalicia = async () => {
    if (!lote) return
    setDescargando('galicia')
    try {
      for (let parte = 1; parte <= lote.partesGalicia; parte++) {
        await descargarArchivo(`/api/pagos/lotes/${id}/galicia?parte=${parte}`, `Transferencias_lote${lote.numero}.xls`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo descargar')
    } finally {
      setDescargando(null)
    }
  }

  // Recién armado desde la bandeja: bajar el archivo una sola vez.
  const autoDescargado = useRef(false)
  useEffect(() => {
    if (!lote || autoDescargado.current) return
    const url = new URL(window.location.href)
    if (url.searchParams.get('descargar') !== '1') return
    autoDescargado.current = true
    url.searchParams.delete('descargar')
    window.history.replaceState(null, '', url)
    toast.success(`Lote ${lote.numero} armado — descargando archivo para Galicia`)
    descargarGalicia()
  }, [lote]) // eslint-disable-line react-hooks/exhaustive-deps

  const descargarPdfFinal = async () => {
    if (!lote) return
    setDescargando('pdf')
    try {
      await descargarArchivo(`/api/pagos/lotes/${id}/pdf`, `Lote${lote.numero}.pdf`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo descargar')
    } finally {
      setDescargando(null)
    }
  }

  const leer = async (files: File[]) => {
    const pdfs = files.filter((f) => f.type === 'application/pdf')
    if (pdfs.length === 0) {
      toast.error('Subí los comprobantes en PDF')
      return
    }
    setArchivos(pdfs)
    setLeyendo(true)
    setPaginas(null)
    try {
      const fd = new FormData()
      fd.append('modo', 'leer')
      pdfs.forEach((f) => fd.append('files', f))
      const res = await fetch(`/api/pagos/lotes/${id}/comprobantes`, { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'No se pudieron leer los comprobantes')
      setPaginas(d.paginas)
      const inicial: Record<string, string> = {}
      for (const p of d.paginas as PaginaLeida[]) if (p.pagoId) inicial[clavePagina(p)] = p.pagoId
      setAsignado(inicial)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al leer')
      setArchivos([])
    } finally {
      setLeyendo(false)
    }
  }

  const asignaciones = useMemo(
    () =>
      Object.entries(asignado)
        .filter(([, pagoId]) => pagoId)
        .map(([k, pagoId]) => {
          const [archivo, pagina] = k.split(':').map(Number)
          return { archivo: archivo!, pagina: pagina!, pagoId }
        }),
    [asignado]
  )
  const repetidas = useMemo(() => {
    const c = new Map<string, number>()
    for (const a of asignaciones) c.set(a.pagoId, (c.get(a.pagoId) ?? 0) + 1)
    return new Set([...c].filter(([, n]) => n > 1).map(([k]) => k))
  }, [asignaciones])

  const confirmar = async () => {
    setGuardando(true)
    try {
      const fd = new FormData()
      fd.append('modo', 'confirmar')
      fd.append('asignaciones', JSON.stringify(asignaciones))
      archivos.forEach((f) => fd.append('files', f))
      const res = await fetch(`/api/pagos/lotes/${id}/comprobantes`, { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'No se pudieron guardar')
      toast.success(`${d.guardados} comprobante${d.guardados !== 1 ? 's' : ''} guardado${d.guardados !== 1 ? 's' : ''} — órdenes marcadas como pagadas`)
      setPaginas(null)
      setArchivos([])
      setAsignado({})
      queryClient.invalidateQueries({ queryKey: ['pagos-lote', id] })
      queryClient.invalidateQueries({ queryKey: ['pagos-lotes'] })
      queryClient.invalidateQueries({ queryKey: ['pagos'] })
      queryClient.invalidateQueries({ queryKey: ['pagos-stats'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  if (!clienteId) return null

  if (isLoading || !lote) {
    return (
      <DashboardLayout>
        <p className="py-8 text-center text-sm text-slate-400">{isLoading ? 'Cargando lote…' : 'Lote no encontrado'}</p>
      </DashboardLayout>
    )
  }

  const total = lote.ordenes.reduce((s, o) => s + o.montoTotal, 0)
  const conComprobante = lote.ordenes.filter((o) => o.comprobanteKey).length
  const pendientes = lote.ordenes.length - conComprobante
  const ordenPorId = new Map(lote.ordenes.map((o) => [o.id, o]))

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/pagos?vista=lotes" aria-label="Volver">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Header
            title={`Lote ${lote.numero}`}
            description={`${fechaCorta(lote.fecha)} · ${lote.ordenes.length} transferencias · ${formatCurrency(total)}`}
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={descargarGalicia} disabled={!!descargando}>
                  {descargando === 'galicia' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1.5" />}
                  Archivo Galicia{lote.partesGalicia > 1 && ` (${lote.partesGalicia} partes)`}
                </Button>
                <Button variant="primary" onClick={descargarPdfFinal} disabled={!!descargando}>
                  {descargando === 'pdf' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileDown className="h-4 w-4 mr-1.5" />}
                  PDF final
                </Button>
              </div>
            }
          />
        </div>

        {/* Pasos */}
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { n: 1, t: 'Importá el archivo en Galicia Office', d: 'Transferencias → Importar archivo. Concepto: Factura.', ok: true },
            { n: 2, t: 'Autorizá y bajá los comprobantes', d: 'Uno por transferencia o un PDF con todas.', ok: conComprobante > 0 },
            { n: 3, t: 'Subilos acá', d: `${conComprobante} de ${lote.ordenes.length} órdenes con comprobante`, ok: pendientes === 0 },
          ].map((p) => (
            <li key={p.n} className={cn('rounded-lg border bg-white p-3 flex gap-3', p.ok && p.n === 3 && 'border-emerald-200 bg-emerald-50/50')}>
              <span
                className={cn(
                  'h-6 w-6 shrink-0 rounded-full text-xs font-semibold flex items-center justify-center',
                  p.n === 3 && p.ok ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                )}
              >
                {p.n === 3 && p.ok ? <CheckCircle2 className="h-4 w-4" /> : p.n}
              </span>
              <div>
                <p className="text-sm font-medium text-slate-800">{p.t}</p>
                <p className="text-xs text-slate-500">{p.d}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* Subida de comprobantes */}
        {isAdmin && pendientes > 0 && !paginas && (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              leer(Array.from(e.dataTransfer.files))
            }}
            onClick={() => !leyendo && inputRef.current?.click()}
            className={cn(
              'rounded-lg border-2 border-dashed bg-white p-8 text-center cursor-pointer transition-colors',
              dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                leer(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
            {leyendo ? (
              <Loader2 className="h-8 w-8 mx-auto text-blue-500 animate-spin" />
            ) : (
              <UploadCloud className="h-8 w-8 mx-auto text-slate-400" />
            )}
            <p className="mt-2 text-sm font-medium text-slate-700">
              {leyendo ? 'Leyendo comprobantes…' : 'Arrastrá los comprobantes de Galicia (PDF)'}
            </p>
            <p className="text-xs text-slate-400">Se reparten solos a cada orden por CBU/CUIT e importe. Revisás antes de guardar.</p>
          </div>
        )}

        {/* Revisión del reparto */}
        {paginas && (
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-medium text-slate-800">Revisá el reparto</p>
                <p className="text-xs text-slate-500">
                  {paginas.filter((p) => p.coincidencia === 'exacta').length} exactos ·{' '}
                  {paginas.filter((p) => p.coincidencia === 'probable').length} probables ·{' '}
                  {paginas.filter((p) => !p.pagoId).length} sin asignar
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPaginas(null)
                    setArchivos([])
                  }}
                >
                  Cancelar
                </Button>
                <Button variant="primary" size="sm" onClick={confirmar} disabled={guardando || asignaciones.length === 0 || repetidas.size > 0}>
                  {guardando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  Guardar {asignaciones.length} comprobante{asignaciones.length !== 1 && 's'}
                </Button>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Comprobante</th>
                  <th className="text-left font-medium px-2 py-2">Destino leído</th>
                  <th className="text-right font-medium px-2 py-2">Importe</th>
                  <th className="text-left font-medium px-4 py-2">Orden</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginas.map((p) => {
                  const k = clavePagina(p)
                  const sel = asignado[k] ?? ''
                  const orden = sel ? ordenPorId.get(sel) : undefined
                  const montoDifiere = orden && p.leido.monto !== null && Math.abs(orden.montoTotal - p.leido.monto) > 0.01
                  const Icono = !sel ? XCircle : p.coincidencia === 'exacta' && sel === p.pagoId ? CheckCircle2 : AlertTriangle
                  const color = !sel ? 'text-slate-300' : p.coincidencia === 'exacta' && sel === p.pagoId ? 'text-emerald-600' : 'text-amber-500'
                  return (
                    <tr key={k} className={cn(repetidas.has(sel) && 'bg-red-50')}>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Icono className={cn('h-4 w-4 shrink-0', color)} />
                          <div className="min-w-0">
                            <p className="text-xs text-slate-700 truncate max-w-[200px]" title={p.nombre}>
                              {p.nombre}
                              {paginas.filter((x) => x.archivo === p.archivo).length > 1 && ` · pág. ${p.pagina + 1}`}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {p.leido.operacion ?? 's/n'} · {fechaCorta(p.leido.fecha)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <p className="font-mono text-[11px] text-slate-600">{p.leido.cbu ?? '—'}</p>
                        <p className="font-mono text-[11px] text-slate-400">{p.leido.cuit ?? '—'}</p>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                        {p.leido.monto !== null ? formatCurrency(p.leido.monto) : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={sel}
                          onChange={(e) => setAsignado((a) => ({ ...a, [k]: e.target.value }))}
                          className="w-full max-w-[280px] border border-slate-200 rounded-md px-2 py-1 text-xs bg-white"
                        >
                          <option value="">— No asignar —</option>
                          {lote.ordenes.map((o) => (
                            <option key={o.id} value={o.id}>
                              OP {formatNumeroOrden(o.numero)} · {o.proveedor.razonSocial} · {formatCurrency(o.montoTotal)}
                              {o.comprobanteKey ? ' (ya tiene)' : ''}
                            </option>
                          ))}
                        </select>
                        <p className={cn('text-[11px] mt-0.5', montoDifiere || repetidas.has(sel) ? 'text-red-600' : 'text-slate-400')}>
                          {repetidas.has(sel)
                            ? 'Esta orden ya tiene otro comprobante asignado'
                            : montoDifiere
                              ? `El importe no coincide con la orden (${formatCurrency(orden!.montoTotal)})`
                              : sel === p.pagoId
                                ? p.motivo
                                : sel
                                  ? 'Asignado a mano'
                                  : p.motivo}
                        </p>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Órdenes del lote */}
        <div className="bg-white border rounded-lg divide-y">
          {lote.ordenes.map((o) => (
            <div key={o.id} className="flex items-center gap-3 px-4 py-2.5">
              {o.comprobanteKey ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-label="Con comprobante" />
              ) : (
                <span className="h-4 w-4 rounded-full border-2 border-slate-200 shrink-0" aria-label="Sin comprobante" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-400">OP {formatNumeroOrden(o.numero)}</span>
                  <Link href={`/pagos/${o.id}`} className="text-sm font-medium text-slate-800 truncate hover:underline">
                    {o.proveedor.razonSocial}
                  </Link>
                </div>
                <p className="font-mono text-[11px] text-slate-400 truncate">{o.proveedor.cbu ?? 'sin CBU'} · {o.descripcion}</p>
              </div>
              <span
                className={cn(
                  'text-[11px] font-medium px-2 py-0.5 rounded-full',
                  o.estado === 'PAGADO' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                )}
              >
                {o.estado === 'PAGADO' ? 'Pagada' : 'En banco'}
              </span>
              <span className="text-sm font-semibold tabular-nums text-slate-900 w-32 text-right">{formatCurrency(o.montoTotal)}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                <a href={`/api/pagos/${o.id}/pdf?view=true`} target="_blank" rel="noreferrer" aria-label="Ver PDF de la orden">
                  {o.comprobanteKey ? <Eye className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                </a>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  )
}

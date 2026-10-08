'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { descargarArchivo } from '@/components/payments/batch-shared'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { CheckCircle2, FileDown, FileSpreadsheet, Loader2, UploadCloud } from 'lucide-react'

interface LineaEcheq {
  id: string
  monto: number
  fecha: string
  referencia: string | null
  conPdf: boolean
}

interface PaginaLeida {
  archivo: number
  pagina: number
  nombre: string
  numero: string | null
  metodoId: string | null
  coincidencia: 'exacta' | 'probable' | 'ninguna'
  motivo: string
}

const MOTIVOS = ['Orden de Pago', 'Factura', 'Varios', 'Servicios', 'Alquiler', 'Expensas']
const CLAUSULAS = ['A la orden', 'No a la orden']
const clave = (p: { archivo: number; pagina: number }) => `${p.archivo}:${p.pagina}`

/**
 * Ayuda para pagar una orden con eCheq desde Galicia Office:
 *  1. Con las fechas e importes ya cargados en la orden, baja la plantilla
 *     oficial de emisión completa para importarla en el banco.
 *  2. Recibe los PDF de los eCheq emitidos (uno por cheque o todos juntos),
 *     los reparte entre los cheques de la orden y los adjunta: el PDF de la
 *     orden queda con todos los eCheq anexados (la OP final).
 */
export function EcheqGaliciaCard({
  pagoId,
  lineas,
  proveedorEmail,
  canEdit,
  onDescargarOp,
}: {
  pagoId: string
  lineas: LineaEcheq[]
  proveedorEmail: string | null
  canEdit: boolean
  onDescargarOp: () => Promise<void>
}) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [motivo, setMotivo] = useState('Orden de Pago')
  const [clausula, setClausula] = useState('A la orden')
  const [conMail, setConMail] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [archivos, setArchivos] = useState<File[]>([])
  const [paginas, setPaginas] = useState<PaginaLeida[] | null>(null)
  const [asignado, setAsignado] = useState<Record<string, string>>({})
  const [dragging, setDragging] = useState(false)

  const conPdf = lineas.filter((l) => l.conPdf).length
  const total = lineas.reduce((s, l) => s + l.monto, 0)
  const fueraDeRango = lineas.some((l) => {
    const dias = (Date.parse(l.fecha) - Date.now()) / 86_400_000
    return dias > 365
  })

  const descargarArchivo_ = async () => {
    setOcupado('xlsx')
    try {
      const p = new URLSearchParams({ motivo, clausula, ...(conMail ? { mail: '1' } : {}) })
      await descargarArchivo(`/api/pagos/${pagoId}/echeq?${p}`, 'eCheq.xlsx')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo generar el archivo')
    } finally {
      setOcupado(null)
    }
  }

  const leer = async (files: File[]) => {
    const pdfs = files.filter((f) => f.type === 'application/pdf')
    if (pdfs.length === 0) {
      toast.error('Subí los eCheq en PDF')
      return
    }
    setArchivos(pdfs)
    setOcupado('leer')
    setPaginas(null)
    try {
      const fd = new FormData()
      fd.append('modo', 'leer')
      pdfs.forEach((f) => fd.append('files', f))
      const res = await fetch(`/api/pagos/${pagoId}/echeq`, { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'No se pudieron leer los eCheq')
      setPaginas(d.paginas)
      const inicial: Record<string, string> = {}
      for (const p of d.paginas as PaginaLeida[]) if (p.metodoId) inicial[clave(p)] = p.metodoId
      setAsignado(inicial)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
      setArchivos([])
    } finally {
      setOcupado(null)
    }
  }

  const repetidos = (() => {
    const vistos = new Map<string, number>()
    for (const v of Object.values(asignado)) if (v) vistos.set(v, (vistos.get(v) ?? 0) + 1)
    return new Set([...vistos].filter(([, n]) => n > 1).map(([k]) => k))
  })()

  const guardar = async () => {
    if (!paginas) return
    const asignaciones = paginas
      .map((p) => ({ archivo: p.archivo, pagina: p.pagina, metodoId: asignado[clave(p)] }))
      .filter((a): a is { archivo: number; pagina: number; metodoId: string } => !!a.metodoId)
    if (asignaciones.length === 0) {
      toast.error('No asignaste ningún PDF')
      return
    }
    setOcupado('guardar')
    try {
      const fd = new FormData()
      fd.append('modo', 'confirmar')
      fd.append('asignaciones', JSON.stringify(asignaciones))
      archivos.forEach((f) => fd.append('files', f))
      const res = await fetch(`/api/pagos/${pagoId}/echeq`, { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'No se pudieron guardar')
      toast.success(`${d.guardados} eCheq adjuntado${d.guardados === 1 ? '' : 's'} a la orden`)
      setPaginas(null)
      setArchivos([])
      await queryClient.invalidateQueries({ queryKey: ['pago', pagoId] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setOcupado(null)
    }
  }

  const bajarOp = async () => {
    setOcupado('op')
    try {
      await onDescargarOp()
    } catch {
      toast.error('No se pudo descargar la orden')
    } finally {
      setOcupado(null)
    }
  }

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          eCheq en Galicia Office
          <span className="text-xs font-normal text-slate-400">
            {lineas.length} cheque{lineas.length !== 1 && 's'} · {formatCurrency(total)} · {conPdf}/{lineas.length} con PDF
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Paso 1: archivo de emisión */}
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-sm font-medium text-slate-800">1. Archivo para emitir</p>
          <p className="text-xs text-slate-500">
            Plantilla oficial de Galicia con un cheque por cada eCheq cargado en la orden (fecha de pago e importe). Se importa en Emitir →
            Emisión masiva.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5 text-slate-600">
              Motivo
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="border border-slate-200 rounded-md px-2 py-1 bg-white">
                {MOTIVOS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-slate-600">
              Cláusula
              <select value={clausula} onChange={(e) => setClausula(e.target.value)} className="border border-slate-200 rounded-md px-2 py-1 bg-white">
                {CLAUSULAS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            {proveedorEmail && (
              <label className="flex items-center gap-1.5 text-slate-600" title="El banco le manda al proveedor el detalle de la emisión">
                <Checkbox checked={conMail} onCheckedChange={(v) => setConMail(v === true)} />
                Avisar a {proveedorEmail}
              </label>
            )}
            <Button variant="outline" size="sm" onClick={descargarArchivo_} disabled={!!ocupado} className="ml-auto gap-1.5">
              {ocupado === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Descargar archivo eCheq
            </Button>
          </div>
          {fueraDeRango && <p className="text-xs text-red-600">Hay cheques con fecha de pago a más de 365 días: el banco los rechaza.</p>}
        </div>

        {/* Paso 2: PDFs emitidos */}
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-800">2. PDFs de los eCheq emitidos</p>
            {conPdf > 0 && (
              <Button size="sm" variant="primary" onClick={bajarOp} disabled={!!ocupado} className="gap-1.5">
                {ocupado === 'op' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                Descargar OP final
              </Button>
            )}
          </div>

          <ul className="text-xs divide-y border rounded-md">
            {lineas.map((l, i) => (
              <li key={l.id} className="flex items-center gap-2 px-2.5 py-1.5">
                {l.conPdf ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-200 shrink-0" />
                )}
                <span className="text-slate-500 w-16">Cheque {i + 1}</span>
                <span className="text-slate-600">{formatDate(l.fecha)}</span>
                {l.referencia && <span className="font-mono text-slate-400">Nº {l.referencia}</span>}
                <span className="ml-auto font-medium tabular-nums">{formatCurrency(l.monto)}</span>
              </li>
            ))}
          </ul>

          {canEdit && !paginas && conPdf < lineas.length && (
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
              onClick={() => !ocupado && inputRef.current?.click()}
              className={cn(
                'rounded-lg border-2 border-dashed p-5 text-center cursor-pointer transition-colors',
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
              {ocupado === 'leer' ? <Loader2 className="h-6 w-6 mx-auto text-blue-500 animate-spin" /> : <UploadCloud className="h-6 w-6 mx-auto text-slate-400" />}
              <p className="mt-1.5 text-sm font-medium text-slate-700">
                {ocupado === 'leer' ? 'Leyendo eCheq…' : 'Arrastrá los PDF de los eCheq'}
              </p>
              <p className="text-xs text-slate-400">Uno por cheque o todos en un PDF. Se asignan solos por importe y fecha; revisás antes de guardar.</p>
            </div>
          )}

          {paginas && (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left font-medium px-2.5 py-1.5">PDF</th>
                    <th className="text-left font-medium px-2.5 py-1.5">Va al cheque</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paginas.map((p) => {
                    const k = clave(p)
                    const sel = asignado[k] ?? ''
                    return (
                      <tr key={k}>
                        <td className="px-2.5 py-1.5 align-top">
                          <p className="truncate max-w-[220px]" title={p.nombre}>
                            {p.nombre}
                            {paginas.filter((x) => x.archivo === p.archivo).length > 1 && ` · pág. ${p.pagina + 1}`}
                          </p>
                          {p.numero && <p className="font-mono text-slate-400">Nº {p.numero}</p>}
                        </td>
                        <td className="px-2.5 py-1.5">
                          <select
                            value={sel}
                            onChange={(e) => setAsignado((a) => ({ ...a, [k]: e.target.value }))}
                            className="w-full max-w-[260px] border border-slate-200 rounded-md px-2 py-1 bg-white"
                          >
                            <option value="">— No asignar —</option>
                            {lineas.map((l, i) => (
                              <option key={l.id} value={l.id}>
                                Cheque {i + 1} · {formatDate(l.fecha)} · {formatCurrency(l.monto)}
                                {l.conPdf ? ' (ya tiene)' : ''}
                              </option>
                            ))}
                          </select>
                          <p className={cn('mt-0.5', repetidos.has(sel) ? 'text-red-600' : p.coincidencia === 'exacta' && sel === p.metodoId ? 'text-emerald-600' : 'text-slate-400')}>
                            {repetidos.has(sel) ? 'Este cheque ya tiene otro PDF asignado' : sel === p.metodoId ? p.motivo : sel ? 'Asignado a mano' : p.motivo}
                          </p>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="flex justify-end gap-2 p-2 border-t bg-slate-50">
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
                <Button size="sm" variant="primary" onClick={guardar} disabled={!!ocupado || repetidos.size > 0}>
                  {ocupado === 'guardar' && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

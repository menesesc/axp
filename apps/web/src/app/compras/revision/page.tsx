'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useUser } from '@/hooks/use-user'
import { SECCION } from '@/lib/permisos'
import { formatCurrency, formatDate, formatTipoDocumento, cn } from '@/lib/utils'
import {
  AlertTriangle, ArrowLeft, Check, CheckCheck, FileText, Loader2, Sparkles, X,
} from 'lucide-react'

interface Linea {
  id: string
  linea: number
  descripcion: string
  unidad: string | null
  cantidad: number | null
  precioUnitario: number | null
  subtotal: number | null
  referencia: number | null
  diagnostico: 'cantidad_x1000' | 'peso_variable' | 'no_cierra' | 'descuento_probable'
  confianza: 'alta' | 'media' | 'baja'
  motivo: string
  propuestaCantidad: number | null
  propuestaPrecio: number | null
}

interface Documento {
  id: string
  numero: string | null
  letra: string | null
  tipo: string
  fecha: string | null
  pdfKey: string | null
  proveedorId: string | null
  proveedor: string | null
  lineas: Linea[]
}

interface Respuesta {
  documentos: Documento[]
  totales: { lineas: number; documentos: number; altaConfianza: number }
}

/** Lo que devolvió la IA para un comprobante, indexado por número de línea. */
type LecturaIA = Record<number, { cantidad?: number; precioUnitario?: number; subtotal?: number; observacion?: string | null }>

const num = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('es-AR', { maximumFractionDigits: 3 })

export default function RevisionLineasPage() {
  const qc = useQueryClient()
  const { canEdit } = useUser()
  const puedeEditar = canEdit(SECCION.DOC_ITEMS)

  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [ia, setIa] = useState<Record<string, LecturaIA>>({})
  const [verRevisadas, setVerRevisadas] = useState(false)
  const [verDescuentos, setVerDescuentos] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['revision-lineas', verRevisadas, verDescuentos],
    queryFn: async () => {
      const p = new URLSearchParams()
      if (verRevisadas) p.set('revisadas', '1')
      if (verDescuentos) p.set('descuentos', '1')
      const res = await fetch(`/api/compras/revision-lineas?${p}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'No se pudo cargar')
      return res.json() as Promise<Respuesta>
    },
  })

  const porId = useMemo(() => {
    const m = new Map<string, Linea>()
    for (const d of data?.documentos ?? []) for (const l of d.lineas) m.set(l.id, l)
    return m
  }, [data])

  const aplicar = useMutation({
    mutationFn: async (cuerpo: { correcciones?: Array<{ id: string; cantidad: number | null; precioUnitario: number | null }>; aceptar?: string[] }) => {
      const res = await fetch('/api/compras/revision-lineas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo aplicar')
      return json as { cambiadas: number; aceptadas: number }
    },
    onSuccess: (r) => {
      setElegidas(new Set())
      qc.invalidateQueries({ queryKey: ['revision-lineas'] })
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['informe-precios'] })
      const partes = []
      if (r.cambiadas) partes.push(`${r.cambiadas} línea${r.cambiadas === 1 ? '' : 's'} corregida${r.cambiadas === 1 ? '' : 's'}`)
      if (r.aceptadas) partes.push(`${r.aceptadas} dada${r.aceptadas === 1 ? '' : 's'} por buena${r.aceptadas === 1 ? '' : 's'}`)
      toast.success(partes.join(' y ') || 'Sin cambios')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const releer = useMutation({
    mutationFn: async (documentoId: string) => {
      const res = await fetch('/api/compras/revision-lineas/ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentoId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo releer')
      return { documentoId, ...(json as { lineas: Array<Record<string, number>> }) }
    },
    onSuccess: ({ documentoId, lineas }) => {
      const porLinea: LecturaIA = {}
      for (const l of lineas) porLinea[Number(l.linea)] = l as never
      setIa((prev) => ({ ...prev, [documentoId]: porLinea }))
      toast.success(`Releí ${lineas.length} línea${lineas.length === 1 ? '' : 's'} del PDF`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  /** Valores a aplicar a una línea: lo que leyó la IA manda sobre la propuesta aritmética. */
  const propuestaDe = (docId: string, l: Linea) => {
    const leida = ia[docId]?.[l.linea]
    if (leida && (leida.cantidad != null || leida.precioUnitario != null)) {
      return {
        cantidad: leida.cantidad ?? l.cantidad,
        precioUnitario: leida.precioUnitario ?? l.precioUnitario,
        fuente: 'ia' as const,
      }
    }
    if (l.propuestaCantidad != null || l.propuestaPrecio != null) {
      return {
        cantidad: l.propuestaCantidad ?? l.cantidad,
        precioUnitario: l.propuestaPrecio ?? l.precioUnitario,
        fuente: 'calculo' as const,
      }
    }
    return null
  }

  const alternar = (id: string) =>
    setElegidas((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const elegirTodasAltas = () => {
    const altas = [...porId.values()].filter((l) => l.confianza === 'alta').map((l) => l.id)
    setElegidas(new Set(altas))
  }

  const aplicarElegidas = () => {
    const correcciones: Array<{ id: string; cantidad: number | null; precioUnitario: number | null }> = []
    for (const d of data?.documentos ?? []) {
      for (const l of d.lineas) {
        if (!elegidas.has(l.id)) continue
        const p = propuestaDe(d.id, l)
        if (p) correcciones.push({ id: l.id, cantidad: p.cantidad, precioUnitario: p.precioUnitario })
      }
    }
    if (correcciones.length === 0) {
      toast.error('Ninguna de las líneas marcadas tiene una corrección para aplicar')
      return
    }
    aplicar.mutate({ correcciones })
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/informes/precios" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            Análisis de precios
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-500">
              <input
                type="checkbox"
                checked={verDescuentos}
                onChange={(e) => setVerDescuentos(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Incluir las que parecen descuentos
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-500">
              <input
                type="checkbox"
                checked={verRevisadas}
                onChange={(e) => setVerRevisadas(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Mostrar las que ya di por buenas
            </label>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold">Revisión de líneas</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Líneas donde los números del comprobante no cierran, y eso desvía el stock, el costo por insumo y el
            análisis de precios. Hay dos causas frecuentes: la cantidad leída con el separador de miles
            (&ldquo;120,000&rdquo; son ciento veinte, no ciento veinte mil) y el peso variable, donde la carne se
            factura por caja pero se cobra por kilo y la cantidad quedó en cajas.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40" />)}
          </div>
        ) : !data || data.documentos.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-10 text-center">
            <CheckCheck className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
            <p className="font-medium text-emerald-900">No hay líneas para revisar.</p>
          </div>
        ) : (
          <>
            <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
              <p className="text-sm text-slate-600">
                <strong>{data.totales.lineas}</strong> líneas en <strong>{data.totales.documentos}</strong> comprobantes
                {data.totales.altaConfianza > 0 && (
                  <span className="text-slate-400"> · {data.totales.altaConfianza} con corrección segura</span>
                )}
              </p>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {data.totales.altaConfianza > 0 && (
                  <Button variant="outline" size="sm" onClick={elegirTodasAltas}>
                    Marcar las seguras
                  </Button>
                )}
                {elegidas.size > 0 && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setElegidas(new Set())}>
                      Quitar selección
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={aplicar.isPending || !puedeEditar}
                      onClick={() => aplicar.mutate({ aceptar: [...elegidas] })}
                    >
                      Dar por buenas ({elegidas.size})
                    </Button>
                    <Button size="sm" disabled={aplicar.isPending || !puedeEditar} onClick={aplicarElegidas}>
                      {aplicar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                      Corregir {elegidas.size}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {!puedeEditar && (
              <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
                Podés mirar la revisión, pero no tenés permiso para corregir items.
              </p>
            )}

            <div className="space-y-3">
              {data.documentos.map((d) => (
                <Comprobante
                  key={d.id}
                  doc={d}
                  elegidas={elegidas}
                  onAlternar={alternar}
                  propuestaDe={propuestaDe}
                  releyendo={releer.isPending && releer.variables === d.id}
                  onReleer={() => releer.mutate(d.id)}
                  conIa={!!ia[d.id]}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

function Comprobante({
  doc,
  elegidas,
  onAlternar,
  propuestaDe,
  onReleer,
  releyendo,
  conIa,
}: {
  doc: Documento
  elegidas: Set<string>
  onAlternar: (id: string) => void
  propuestaDe: (docId: string, l: Linea) => { cantidad: number | null; precioUnitario: number | null; fuente: 'ia' | 'calculo' } | null
  onReleer: () => void
  releyendo: boolean
  conIa: boolean
}) {
  const todas = doc.lineas.map((l) => l.id)
  const todasElegidas = todas.every((id) => elegidas.has(id))

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <Link href={`/documento/${doc.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline">
          <FileText className="h-4 w-4 text-slate-400" />
          {formatTipoDocumento(doc.tipo)} {doc.letra} {doc.numero ?? ''}
        </Link>
        {doc.proveedor && (
          <Link
            href={doc.proveedorId ? `/proveedores/${doc.proveedorId}` : '/proveedores'}
            className="text-sm text-slate-500 hover:underline"
          >
            {doc.proveedor}
          </Link>
        )}
        <span className="text-sm text-slate-400">{formatDate(doc.fecha)}</span>
        <span className="text-xs text-slate-400">
          {doc.lineas.length} línea{doc.lineas.length === 1 ? '' : 's'}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => todas.forEach((id) => (todasElegidas ? elegidas.has(id) && onAlternar(id) : !elegidas.has(id) && onAlternar(id)))}
            className="text-xs text-slate-500 hover:text-slate-900 hover:underline"
          >
            {todasElegidas ? 'Desmarcar todas' : 'Marcar todas'}
          </button>
          {doc.pdfKey && (
            <Button variant="outline" size="sm" className="h-8" onClick={onReleer} disabled={releyendo}>
              {releyendo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
              {conIa ? 'Releer otra vez' : 'Releer el PDF con IA'}
            </Button>
          )}
        </div>
      </header>

      <table className="w-full text-sm">
        <thead className="text-left text-xs font-medium text-slate-400">
          <tr>
            <th className="w-8 px-3 py-2"></th>
            <th className="px-2 py-2">Línea</th>
            <th className="px-2 py-2 text-right">Guardado</th>
            <th className="px-2 py-2 text-right">Propuesta</th>
            <th className="px-2 py-2 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {doc.lineas.map((l) => {
            const p = propuestaDe(doc.id, l)
            const marcada = elegidas.has(l.id)
            return (
              <tr key={l.id} className={cn(marcada && 'bg-sky-50/60')}>
                <td className="px-3 py-2.5 align-top">
                  <input
                    type="checkbox"
                    checked={marcada}
                    onChange={() => onAlternar(l.id)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  />
                </td>
                <td className="max-w-0 px-2 py-2.5 align-top">
                  <p className="truncate font-medium" title={l.descripcion}>{l.descripcion}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <Confianza nivel={l.confianza} />
                    <span>{l.motivo}</span>
                  </p>
                  {l.referencia != null && (
                    <p className="mt-0.5 text-xs text-slate-400">
                      Precio habitual del item: {formatCurrency(l.referencia)}
                    </p>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-2.5 text-right align-top tabular-nums text-slate-500">
                  {num(l.cantidad)}
                  {l.unidad ? ` ${l.unidad.toLowerCase()}` : ''}
                  <br />
                  <span className="text-xs">× {formatCurrency(l.precioUnitario ?? 0)}</span>
                </td>
                <td className="whitespace-nowrap px-2 py-2.5 text-right align-top tabular-nums">
                  {p ? (
                    <>
                      <span className="font-medium">{num(p.cantidad)}</span>
                      {l.unidad ? ` ${l.unidad.toLowerCase()}` : ''}
                      <br />
                      <span className="text-xs">× {formatCurrency(p.precioUnitario ?? 0)}</span>
                      {p.fuente === 'ia' && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-violet-600">
                          <Sparkles className="h-2.5 w-2.5" />
                          IA
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-slate-400">
                      Hay que mirar el PDF
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-2.5 text-right align-top tabular-nums text-slate-500">
                  {formatCurrency(l.subtotal ?? 0)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function Confianza({ nivel }: { nivel: 'alta' | 'media' | 'baja' }) {
  const estilo = {
    alta: ['bg-emerald-50 text-emerald-700', Check, 'segura'],
    media: ['bg-amber-50 text-amber-700', AlertTriangle, 'probable'],
    baja: ['bg-slate-100 text-slate-600', X, 'a revisar'],
  }[nivel] as [string, typeof Check, string]
  const [clase, Icono, texto] = estilo
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', clase)}>
      <Icono className="h-2.5 w-2.5" />
      {texto}
    </span>
  )
}

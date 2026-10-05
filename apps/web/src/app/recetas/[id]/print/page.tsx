'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { fmtMin, fmtPesos, fotoUrl, type RecetaDetalle } from '@/components/recetas/tipos'

/**
 * Ficha imprimible de una receta.
 *
 * Página aparte y no un `@media print` sobre el detalle: así no hay que pelear
 * con la barra lateral ni con el alto del hero, y la hoja queda armada para lo
 * que importa en la cocina —ingredientes y pasos legibles—.
 *
 * Se abre el diálogo de impresión solo, que es también el camino a PDF
 * ("Guardar como PDF" en el destino). `?porciones=` permite imprimir la
 * receta escalada a lo que se va a cocinar esa noche.
 */
export default function RecetaPrintPage() {
  const { id } = useParams<{ id: string }>()
  const sp = useSearchParams()
  const impreso = useRef(false)

  const { data } = useQuery({
    queryKey: ['receta-print', id],
    queryFn: async () => {
      const res = await fetch(`/api/recetas/${id}`)
      if (!res.ok) throw new Error('No se pudo cargar')
      return res.json() as Promise<{ receta: RecetaDetalle }>
    },
  })

  const r = data?.receta
  const base = r?.porciones ?? 1
  const pedidas = Number(sp.get('porciones'))
  const p = pedidas > 0 ? pedidas : base
  const factor = base > 0 ? p / base : 1

  // Esperar a que carguen receta y foto: si se imprime antes, la hoja sale sin
  // imagen y con el layout a medio armar.
  useEffect(() => {
    if (!r || impreso.current) return
    impreso.current = true
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [r])

  const grupos = useMemo(() => {
    const agrupar = <T extends { seccion: string | null }>(items: T[]) => {
      const out: Array<{ seccion: string | null; items: T[] }> = []
      for (const it of items) {
        const u = out[out.length - 1]
        if (u && u.seccion === it.seccion) u.items.push(it)
        else out.push({ seccion: it.seccion, items: [it] })
      }
      return out
    }
    return { ing: agrupar(r?.ingredientes ?? []), pasos: agrupar(r?.pasos ?? []) }
  }, [r])

  if (!r) return <div className="p-10 text-sm text-slate-400">Cargando…</div>

  const cant = (n: number | null) => {
    if (n == null) return ''
    const v = n * factor
    return Number.isInteger(v) ? String(v) : String(+v.toFixed(2)).replace('.', ',')
  }
  const url = fotoUrl(r.fotoKey)
  let i = 0

  return (
    <div className="mx-auto max-w-[800px] bg-white p-8 text-slate-900 print:p-0">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          .no-print { display: none !important; }
          /* Que un paso o un grupo de ingredientes no se parta entre hojas. */
          li, .grupo { break-inside: avoid; }
          h2 { break-after: avoid; }
        }
      `}</style>

      <button
        onClick={() => window.print()}
        className="no-print mb-6 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
      >
        <Printer className="h-4 w-4" />
        Imprimir
      </button>

      <header className="flex items-start justify-between gap-6 border-b border-slate-300 pb-4">
        <div className="min-w-0">
          {r.categoria && (
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{r.categoria.nombre}</p>
          )}
          <h1 className="mt-1 text-3xl font-bold leading-tight">{r.titulo}</h1>
          {r.descripcion && <p className="mt-2 text-sm leading-relaxed text-slate-600">{r.descripcion}</p>}
          <p className="mt-3 text-sm text-slate-600">
            {r.prepMin ? <>Prep. <b>{fmtMin(r.prepMin)}</b> · </> : null}
            {r.totalMin ? <>Total <b>{fmtMin(r.totalMin)}</b> · </> : null}
            <b>{p}</b> porciones
            {p !== base && <span className="text-slate-400"> (receta base: {base})</span>}
            {r.dificultad ? <> · {r.dificultad}</> : null}
            {r.autor ? <> · {r.autor}</> : null}
          </p>
          {r.dispositivos.length > 0 && (
            <p className="mt-1 text-sm text-slate-500">{r.dispositivos.map((d) => d.nombre).join(' · ')}</p>
          )}
          {r.costo && r.costo.costeados > 0 && (
            <p className="mt-1 text-sm text-slate-500">
              Costo por porción <b className="text-slate-900">{fmtPesos(r.costo.total / base)}</b>
              {r.costo.faltantes.length > 0 && <span className="text-slate-400"> (parcial)</span>}
            </p>
          )}
        </div>
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-32 w-44 shrink-0 rounded-lg object-cover" />
        )}
      </header>

      <div className="mt-6 grid grid-cols-[minmax(0,260px)_minmax(0,1fr)] gap-8">
        <section>
          <h2 className="mb-2 text-base font-bold">Ingredientes</h2>
          {grupos.ing.map((g, gi) => (
            <div key={gi} className="grupo">
              {g.seccion && <p className={`mb-1 text-sm font-semibold text-slate-500 ${gi > 0 ? 'mt-3' : ''}`}>{g.seccion}</p>}
              <ul className="space-y-1">
                {g.items.map((ing, k) => (
                  <li key={ing.id ?? k} className="text-sm leading-snug">
                    {ing.cantidad != null && <b>{cant(ing.cantidad)} {ing.unidad} </b>}
                    {ing.cantidad != null ? 'de ' : ''}{ing.nombre}
                    {ing.nota && <span className="block text-xs text-slate-500">{ing.nota}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">Preparación</h2>
          {grupos.pasos.map((g, gi) => (
            <div key={gi} className="grupo">
              {g.seccion && <p className={`mb-1.5 text-sm font-semibold text-slate-500 ${gi > 0 ? 'mt-3' : ''}`}>{g.seccion}</p>}
              <ol className="space-y-2">
                {g.items.map((paso) => {
                  const n = ++i
                  return (
                    <li key={paso.id ?? n} className="flex gap-2.5 text-sm leading-relaxed">
                      <span className="shrink-0 font-bold text-slate-400">{n}.</span>
                      <span>{paso.texto}</span>
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}

          {r.sugerencias.length > 0 && (
            <div className="grupo mt-5">
              <h2 className="mb-2 text-base font-bold">Sugerencias</h2>
              <ul className="list-disc space-y-1 pl-4">
                {r.sugerencias.map((s) => (
                  <li key={s.id} className="text-sm leading-relaxed">{s.texto}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

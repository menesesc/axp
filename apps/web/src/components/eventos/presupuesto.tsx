'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Copy, FileDown, History, Save } from 'lucide-react'
import { fechaCorta } from '@/lib/eventos/constantes'
import {
  APLICA_SUFIJO,
  fechaCortaAnio,
  fechaLarga,
  ivaTexto,
  personasLargo,
  plata,
  textoWhatsApp,
  type PresupuestoDatos,
  type VersionPresupuesto,
} from '@/lib/eventos/presupuesto'
import { cn } from '@/lib/utils'
import { avisarError, enviar } from './comunes'

/**
 * Pantalla del presupuesto: la hoja (que es lo que se imprime o se guarda
 * como PDF desde el diálogo del navegador), el texto para WhatsApp y las
 * versiones.
 *
 * Página aparte, sin el menú de AXP alrededor, como la ficha imprimible de
 * las recetas: así la hoja sale limpia sin pelear con la barra lateral.
 *
 * "Generar versión" congela lo que se ve como v1, v2…; ver una versión vieja
 * muestra exactamente lo que se mandó.
 */
export function PantallaPresupuesto({ destino: r, volver }: { destino: { reservaId: string } | { eventoId: string }; volver: string }) {
  const router = useRouter()
  const sp = useSearchParams()
  const qc = useQueryClient()
  const versionId = sp.get('v')
  const [regimenes, setRegimenes] = useState(false)
  const q = 'reservaId' in r ? `reservaId=${r.reservaId}` : `eventoId=${r.eventoId}`

  const actual = useQuery({
    queryKey: ['presupuesto', q, regimenes],
    queryFn: async () => {
      const res = await fetch(`/api/eventos/presupuestos?${q}${regimenes ? '&regimenes=1' : ''}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo armar el presupuesto')
      return res.json() as Promise<{ actual: PresupuestoDatos; conLogo: boolean; versiones: VersionPresupuesto[]; verImportes: boolean }>
    },
  })
  const version = useQuery({
    queryKey: ['presupuesto-version', versionId],
    enabled: !!versionId,
    queryFn: async () => {
      const res = await fetch(`/api/eventos/presupuestos?id=${versionId}`)
      if (!res.ok) throw new Error('No existe esa versión')
      return res.json() as Promise<{ version: { id: string; version: number; datos: PresupuestoDatos; usuarioNombre: string | null; createdAt: string }; conLogo: boolean }>
    },
  })

  const generar = useMutation({
    mutationFn: () => enviar('/api/eventos/presupuestos', 'POST', { ...r, regimenes }),
    onSuccess: (v: { id: string; version: number }) => {
      toast.success(`Presupuesto v${v.version} guardado`)
      qc.invalidateQueries({ queryKey: ['presupuesto', q] })
      qc.invalidateQueries({ queryKey: ['reserva-menu'] })
      qc.invalidateQueries({ queryKey: ['evento-menu'] })
      qc.invalidateQueries({ queryKey: ['reserva'] })
      qc.invalidateQueries({ queryKey: ['evento'] })
      router.replace(`?v=${v.id}` as Route)
    },
    onError: avisarError,
  })

  const datos = versionId ? version.data?.version.datos : actual.data?.actual
  const conLogo = (versionId ? version.data?.conLogo : actual.data?.conLogo) ?? false
  const error = (versionId ? version.error : actual.error) as Error | null

  const copiar = async () => {
    if (!datos) return
    try {
      await navigator.clipboard.writeText(textoWhatsApp(datos))
      toast.success('Texto copiado: pegalo en WhatsApp')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          .no-print { display: none !important; }
          .hoja { box-shadow: none !important; margin: 0 !important; max-width: none !important; padding: 0 !important; }
          section, tr, li { break-inside: avoid; }
          h2 { break-after: avoid; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[860px] flex-wrap items-center gap-2 px-4 py-2.5">
          <Link href={volver as Route} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
          <select
            value={versionId ?? ''}
            onChange={(e) => router.replace((e.target.value ? `?v=${e.target.value}` : '?') as Route)}
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
            aria-label="Versión"
          >
            <option value="">Actual (sin guardar)</option>
            {(actual.data?.versiones ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version} · {new Date(v.createdAt).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'numeric' })}
                {v.usuarioNombre ? ` · ${v.usuarioNombre}` : ''}
              </option>
            ))}
          </select>
          {!versionId && (
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={regimenes} onChange={(e) => setRegimenes(e.target.checked)} />
              Incluir regímenes
            </label>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            {!versionId && actual.data?.verImportes && (
              <button
                type="button"
                disabled={generar.isPending || !datos}
                onClick={() => generar.mutate()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                title="Congela lo que se ve como una versión nueva y la deja en la línea de tiempo"
              >
                <Save className="h-4 w-4" />
                Generar versión
              </button>
            )}
            <button type="button" onClick={copiar} disabled={!datos} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">
              <Copy className="h-4 w-4" />
              Copiar texto
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!datos}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              title="En el destino de impresión elegí “Guardar como PDF”"
            >
              <FileDown className="h-4 w-4" />
              Descargar PDF
            </button>
          </div>
        </div>
        {versionId && version.data && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-900">
            <History className="mr-1 inline h-3.5 w-3.5" />
            Versión v{version.data.version.version} del{' '}
            {new Date(version.data.version.createdAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })}
            {version.data.version.usuarioNombre ? ` por ${version.data.version.usuarioNombre}` : ''}: es exactamente lo que se mandó.
          </div>
        )}
        {!versionId && actual.data && !actual.data.verImportes && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-1.5 text-center text-xs text-slate-600">Sin permiso de importes: el presupuesto se ve sin precios y no se pueden generar versiones.</div>
        )}
      </div>

      {error ? (
        <p className="p-10 text-center text-sm text-slate-500">{error.message}</p>
      ) : !datos ? (
        <div className="p-10 text-center text-sm text-slate-400">Armando el presupuesto…</div>
      ) : (
        <HojaPresupuesto p={datos} conLogo={conLogo} />
      )}
    </div>
  )
}

/** La hoja en sí. Sólo dibuja `PresupuestoDatos`: lo mismo para lo actual y para una versión vieja. */
export function HojaPresupuesto({ p, conLogo }: { p: PresupuestoDatos; conLogo: boolean }) {
  const t = p.importes
  const adicionales = t?.lineas.filter((l) => l.tipo === 'ADICIONAL') ?? []
  const sinTotal = t?.total == null
  return (
    <article className="hoja mx-auto my-6 max-w-[860px] bg-white px-10 py-9 text-slate-900 shadow-sm">
      <header className="flex items-start justify-between gap-6 border-b border-slate-300 pb-5">
        <div className="flex min-w-0 items-center gap-4">
          {conLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/api/eventos/logo"
              alt=""
              className="h-16 w-auto max-w-[180px] object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          )}
          <div className="min-w-0">
            <p className="text-xl font-bold leading-tight">{p.casa.nombre}</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Presupuesto</p>
          </div>
        </div>
        <div className="shrink-0 text-right text-xs text-slate-500">
          {p.emitido.version ? <p className="text-sm font-semibold text-slate-900">Versión {p.emitido.version}</p> : <p className="italic">Borrador</p>}
          <p>Emitido el {fechaCortaAnio(p.emitido.fecha)}</p>
          {p.numero && <p>Reserva nº {p.numero}</p>}
        </div>
      </header>

      <section className="mt-6">
        <h1 className="text-2xl font-bold leading-tight">{p.titulo}</h1>
        {(p.cliente || p.contacto.nombre || p.contacto.telefono) && (
          <p className="mt-1 text-sm text-slate-600">
            {[p.cliente, p.contacto.nombre !== p.cliente ? p.contacto.nombre : null, p.contacto.telefono, p.contacto.email].filter(Boolean).join(' · ')}
          </p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          {p.evento && p.evento.nombre !== p.titulo && <Dato etiqueta="Evento" valor={p.evento.nombre} />}
          {p.evento?.tipo && <Dato etiqueta="Tipo" valor={p.evento.tipo} />}
          <Dato etiqueta="Fecha" valor={fechaLarga(p.fecha)} ancho />
          {p.horario && <Dato etiqueta="Horario" valor={`${p.horario} h`} />}
          {p.salon && <Dato etiqueta="Salón" valor={p.salon} />}
          <Dato etiqueta="Personas" valor={personasLargo(p.personas)} ancho />
        </dl>
      </section>

      {p.menu && (
        <section className="mt-7">
          <Titulo>Menú{p.menu.nombre ? ` · ${p.menu.nombre}` : ''}</Titulo>
          {p.menu.descripcion && <p className="mb-2 text-sm italic text-slate-600">{p.menu.descripcion}</p>}
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {p.menu.pasos.map((g) => (
              <div key={g.paso}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.titulo}</p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {g.items.map((i, k) => (
                    <li key={k}>
                      {i.opciones?.length ? (
                        <>
                          {g.items.length > 1 && <span className="text-slate-500">A elección: </span>}
                          {i.opciones.map((o, n) => (
                            <span key={n}>
                              {n > 0 && <span className="italic text-slate-500"> o </span>}
                              {o}
                            </span>
                          ))}
                        </>
                      ) : (
                        i.texto
                      )}
                      {i.aplica !== 'TODOS' && <span className="text-slate-500">{APLICA_SUFIJO[i.aplica]}</span>}
                      {i.descripcion && <span className="block text-xs text-slate-500">{i.descripcion}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {p.regimenes && p.regimenes.length > 0 && (
        <section className="mt-6">
          <Titulo>Regímenes especiales</Titulo>
          <ul className="space-y-1 text-sm">
            {p.regimenes.map((r, k) => (
              <li key={k}>
                <b>{r.texto}</b>
                {r.cantidad ? ` (${r.cantidad})` : ''}
                {r.menu ? `: ${r.menu}` : ''}
                {r.nota ? <span className="text-slate-600"> — {r.nota}</span> : null}
                {r.items.length > 0 && <span className="block text-xs text-slate-500">{r.items.join(' · ')}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {t && (
        <>
          <section className="mt-7 flex flex-wrap items-end justify-between gap-4 rounded-lg bg-slate-50 px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Precio por cubierto</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {plata(t.precioAdulto)} <span className="text-sm font-normal text-slate-500">adulto</span>
              </p>
              {t.precioMenor > 0 && (
                <p className="text-lg font-semibold tabular-nums">
                  {plata(t.precioMenor)} <span className="text-sm font-normal text-slate-500">menor</span>
                </p>
              )}
            </div>
            <p className="text-sm text-slate-600">{ivaTexto(t.ivaModo, t.ivaAlicuota)}</p>
          </section>

          {(t.lineas.length > 0 || t.total != null) && (
            <section className="mt-6">
              <Titulo>Detalle</Titulo>
              <table className="w-full text-sm tabular-nums">
                <tbody>
                  {t.lineas.map((l, k) => (
                    <tr key={k} className="border-b border-slate-200">
                      <td className="py-1.5">
                        {l.concepto}
                        {l.detalle && <span className="text-xs text-slate-500"> · {l.detalle}</span>}
                      </td>
                      {sinTotal ? (
                        <td className="py-1.5 text-right" colSpan={2}>
                          {plata(l.unitario)}
                        </td>
                      ) : (
                        <>
                          <td className="py-1.5 text-right text-slate-500">
                            {l.cantidad.toLocaleString('es-AR')} × {plata(l.unitario)}
                          </td>
                          <td className="w-32 py-1.5 text-right">{plata(l.importe)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {t.descuento > 0 && (
                    <tr className="border-b border-slate-200">
                      <td className="py-1.5" colSpan={2}>
                        Descuento{t.descuentoNota ? ` · ${t.descuentoNota}` : ''}
                      </td>
                      <td className="py-1.5 text-right">−{plata(t.descuento)}</td>
                    </tr>
                  )}
                  {t.total != null && t.ivaModo === 'MAS_IVA' && (
                    <>
                      <tr>
                        <td className="pt-2 text-slate-600" colSpan={2}>
                          Subtotal
                        </td>
                        <td className="pt-2 text-right">{plata(t.neto ?? 0)}</td>
                      </tr>
                      <tr>
                        <td className="text-slate-600" colSpan={2}>
                          IVA {t.ivaAlicuota} %
                        </td>
                        <td className="text-right">{plata(t.iva ?? 0)}</td>
                      </tr>
                    </>
                  )}
                  {t.total != null && (
                    <tr>
                      <td className="pt-2 text-base font-bold" colSpan={2}>
                        Total
                        {t.ivaModo === 'INCLUIDO' && <span className="ml-2 text-xs font-normal text-slate-500">IVA incluido ({plata(t.iva ?? 0)})</span>}
                      </td>
                      <td className="pt-2 text-right text-base font-bold">{plata(t.total)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {sinTotal && adicionales.length > 0 && <p className="mt-1 text-xs text-slate-500">Precios unitarios: el total se calcula con la cantidad de personas.</p>}
            </section>
          )}

          {t.pasajero.length > 0 && (
            <section className="mt-6">
              <Titulo>A cargo de cada pasajero</Titulo>
              <p className="mb-1 text-xs text-slate-500">Opcionales que cada uno abona por su cuenta. No están incluidos en el total.</p>
              <ul className="space-y-0.5 text-sm">
                {t.pasajero.map((a, k) => (
                  <li key={k} className="flex justify-between gap-4 tabular-nums">
                    <span>{a.descripcion}</span>
                    <span>
                      {plata(a.unitario)} <span className="text-slate-500">{a.detalle}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {t.cuotas.length > 0 && (
            <section className="mt-6">
              <Titulo>Condiciones de pago</Titulo>
              <ul className="space-y-0.5 text-sm tabular-nums">
                {t.cuotas.map((c, k) => (
                  <li key={k} className="flex justify-between gap-4">
                    <span>
                      {c.concepto}
                      {c.porcentaje != null && <span className="text-slate-500"> ({c.porcentaje} %)</span>}
                      {c.vencimiento && <span className="text-slate-500"> · hasta el {fechaCorta(c.vencimiento)}/{c.vencimiento.slice(0, 4)}</span>}
                    </span>
                    <span>{c.importe != null ? plata(c.importe) : c.porcentaje != null ? `${c.porcentaje} %` : 'saldo'}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {p.observaciones && (
        <section className="mt-6">
          <Titulo>Observaciones</Titulo>
          <p className="whitespace-pre-line text-sm text-slate-700">{p.observaciones}</p>
        </section>
      )}

      {(p.casa.pie || p.casa.validezDias) && (
        <footer className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
          {p.casa.pie && <p className="whitespace-pre-line">{p.casa.pie}</p>}
          {p.casa.validezDias && (
            <p className={cn(p.casa.pie && 'mt-2')}>
              Presupuesto válido por {p.casa.validezDias} días desde el {fechaCortaAnio(p.emitido.fecha)}.
            </p>
          )}
        </footer>
      )}
    </article>
  )
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 border-b border-slate-200 pb-1 text-sm font-semibold uppercase tracking-wider text-slate-700">{children}</h2>
}

function Dato({ etiqueta, valor, ancho }: { etiqueta: string; valor: string; ancho?: boolean }) {
  return (
    <div className={cn(ancho && 'col-span-2')}>
      <dt className="text-[11px] uppercase tracking-wider text-slate-500">{etiqueta}</dt>
      <dd className="first-letter:uppercase">{valor}</dd>
    </div>
  )
}

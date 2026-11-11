'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useQuery } from '@tanstack/react-query'
import { Plus, Settings2 } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { pesos } from '@/components/dashboard/inicio'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BarraCobro, BarraEstados, useCatalogos } from '@/components/eventos/comunes'
import { ConfiguracionDialog } from '@/components/eventos/configuracion'
import { NuevaReservaDialog } from '@/components/eventos/nueva-reserva'
import { TablaReservas } from '@/components/eventos/tabla-reservas'
import { useUser } from '@/hooks/use-user'
import { SECCION } from '@/lib/permisos'
import { hoyAR, sumarDias } from '@/lib/fechas'
import { fechaCorta, porcentajeCobrado } from '@/lib/eventos/constantes'
import type { EventoResumen, ReservaFila } from '@/lib/eventos/db'
import { cn } from '@/lib/utils'

/**
 * Lista de eventos y de reservas de un período, con lo presupuestado, lo
 * cobrado y el saldo. Por defecto, de hoy a dos meses: lo que se viene.
 */
export default function ListaEventos() {
  const hoy = hoyAR()
  const { canEdit } = useUser()
  const puedeEditar = canEdit(SECCION.EVENTOS_RESERVAS)
  const { tipoEvento } = useCatalogos()
  const [vista, setVista] = useState<'eventos' | 'reservas'>('eventos')
  const [desde, setDesde] = useState(hoy)
  const [hasta, setHasta] = useState(sumarDias(hoy, 60))
  const [soloSueltas, setSoloSueltas] = useState(false)
  const [nueva, setNueva] = useState(false)
  const [config, setConfig] = useState(false)

  const eventos = useQuery({
    queryKey: ['eventos-lista', 'eventos', desde, hasta],
    queryFn: async () => {
      const res = await fetch(`/api/eventos?desde=${desde}&hasta=${hasta}`)
      if (!res.ok) throw new Error('No se pudieron cargar los eventos')
      return res.json() as Promise<{ eventos: EventoResumen[]; verImportes: boolean }>
    },
    enabled: vista === 'eventos',
  })
  const reservas = useQuery({
    queryKey: ['eventos-lista', 'reservas', desde, hasta, soloSueltas],
    queryFn: async () => {
      const res = await fetch(`/api/eventos/reservas?desde=${desde}&hasta=${hasta}${soloSueltas ? '&sinEvento=1' : ''}`)
      if (!res.ok) throw new Error('No se pudieron cargar las reservas')
      return res.json() as Promise<{ reservas: ReservaFila[]; verImportes: boolean }>
    },
    enabled: vista === 'reservas',
  })

  const evs = eventos.data?.eventos ?? []
  const verImportes = (vista === 'eventos' ? eventos.data?.verImportes : reservas.data?.verImportes) ?? false
  const tot = useMemo(
    () => ({
      reservas: evs.reduce((s, e) => s + e.reservas, 0),
      personas: evs.reduce((s, e) => s + e.personas, 0),
      total: evs.reduce((s, e) => s + e.total, 0),
      cobrado: evs.reduce((s, e) => s + e.cobrado, 0),
      saldo: evs.reduce((s, e) => s + e.saldo, 0),
      // Lo cobrado de lo que sigue en pie sobre su total: total − saldo.
      pct: porcentajeCobrado(
        evs.reduce((s, e) => s + e.total, 0),
        evs.reduce((s, e) => s + e.total - e.saldo, 0)
      ),
    }),
    [evs]
  )

  return (
    <DashboardLayout>
      <Header
        title="Eventos y reservas"
        description="Qué hay en el período, cuánto se presupuestó, cuánto entró y cuánto falta."
        actions={
          puedeEditar ? (
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" onClick={() => setConfig(true)} title="Orígenes, tipos y avisos">
                <Settings2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" asChild className="gap-1.5">
                <Link href={'/eventos/evento/nuevo' as Route}>
                  <Plus className="h-4 w-4" />
                  Evento
                </Link>
              </Button>
              <Button className="gap-1.5" onClick={() => setNueva(true)}>
                <Plus className="h-4 w-4" />
                Reserva
              </Button>
            </div>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-slate-900/[0.05] p-1 text-sm">
          {(['eventos', 'reservas'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setVista(v)} className={cn('rounded-lg px-3 py-1.5', vista === v ? 'bg-white font-medium shadow-sm' : 'text-[var(--sec)]')}>
              {v === 'eventos' ? 'Eventos' : 'Reservas'}
            </button>
          ))}
        </div>
        <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-auto" aria-label="Desde" />
        <span className="text-sm text-[var(--ter)]">al</span>
        <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-auto" aria-label="Hasta" />
        {vista === 'reservas' && (
          <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-900/[0.12] bg-white px-3 text-sm">
            <input type="checkbox" checked={soloSueltas} onChange={(e) => setSoloSueltas(e.target.checked)} />
            Sólo sin evento
          </label>
        )}
      </div>

      {vista === 'reservas' ? (
        <TablaReservas reservas={reservas.data?.reservas ?? []} verImportes={verImportes} mostrarFecha mostrarEvento cargando={reservas.isLoading} />
      ) : (
        <div className="ax-card overflow-x-auto p-0">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-slate-900/[0.08] text-left text-xs uppercase tracking-wide text-[var(--ter)]">
                <th className="px-3 py-2.5 font-medium">Fecha</th>
                <th className="px-3 py-2.5 font-medium">Evento</th>
                <th className="px-3 py-2.5 text-right font-medium">Reservas</th>
                <th className="px-3 py-2.5 text-right font-medium">Personas</th>
                <th className="w-40 px-3 py-2.5 font-medium">Estados</th>
                <th className="px-3 py-2.5 font-medium">Cobrado</th>
                {verImportes && (
                  <>
                    <th className="px-3 py-2.5 text-right font-medium">Presupuestado</th>
                    <th className="px-3 py-2.5 text-right font-medium">$ cobrado</th>
                    <th className="px-3 py-2.5 text-right font-medium">Saldo</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {eventos.isLoading && (
                <tr>
                  <td colSpan={9} className="px-3 py-6">
                    <div className="h-4 animate-pulse rounded bg-slate-900/[0.05]" />
                  </td>
                </tr>
              )}
              {!eventos.isLoading && evs.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-[var(--ter)]">
                    No hay eventos en el período.
                  </td>
                </tr>
              )}
              {evs.map((e) => {
                const t = tipoEvento(e.tipo)
                const lleno = e.cupo ? e.personas / e.cupo : 0
                return (
                  <tr key={e.id} className="border-b border-slate-900/[0.05] hover:bg-slate-900/[0.025]">
                    <td className="whitespace-nowrap px-3 py-2">
                      {fechaCorta(e.fecha, true)}
                      {e.horaInicio && <span className="text-[var(--ter)]"> {e.horaInicio}</span>}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/eventos/evento/${e.id}` as Route} className="font-medium hover:text-[var(--azul-2)] hover:underline">
                        {e.nombre}
                      </Link>
                      {t && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-[var(--sec)]">
                          <span className="h-2 w-2 rounded-full" style={{ background: t.color ?? '#64748b' }} />
                          {t.nombre}
                        </span>
                      )}
                    </td>
                    <td className="ax-num px-3 py-2 text-right">{e.reservas}</td>
                    <td className={cn('ax-num whitespace-nowrap px-3 py-2 text-right', lleno > 1 ? 'text-[var(--rojo-t)]' : lleno >= 0.9 ? 'text-[var(--ambar-2)]' : '')}>
                      {e.personas}
                      {e.cupo ? <span className="text-[var(--ter)]">/{e.cupo}</span> : null}
                    </td>
                    <td className="px-3 py-2">
                      <BarraEstados siglas={e.siglas} />
                    </td>
                    <td className="px-3 py-2">{e.reservas > 0 && <BarraCobro pct={e.porcentajeCobrado} />}</td>
                    {verImportes && (
                      <>
                        <td className="ax-num whitespace-nowrap px-3 py-2 text-right">{pesos(e.total)}</td>
                        <td className="ax-num whitespace-nowrap px-3 py-2 text-right text-[var(--verde)]">{pesos(e.cobrado)}</td>
                        <td className="ax-num whitespace-nowrap px-3 py-2 text-right font-medium">{pesos(e.saldo)}</td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
            {evs.length > 0 && (
              <tfoot>
                <tr className="bg-slate-900/[0.025] font-medium">
                  <td className="px-3 py-2.5" colSpan={2}>
                    {evs.length} evento{evs.length === 1 ? '' : 's'}
                  </td>
                  <td className="ax-num px-3 py-2.5 text-right">{tot.reservas}</td>
                  <td className="ax-num px-3 py-2.5 text-right">{tot.personas}</td>
                  <td />
                  <td className="px-3 py-2.5">{verImportes && <BarraCobro pct={tot.pct} />}</td>
                  {verImportes && (
                    <>
                      <td className="ax-num whitespace-nowrap px-3 py-2.5 text-right">{pesos(tot.total)}</td>
                      <td className="ax-num whitespace-nowrap px-3 py-2.5 text-right text-[var(--verde)]">{pesos(tot.cobrado)}</td>
                      <td className="ax-num whitespace-nowrap px-3 py-2.5 text-right">{pesos(tot.saldo)}</td>
                    </>
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <NuevaReservaDialog abierto={nueva} onCerrar={() => setNueva(false)} />
      <ConfiguracionDialog abierto={config} onCerrar={() => setConfig(false)} />
    </DashboardLayout>
  )
}

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { LeyendaEstados, alternarSigla, claseSelect, useCatalogos } from '@/components/eventos/comunes'
import { NuevaReservaDialog } from '@/components/eventos/nueva-reserva'
import { VistaDia, VistaMes, VistaSemana, colorTipo, diasDelMes, inicioSemana, type Entrada } from '@/components/eventos/calendario'
import { useUser } from '@/hooks/use-user'
import { SECCION } from '@/lib/permisos'
import { hoyAR, sumarDias } from '@/lib/fechas'
import { dadaDeBaja, fechaCorta, type Sigla } from '@/lib/eventos/constantes'
import type { AgendaFila, EventoResumen, ReservaFila } from '@/lib/eventos/db'
import { cn } from '@/lib/utils'

type Vista = 'mes' | 'semana' | 'dia'

/**
 * Calendario de eventos y reservas. Los eventos se ven con su color de tipo,
 * la barra de estados de sus reservas y el % cobrado; las reservas sueltas,
 * con el color de su estado; la agenda pendiente, punteada.
 */
export default function CalendarioEventos() {
  const hoy = hoyAR()
  const { canEdit } = useUser()
  const puedeEditar = canEdit(SECCION.EVENTOS_RESERVAS)
  const { salones, tipos, tipoEvento } = useCatalogos()
  const [vista, setVista] = useState<Vista>('mes')
  const [ancla, setAncla] = useState(hoy)
  const [salon, setSalon] = useState('')
  const [tipo, setTipo] = useState('')
  const [siglas, setSiglas] = useState<Sigla[]>([])
  const [conAgenda, setConAgenda] = useState(true)
  const [nueva, setNueva] = useState(false)

  const mes = ancla.slice(0, 7)
  const { desde, hasta } = useMemo(() => {
    if (vista === 'mes') {
      const d = diasDelMes(mes)
      return { desde: d[0]!, hasta: d[d.length - 1]! }
    }
    if (vista === 'semana') {
      const d = inicioSemana(ancla)
      return { desde: d, hasta: sumarDias(d, 6) }
    }
    return { desde: ancla, hasta: ancla }
  }, [vista, ancla, mes])

  const { data, isLoading } = useQuery({
    queryKey: ['eventos-calendario', desde, hasta],
    queryFn: async () => {
      const res = await fetch(`/api/eventos/calendario?desde=${desde}&hasta=${hasta}`)
      if (!res.ok) throw new Error('No se pudo cargar el calendario')
      return res.json() as Promise<{ eventos: EventoResumen[]; reservas: ReservaFila[]; agenda: AgendaFila[] }>
    },
  })

  const porDia = useMemo(() => {
    const m = new Map<string, Entrada[]>()
    const push = (x: Entrada) => {
      const arr = m.get(x.fecha)
      if (arr) arr.push(x)
      else m.set(x.fecha, [x])
    }
    const conSigla = (s: Sigla) => siglas.length === 0 || siglas.includes(s)
    for (const e of data?.eventos ?? []) {
      if (tipo && tipo !== e.tipo) continue
      if (salon && e.salonIds.length > 0 && !e.salonIds.includes(salon)) continue
      if (siglas.length && !siglas.some((s) => (e.siglas[s] ?? 0) > 0)) continue
      push({ clase: 'evento', id: `e-${e.id}`, fecha: e.fecha, hora: e.horaInicio, e })
    }
    for (const r of data?.reservas ?? []) {
      if (tipo && tipo !== 'A_LA_CARTA') continue
      if (salon && r.sectorId !== salon) continue
      if (!conSigla(r.sigla)) continue
      push({ clase: 'reserva', id: `r-${r.id}`, fecha: r.fecha, hora: r.hora, r })
    }
    if (conAgenda) {
      for (const g of data?.agenda ?? []) {
        if (g.estado === 'CANCELADA') continue
        const local = new Date(g.fechaHora).toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
        push({ clase: 'agenda', id: `g-${g.id}`, fecha: local.slice(0, 10), hora: local.slice(11, 16), g })
      }
    }
    for (const xs of m.values()) xs.sort((a, b) => (a.hora ?? '99').localeCompare(b.hora ?? '99'))
    return m
  }, [data, tipo, salon, siglas, conAgenda])

  const colorDe = (t: string) => colorTipo(tipoEvento(t)?.color)
  const mover = (n: number) => {
    if (vista === 'mes') {
      const [y, mm] = mes.split('-').map(Number) as [number, number]
      const d = new Date(Date.UTC(y, mm - 1 + n, 1))
      setAncla(d.toISOString().slice(0, 10))
    } else setAncla(sumarDias(ancla, vista === 'semana' ? 7 * n : n))
  }
  const titulo =
    vista === 'mes'
      ? new Date(`${mes}-15T12:00:00Z`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      : vista === 'semana'
        ? `${fechaCorta(desde)} al ${fechaCorta(hasta)}`
        : fechaCorta(ancla, true)

  // Lo que muestra el rango: personas con lugar (sin rechazadas ni canceladas).
  const resumen = useMemo(() => {
    let personas = 0
    let eventos = 0
    let reservas = 0
    for (const xs of porDia.values())
      for (const x of xs) {
        if (x.clase === 'evento') {
          eventos++
          personas += x.e.personas
        } else if (x.clase === 'reserva' && !dadaDeBaja(x.r.estado)) {
          reservas++
          personas += x.r.personas
        }
      }
    return { personas, eventos, reservas }
  }, [porDia])

  return (
    <DashboardLayout>
      <Header
        title="Eventos y reservas"
        description="Funciones con sus reservas, reservas sueltas y lo que hay que hacer con cada una."
        actions={
          puedeEditar ? (
            <div className="flex gap-2">
              <Button variant="outline" asChild className="gap-1.5">
                <Link href={`/eventos/evento/nuevo${vista === 'dia' ? `?fecha=${ancla}` : ''}` as Route}>
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
        <div className="flex items-center rounded-xl border border-slate-900/[0.12] bg-white">
          <button type="button" onClick={() => mover(-1)} className="grid h-10 w-10 place-items-center rounded-l-xl text-slate-500 hover:bg-slate-50" aria-label="Anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[10rem] px-2 text-center text-sm font-medium capitalize">{titulo}</span>
          <button type="button" onClick={() => mover(1)} className="grid h-10 w-10 place-items-center rounded-r-xl text-slate-500 hover:bg-slate-50" aria-label="Siguiente">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="inline-flex rounded-xl bg-slate-900/[0.05] p-1 text-sm">
          {(['mes', 'semana', 'dia'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setVista(v)} className={cn('rounded-lg px-3 py-1.5', vista === v ? 'bg-white font-medium shadow-sm' : 'text-[var(--sec)]')}>
              {v === 'mes' ? 'Mes' : v === 'semana' ? 'Semana' : 'Día'}
            </button>
          ))}
        </div>
        {ancla !== hoy && (
          <button type="button" onClick={() => setAncla(hoy)} className="h-10 rounded-xl px-3 text-sm text-[var(--azul-2)] hover:bg-slate-900/[0.05]">
            Hoy
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {salones.length > 1 && (
            <select value={salon} onChange={(e) => setSalon(e.target.value)} className={cn(claseSelect, 'w-auto rounded-xl')}>
              <option value="">Todos los salones</option>
              {salones.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          )}
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={cn(claseSelect, 'w-auto rounded-xl')}>
            <option value="">Todos los tipos</option>
            {tipos.map((t) => (
              <option key={t.clave} value={t.clave}>
                {t.nombre}
              </option>
            ))}
            <option value="A_LA_CARTA">Reservas sueltas</option>
          </select>
          <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-900/[0.12] bg-white px-3 text-sm">
            <input type="checkbox" checked={conAgenda} onChange={(e) => setConAgenda(e.target.checked)} />
            Agenda
          </label>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <LeyendaEstados activas={siglas} onAlternar={(s) => setSiglas((xs) => alternarSigla(xs, s))} />
        <p className="ax-num text-sm text-[var(--sec)]">
          {resumen.eventos} eventos · {resumen.reservas} reservas sueltas · <b>{resumen.personas}</b> personas
        </p>
      </div>

      {isLoading ? (
        <div className="h-[32rem] animate-pulse rounded-2xl bg-slate-900/[0.04]" />
      ) : vista === 'mes' ? (
        <VistaMes
          mes={mes}
          porDia={porDia}
          hoy={hoy}
          colorDe={colorDe}
          onDia={(d) => {
            setAncla(d)
            setVista('dia')
          }}
        />
      ) : vista === 'semana' ? (
        <VistaSemana
          desde={desde}
          porDia={porDia}
          hoy={hoy}
          colorDe={colorDe}
          onDia={(d) => {
            setAncla(d)
            setVista('dia')
          }}
        />
      ) : (
        <VistaDia entradas={porDia.get(ancla) ?? []} colorDe={colorDe} />
      )}

      <NuevaReservaDialog abierto={nueva} onCerrar={() => setNueva(false)} fecha={vista === 'dia' ? ancla : hoy} />
    </DashboardLayout>
  )
}

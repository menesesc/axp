'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarClock, Check, CircleDot, History, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TIPOS_AGENDA, TIPO_AGENDA_TEXTO, type TipoAgenda } from '@/lib/eventos/constantes'
import type { AgendaFila, AuditoriaFila } from '@/lib/eventos/db'
import { hoyAR } from '@/lib/fechas'
import { cn } from '@/lib/utils'
import { Campo, avisarError, claseSelect, enviar, useCatalogos } from './comunes'

/**
 * Línea de tiempo de una reserva o un evento. Junta dos cosas:
 *
 *   - la auditoría, que escribe el sistema y no se toca (gris, compacta);
 *   - la agenda, que carga la gente: visitas, degustaciones, llamados. Las
 *     pendientes van arriba y resaltadas, porque son lo que hay que hacer.
 */

type Item =
  | { clase: 'auditoria'; cuando: number; a: AuditoriaFila }
  | { clase: 'agenda'; cuando: number; g: AgendaFila }

const fmt = (d: Date | string) =>
  new Date(d).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: 'numeric',
    month: 'numeric',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

export function LineaTiempo({
  auditoria,
  agenda,
  eventoId,
  reservaId,
  puedeEditar,
  onCambio,
}: {
  auditoria: AuditoriaFila[]
  agenda: AgendaFila[]
  eventoId?: string | undefined
  reservaId?: string | undefined
  puedeEditar: boolean
  onCambio: () => void
}) {
  const [vista, setVista] = useState<'todo' | 'agenda' | 'cambios'>('todo')
  // En la ficha del evento, los cambios de cada reserva son muchos: por
  // defecto se ven sólo los del evento y lo que cambia estado o plata.
  const [detalleReservas, setDetalleReservas] = useState(false)
  const [nueva, setNueva] = useState(false)

  const pendientes = agenda.filter((g) => g.estado === 'PENDIENTE').sort((a, b) => +new Date(a.fechaHora) - +new Date(b.fechaHora))

  const items = useMemo(() => {
    const xs: Item[] = []
    if (vista !== 'agenda') {
      for (const a of auditoria) {
        if (a.accion === 'agenda') continue // ya se ve en la propia agenda
        if (eventoId && !reservaId && a.reservaId && !detalleReservas && !['creada', 'estado', 'pago', 'pago_anulado', 'cupo_excedido'].includes(a.accion)) continue
        xs.push({ clase: 'auditoria', cuando: +new Date(a.createdAt), a })
      }
    }
    if (vista !== 'cambios') {
      for (const g of agenda) if (g.estado !== 'PENDIENTE') xs.push({ clase: 'agenda', cuando: +new Date(g.fechaHora), g })
    }
    return xs.sort((x, y) => y.cuando - x.cuando)
  }, [auditoria, agenda, vista, detalleReservas, eventoId, reservaId])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-slate-900/[0.05] p-1 text-sm">
          {(['todo', 'agenda', 'cambios'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVista(v)}
              className={cn('rounded-lg px-3 py-1', vista === v ? 'bg-white font-medium shadow-sm' : 'text-[var(--sec)]')}
            >
              {v === 'todo' ? 'Todo' : v === 'agenda' ? 'Agenda' : 'Cambios'}
            </button>
          ))}
        </div>
        {eventoId && !reservaId && vista !== 'agenda' && (
          <label className="inline-flex items-center gap-2 text-xs text-[var(--sec)]">
            <input type="checkbox" checked={detalleReservas} onChange={(e) => setDetalleReservas(e.target.checked)} />
            Todos los cambios de las reservas
          </label>
        )}
        {puedeEditar && (
          <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => setNueva((v) => !v)}>
            <Plus className="h-3.5 w-3.5" />
            Agendar
          </Button>
        )}
      </div>

      {nueva && <NuevaAgenda eventoId={reservaId ? undefined : eventoId} reservaId={reservaId} onListo={() => { setNueva(false); onCambio() }} />}

      {pendientes.length > 0 && vista !== 'cambios' && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--ter)]">Pendiente</p>
          {pendientes.map((g) => (
            <AgendaItem key={g.id} g={g} puedeEditar={puedeEditar} onCambio={onCambio} mostrarReserva={!reservaId} />
          ))}
        </div>
      )}

      <ol className="relative space-y-3 border-l border-slate-900/[0.1] pl-5">
        {items.length === 0 && <li className="text-sm text-[var(--ter)]">Sin movimientos todavía.</li>}
        {items.map((it) =>
          it.clase === 'auditoria' ? (
            <li key={it.a.id} className="relative">
              <span className="absolute -left-[1.6rem] top-1 grid h-4 w-4 place-items-center rounded-full bg-white">
                <History className="h-3.5 w-3.5 text-slate-400" />
              </span>
              <p className="text-sm text-slate-700">
                {!reservaId && it.a.reservaNumero != null && (
                  <Link href={`/eventos/reserva/${it.a.reservaId}` as Route} className="mr-1 font-medium text-[var(--azul-2)] hover:underline">
                    #{it.a.reservaNumero} {it.a.reservaNombre}:
                  </Link>
                )}
                {it.a.descripcion}
              </p>
              <p className="text-xs text-[var(--ter)]">
                {fmt(it.a.createdAt)} · {it.a.usuarioNombre ?? 'Sistema'}
              </p>
            </li>
          ) : (
            <li key={it.g.id} className="relative">
              <span className="absolute -left-[1.6rem] top-1 grid h-4 w-4 place-items-center rounded-full bg-white">
                <CalendarClock className="h-3.5 w-3.5 text-[var(--azul)]" />
              </span>
              <AgendaItem g={it.g} puedeEditar={puedeEditar} onCambio={onCambio} compacto mostrarReserva={!reservaId} />
            </li>
          )
        )}
      </ol>
    </div>
  )
}

function AgendaItem({
  g,
  puedeEditar,
  onCambio,
  compacto,
  mostrarReserva,
}: {
  g: AgendaFila
  puedeEditar: boolean
  onCambio: () => void
  compacto?: boolean
  mostrarReserva?: boolean
}) {
  const cambiar = useMutation({
    mutationFn: (cuerpo: Record<string, unknown>) => enviar('/api/eventos/agenda', 'PATCH', { id: g.id, ...cuerpo }),
    onSuccess: () => {
      toast.success('Listo')
      onCambio()
    },
    onError: avisarError,
  })
  const vencida = g.estado === 'PENDIENTE' && new Date(g.fechaHora).getTime() < Date.now()
  const hoy = g.estado === 'PENDIENTE' && new Date(g.fechaHora).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }) === hoyAR()

  return (
    <div
      className={cn(
        compacto ? '' : 'rounded-xl border border-dashed p-3',
        !compacto && (vencida ? 'border-rose-300 bg-rose-50/60' : hoy ? 'border-amber-300 bg-amber-50/60' : 'border-[var(--azul)]/40 bg-sky-50/40')
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn('text-sm', g.estado === 'CANCELADA' && 'text-[var(--ter)] line-through', g.estado === 'PENDIENTE' && 'font-medium')}>
            <span className="mr-1.5 text-xs font-normal text-[var(--sec)]">{TIPO_AGENDA_TEXTO[g.tipo as TipoAgenda] ?? g.tipo}</span>
            {g.titulo}
            {mostrarReserva && g.reservaId && (
              <Link href={`/eventos/reserva/${g.reservaId}` as Route} className="ml-1.5 text-xs text-[var(--azul-2)] hover:underline">
                #{g.reservaNumero} {g.reservaNombre}
              </Link>
            )}
          </p>
          <p className="text-xs text-[var(--ter)]">
            {fmt(g.fechaHora)}
            {g.responsableNombre && ` · ${g.responsableNombre}`}
            {g.estado === 'HECHA' && ' · hecha'}
            {g.estado === 'CANCELADA' && ' · cancelada'}
            {vencida && <span className="font-medium text-[var(--rojo-t)]"> · vencida</span>}
            {hoy && !vencida && <span className="font-medium text-[var(--ambar-2)]"> · hoy</span>}
          </p>
          {g.resultado && <p className="mt-1 text-sm text-slate-700">{g.resultado}</p>}
        </div>
        {puedeEditar && g.estado === 'PENDIENTE' && (
          <div className="flex shrink-0 gap-1">
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={cambiar.isPending}
              onClick={() => {
                const resultado = window.prompt('¿Cómo salió? (opcional)')
                if (resultado === null) return
                cambiar.mutate({ estado: 'HECHA', resultado })
              }}
            >
              <Check className="h-3.5 w-3.5" />
              Hecha
            </Button>
            <Button size="sm" variant="ghost" title="Cancelar" disabled={cambiar.isPending} onClick={() => window.confirm('¿Cancelar este pendiente?') && cambiar.mutate({ estado: 'CANCELADA' })}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {puedeEditar && g.estado !== 'PENDIENTE' && !compacto && (
          <Button size="sm" variant="ghost" onClick={() => cambiar.mutate({ estado: 'PENDIENTE' })}>
            <CircleDot className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

function NuevaAgenda({ eventoId, reservaId, onListo }: { eventoId?: string | undefined; reservaId?: string | undefined; onListo: () => void }) {
  const { usuarios } = useCatalogos()
  const [f, setF] = useState({ tipo: 'LLAMADO', titulo: '', fecha: hoyAR(), hora: '10:00', responsableId: '' })
  const crear = useMutation({
    mutationFn: () =>
      enviar('/api/eventos/agenda', 'POST', {
        eventoId: eventoId ?? null,
        reservaId: reservaId ?? null,
        tipo: f.tipo,
        titulo: f.titulo,
        fechaHora: `${f.fecha}T${f.hora}`,
        responsableId: f.responsableId || null,
      }),
    onSuccess: () => {
      toast.success('Agendado')
      onListo()
    },
    onError: avisarError,
  })
  return (
    <form
      className="grid gap-2 rounded-xl border border-slate-900/[0.1] bg-slate-900/[0.02] p-3 sm:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault()
        crear.mutate()
      }}
    >
      <Campo etiqueta="Tipo" className="sm:col-span-2">
        <select value={f.tipo} onChange={(e) => setF((x) => ({ ...x, tipo: e.target.value }))} className={claseSelect}>
          {TIPOS_AGENDA.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.texto}
            </option>
          ))}
        </select>
      </Campo>
      <Campo etiqueta="Qué" className="sm:col-span-4">
        <Input value={f.titulo} onChange={(e) => setF((x) => ({ ...x, titulo: e.target.value }))} placeholder={TIPO_AGENDA_TEXTO[f.tipo as TipoAgenda]} />
      </Campo>
      <Campo etiqueta="Fecha" className="sm:col-span-2">
        <Input type="date" value={f.fecha} onChange={(e) => setF((x) => ({ ...x, fecha: e.target.value }))} />
      </Campo>
      <Campo etiqueta="Hora">
        <Input type="time" value={f.hora} onChange={(e) => setF((x) => ({ ...x, hora: e.target.value }))} />
      </Campo>
      <Campo etiqueta="Responsable" className="sm:col-span-2">
        <select value={f.responsableId} onChange={(e) => setF((x) => ({ ...x, responsableId: e.target.value }))} className={claseSelect}>
          <option value="">—</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Button type="submit" className="self-end" disabled={crear.isPending || !f.fecha || !f.hora}>
        Guardar
      </Button>
    </form>
  )
}

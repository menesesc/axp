'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { hoyAR, sumarDias } from '@/lib/fechas'
import { fechaCorta } from '@/lib/eventos/constantes'
import type { EventoResumen } from '@/lib/eventos/db'
import { Campo, avisarError, claseSelect, claseTextarea, enviarConCupo, useCatalogos } from './comunes'
import { SelectorCliente } from './clientes'

/**
 * Carga rápida dentro de un evento: nombre, teléfono, personas y origen. El
 * resto (fecha, hora, salón, precios, plan de pagos) lo hereda del evento.
 * Enter guarda y deja el cursor en el nombre para la siguiente: así se cargan
 * cien reservas del 31/12 sin tocar el mouse.
 */
export function ReservaRapida({ eventoId, onCreada }: { eventoId: string; onCreada?: () => void }) {
  const { origenes } = useCatalogos()
  const qc = useQueryClient()
  const nombreRef = useRef<HTMLInputElement>(null)
  const [f, setF] = useState({ nombre: '', telefono: '', adultos: '2', menores: '', origen: '' })

  const crear = useMutation({
    mutationFn: () =>
      enviarConCupo('/api/eventos/reservas', 'POST', {
        eventoId,
        nombre: f.nombre,
        contactoTelefono: f.telefono,
        adultos: Number(f.adultos) || 0,
        menores: Number(f.menores) || 0,
        origen: f.origen || null,
      }),
    onSuccess: (r: { numero: number }) => {
      toast.success(`Reserva #${r.numero} cargada`)
      // El origen queda: suelen entrar varias seguidas por el mismo canal.
      setF((x) => ({ ...x, nombre: '', telefono: '', adultos: '2', menores: '' }))
      qc.invalidateQueries({ queryKey: ['evento', eventoId] })
      onCreada?.()
      nombreRef.current?.focus()
    },
    onError: avisarError,
  })

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (f.nombre.trim() && !crear.isPending) crear.mutate()
      }}
      className="ax-card grid grid-cols-2 gap-2 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_4.5rem_4.5rem_minmax(0,1fr)_auto] sm:items-end"
    >
      <Campo etiqueta="Nombre" className="col-span-2 sm:col-span-1">
        <Input ref={nombreRef} value={f.nombre} onChange={set('nombre')} placeholder="Familia Pérez" />
      </Campo>
      <Campo etiqueta="Teléfono" className="col-span-2 sm:col-span-1">
        <Input value={f.telefono} onChange={set('telefono')} inputMode="tel" />
      </Campo>
      <Campo etiqueta="Adultos">
        <Input value={f.adultos} onChange={set('adultos')} inputMode="numeric" />
      </Campo>
      <Campo etiqueta="Menores">
        <Input value={f.menores} onChange={set('menores')} inputMode="numeric" placeholder="0" />
      </Campo>
      <Campo etiqueta="Origen" className="col-span-2 sm:col-span-1">
        <select value={f.origen} onChange={set('origen')} className={claseSelect}>
          <option value="">—</option>
          {origenes.filter((o) => o.activo).map((o) => (
            <option key={o.clave} value={o.clave}>
              {o.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Button type="submit" className="col-span-2 gap-1.5 sm:col-span-1" disabled={!f.nombre.trim() || crear.isPending}>
        <Plus className="h-4 w-4" />
        {crear.isPending ? 'Cargando…' : 'Agregar'}
      </Button>
    </form>
  )
}

/**
 * Alta completa de una reserva: a la carta (sin evento) o dentro de un
 * evento. Al crearla se abre su ficha para seguir con pagos, mesas y demás.
 */
export function NuevaReservaDialog({
  abierto,
  onCerrar,
  eventoId: eventoInicial,
  fecha: fechaInicial,
}: {
  abierto: boolean
  onCerrar: () => void
  eventoId?: string
  fecha?: string
}) {
  const router = useRouter()
  const qc = useQueryClient()
  const { origenes, salones } = useCatalogos()
  const hoy = hoyAR()
  const [f, setF] = useState(() => vacio(eventoInicial, fechaInicial ?? hoy))

  useEffect(() => {
    if (abierto) setF(vacio(eventoInicial, fechaInicial ?? hoy))
  }, [abierto, eventoInicial, fechaInicial, hoy])

  const { data: eventos } = useQuery({
    queryKey: ['eventos-proximos'],
    queryFn: async () => {
      const res = await fetch(`/api/eventos?desde=${sumarDias(hoy, -7)}&hasta=${sumarDias(hoy, 400)}`)
      if (!res.ok) throw new Error('No se pudieron cargar los eventos')
      return res.json() as Promise<{ eventos: EventoResumen[] }>
    },
    enabled: abierto,
  })

  const crear = useMutation({
    mutationFn: () =>
      enviarConCupo('/api/eventos/reservas', 'POST', {
        eventoId: f.eventoId || null,
        nombre: f.nombre,
        contactoNombre: f.contactoNombre,
        contactoTelefono: f.contactoTelefono,
        titularId: f.titularId || null,
        ...(f.eventoId ? {} : { fecha: f.fecha, hora: f.hora || null, sectorId: f.sectorId || null }),
        adultos: Number(f.adultos) || 0,
        menores: Number(f.menores) || 0,
        bebes: Number(f.bebes) || 0,
        liberados: Number(f.liberados) || 0,
        origen: f.origen || null,
        observaciones: f.observaciones,
        estado: f.aprobada ? 'APROBADO' : 'PRESUPUESTO',
      }),
    onSuccess: (r: { id: string; numero: number }) => {
      toast.success(`Reserva #${r.numero} creada`)
      qc.invalidateQueries({ queryKey: ['eventos-calendario'] })
      qc.invalidateQueries({ queryKey: ['eventos-lista'] })
      onCerrar()
      router.push(`/eventos/reserva/${r.id}` as Route)
    },
    onError: avisarError,
  })

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }))
  const evento = eventos?.eventos.find((e) => e.id === f.eventoId)

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva reserva</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault()
            crear.mutate()
          }}
        >
          <Campo etiqueta="Evento" className="sm:col-span-4" ayuda={f.eventoId ? 'Fecha, hora, precios y plan de pagos salen del evento' : 'Sin evento: reserva a la carta o privada suelta'}>
            <select value={f.eventoId} onChange={set('eventoId')} className={claseSelect}>
              <option value="">Sin evento (a la carta)</option>
              {(eventos?.eventos ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {fechaCorta(e.fecha, true)} · {e.nombre}
                  {e.cupo ? ` (${e.personas}/${e.cupo})` : ''}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Nombre de la reserva" className="sm:col-span-2">
            <Input value={f.nombre} onChange={set('nombre')} autoFocus placeholder="Familia Pérez, Cumple de Juli…" />
          </Campo>
          <Campo etiqueta="Contacto">
            <Input value={f.contactoNombre} onChange={set('contactoNombre')} />
          </Campo>
          <Campo etiqueta="Teléfono">
            <Input value={f.contactoTelefono} onChange={set('contactoTelefono')} inputMode="tel" />
          </Campo>
          {!f.eventoId && (
            <>
              <Campo etiqueta="Fecha">
                <Input type="date" value={f.fecha} onChange={set('fecha')} />
              </Campo>
              <Campo etiqueta="Hora">
                <Input type="time" value={f.hora} onChange={set('hora')} />
              </Campo>
              <Campo etiqueta="Salón" className="sm:col-span-2">
                <select value={f.sectorId} onChange={set('sectorId')} className={claseSelect}>
                  <option value="">—</option>
                  {salones.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
            </>
          )}
          {evento && (
            <p className="rounded-lg bg-slate-900/[0.04] px-3 py-2 text-xs text-[var(--sec)] sm:col-span-4">
              {fechaCorta(evento.fecha, true)} {evento.horaInicio ?? ''} · {evento.personas} personas
              {evento.cupo ? ` de ${evento.cupo} (quedan ${evento.cupo - evento.personas})` : ''}
            </p>
          )}
          <Campo etiqueta="Adultos">
            <Input value={f.adultos} onChange={set('adultos')} inputMode="numeric" />
          </Campo>
          <Campo etiqueta="Menores">
            <Input value={f.menores} onChange={set('menores')} inputMode="numeric" placeholder="0" />
          </Campo>
          <Campo etiqueta="Bebés" ayuda="No pagan">
            <Input value={f.bebes} onChange={set('bebes')} inputMode="numeric" placeholder="0" />
          </Campo>
          <Campo etiqueta="Liberados" ayuda="Gratis, salvo precio a mano">
            <Input value={f.liberados} onChange={set('liberados')} inputMode="numeric" placeholder="0" />
          </Campo>
          <Campo etiqueta="Origen" className="sm:col-span-2">
            <select value={f.origen} onChange={set('origen')} className={claseSelect}>
              <option value="">—</option>
              {origenes.filter((o) => o.activo).map((o) => (
                <option key={o.clave} value={o.clave}>
                  {o.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Cliente (para facturar)" className="sm:col-span-2">
            <SelectorCliente value={f.titularId} onChange={(id) => setF((x) => ({ ...x, titularId: id }))} />
          </Campo>
          <Campo etiqueta="Observaciones" className="sm:col-span-4">
            <textarea value={f.observaciones} onChange={set('observaciones')} className={claseTextarea} />
          </Campo>
          <label className="flex items-center gap-2 text-sm sm:col-span-4">
            <input type="checkbox" checked={f.aprobada} onChange={(e) => setF((x) => ({ ...x, aprobada: e.target.checked }))} />
            Ya está confirmada (nace aprobada, sin pasar por presupuesto)
          </label>
          <div className="flex justify-end gap-2 sm:col-span-4">
            <Button type="button" variant="ghost" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={crear.isPending || !f.nombre.trim()}>
              {crear.isPending ? 'Creando…' : 'Crear reserva'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function vacio(eventoId: string | undefined, fecha: string) {
  return {
    eventoId: eventoId ?? '',
    nombre: '',
    contactoNombre: '',
    contactoTelefono: '',
    titularId: '',
    fecha,
    hora: '',
    sectorId: '',
    adultos: '2',
    menores: '',
    bebes: '',
    liberados: '',
    origen: '',
    observaciones: '',
    aprobada: !eventoId,
  }
}

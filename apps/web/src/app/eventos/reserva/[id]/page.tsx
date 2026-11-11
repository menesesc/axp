'use client'

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Ban, CheckCircle2, FileText, Lock, Plus, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { pesos } from '@/components/dashboard/inicio'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Campo, SelectSimple, SiglaBadge, avisarError, claseSelect, claseTextarea, enviar, enviarConCupo, useCatalogos } from '@/components/eventos/comunes'
import { SelectorCliente } from '@/components/eventos/clientes'
import { LineaTiempo } from '@/components/eventos/linea-tiempo'
import { MenuReserva } from '@/components/eventos/menu-tab'
import { useUser } from '@/hooks/use-user'
import { SECCION } from '@/lib/permisos'
import { hoyAR } from '@/lib/fechas'
import {
  COBRO_TEXTO,
  ESTADO_TEXTO,
  IVA_MODOS,
  MEDIOS,
  MEDIO_TEXTO,
  REGIMENES,
  calcularTotal,
  fechaCorta,
  parsearMonto,
  type CuotaCalculada,
  type EstadoReserva,
  type IvaModo,
  type MedioPago,
  type Regimen,
} from '@/lib/eventos/constantes'
import { sumaAdicionales } from '@/lib/eventos/menu'
import type { AgendaFila, AuditoriaFila, EventoBase, PagoFila, ReservaFila, ReservaPropia } from '@/lib/eventos/db'
import { cn } from '@/lib/utils'

interface Ficha {
  reserva: ReservaFila
  propia: ReservaPropia
  plan: CuotaCalculada[]
  pagos: PagoFila[]
  auditoria: AuditoriaFila[]
  agenda: AgendaFila[]
  evento: EventoBase | null
  verImportes: boolean
  verCobros: boolean
  puedeCobrar: boolean
}

export default function FichaReserva({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const qc = useQueryClient()
  const { canEdit } = useUser()
  const puedeEditar = canEdit(SECCION.EVENTOS_RESERVAS)
  const [tab, setTab] = useState('general')

  const { data, isLoading, error } = useQuery({
    queryKey: ['reserva', id],
    queryFn: async () => {
      const res = await fetch(`/api/eventos/reservas/${id}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo cargar la reserva')
      return res.json() as Promise<Ficha>
    },
  })
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['reserva', id] })
    if (data?.reserva.eventoId) qc.invalidateQueries({ queryKey: ['evento', data.reserva.eventoId] })
  }

  if (error) {
    return (
      <DashboardLayout>
        <p className="py-10 text-center text-sm text-[var(--sec)]">{(error as Error).message}</p>
      </DashboardLayout>
    )
  }
  const r = data?.reserva

  return (
    <DashboardLayout>
      <Header
        compacto
        title={r ? `#${r.numero} · ${r.nombre}` : 'Reserva'}
        description={
          r
            ? [
                `${fechaCorta(r.fecha, true)}${r.hora ? ` ${r.hora}` : ''}`,
                `${r.personas} personas`,
                r.salon,
                r.mesas.length ? `mesa ${r.mesas.join(', ')}` : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" asChild>
              <Link href={(r?.eventoId ? `/eventos/evento/${r.eventoId}` : '/eventos/lista') as Route}>
                <ArrowLeft className="h-4 w-4" />
                {r?.eventoNombre ? <span className="hidden sm:inline">{r.eventoNombre}</span> : null}
              </Link>
            </Button>
            <Button variant="outline" asChild className="gap-1.5">
              <Link href={`/eventos/reserva/${id}/presupuesto` as Route}>
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Presupuesto</span>
              </Link>
            </Button>
          </div>
        }
      />

      {isLoading || !data || !r ? (
        <div className="h-64 animate-pulse rounded-2xl bg-slate-900/[0.04]" />
      ) : (
        <>
          <Estado ficha={data} puedeEditar={puedeEditar} onCambio={refrescar} />

          <Tabs value={tab} onValueChange={setTab} className="mt-5">
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="personas">Personas{r.regimenes.length ? ' · regímenes' : ''}</TabsTrigger>
              <TabsTrigger value="menu">Menú · adicionales</TabsTrigger>
              {data.verCobros && <TabsTrigger value="pagos">Pagos</TabsTrigger>}
              <TabsTrigger value="timeline">Línea de tiempo</TabsTrigger>
              <TabsTrigger value="proximamente" className="text-[var(--ter)]">
                Salón · Personal
              </TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="mt-4">
              <General ficha={data} puedeEditar={puedeEditar} onCambio={refrescar} />
            </TabsContent>
            <TabsContent value="personas" className="mt-4">
              <Personas ficha={data} puedeEditar={puedeEditar} onCambio={refrescar} />
            </TabsContent>
            <TabsContent value="menu" className="mt-4">
              <MenuReserva reservaId={id} puedeEditar={puedeEditar} onCambio={refrescar} />
            </TabsContent>
            {data.verCobros && (
              <TabsContent value="pagos" className="mt-4">
                <Pagos ficha={data} puedeEditar={puedeEditar} onCambio={refrescar} />
              </TabsContent>
            )}
            <TabsContent value="timeline" className="mt-4">
              <div className="ax-card max-w-4xl p-5">
                <LineaTiempo auditoria={data.auditoria} agenda={data.agenda} reservaId={id} eventoId={r.eventoId ?? undefined} puedeEditar={puedeEditar} onCambio={refrescar} />
              </div>
            </TabsContent>
            <TabsContent value="proximamente" className="mt-4">
              <div className="ax-card max-w-2xl p-6 text-sm text-[var(--sec)]">
                <p className="ax-card-titulo mb-2">Próximamente</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Plano del salón con las mesas asignadas, respetando las inamovibles.</li>
                  <li>Personal asignado y hoja de servicio.</li>
                </ul>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </DashboardLayout>
  )
}

/* ------------------------------------------------------------ estado */

/**
 * La sigla y los botones para mover el estado manual. El cobro no tiene
 * botón: se mueve solo con los pagos.
 */
function Estado({ ficha, puedeEditar, onCambio }: { ficha: Ficha; puedeEditar: boolean; onCambio: () => void }) {
  const r = ficha.reserva
  const [cancelar, setCancelar] = useState(false)
  const cambiar = useMutation({
    mutationFn: (cuerpo: Record<string, unknown>) => enviarConCupo(`/api/eventos/reservas/${r.id}/estado`, 'POST', cuerpo),
    onSuccess: () => {
      toast.success('Estado actualizado')
      setCancelar(false)
      onCambio()
    },
    onError: avisarError,
  })
  const ir = (estado: EstadoReserva) => cambiar.mutate({ estado })

  const botones: Array<{ texto: string; icono: typeof CheckCircle2; accion: () => void; primario?: boolean }> = []
  if (r.estado === 'PRESUPUESTO') botones.push({ texto: 'Aprobar', icono: CheckCircle2, accion: () => ir('APROBADO'), primario: true })
  if (r.estado === 'APROBADO') {
    botones.push({ texto: 'Finalizar', icono: CheckCircle2, accion: () => ir('FINALIZADO'), primario: true })
    botones.push({ texto: 'Volver a presupuesto', icono: Undo2, accion: () => ir('PRESUPUESTO') })
  }
  if (r.estado === 'FINALIZADO') botones.push({ texto: 'Reabrir', icono: Undo2, accion: () => ir('APROBADO') })
  if (r.estado === 'CANCELADO') botones.push({ texto: 'Reactivar', icono: RotateCcw, accion: () => ir('PRESUPUESTO') })
  if (r.estado !== 'CANCELADO' && r.estado !== 'FINALIZADO') {
    botones.push({ texto: 'Cancelar', icono: Ban, accion: () => (r.cobrado > 0 ? setCancelar(true) : window.confirm('¿Cancelar la reserva?') && ir('CANCELADO')) })
  }

  return (
    <div className="ax-card flex flex-wrap items-center gap-4 p-4">
      <SiglaBadge sigla={r.sigla} conTexto className="text-sm" />
      <div className="text-sm text-[var(--sec)]">
        {ESTADO_TEXTO[r.estado]} · {COBRO_TEXTO[r.estadoCobro].toLowerCase()}
        {ficha.propia.cancelacionSena && ` · seña ${ficha.propia.cancelacionSena === 'DEVUELTA' ? 'devuelta' : 'retenida'}`}
      </div>
      {ficha.verImportes && (
        <div className="ax-num flex gap-4 text-sm">
          <span>
            Total <b>{pesos(r.total)}</b>
          </span>
          <span className="text-[var(--verde)]">
            Cobrado <b>{pesos(r.cobrado)}</b>
          </span>
          <span className={r.saldo > 0 ? 'text-[var(--rojo-t)]' : 'text-[var(--ter)]'}>
            Saldo <b>{pesos(r.saldo)}</b>
          </span>
        </div>
      )}
      {puedeEditar && (
        <div className="ml-auto flex flex-wrap gap-2">
          {botones.map((b) => (
            <Button key={b.texto} size="sm" variant={b.primario ? 'default' : 'outline'} className="gap-1.5" disabled={cambiar.isPending} onClick={b.accion}>
              <b.icono className="h-3.5 w-3.5" />
              {b.texto}
            </Button>
          ))}
        </div>
      )}
      <Dialog open={cancelar} onOpenChange={setCancelar}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar la reserva</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--sec)]">
            Tiene {ficha.verImportes ? pesos(r.cobrado) : 'plata'} cobrado. ¿Qué pasa con la seña?
          </p>
          <p className="text-xs text-[var(--ter)]">Si se devuelve, registrá la devolución en Pagos con su medio y comprobante.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => cambiar.mutate({ estado: 'CANCELADO', cancelacionSena: 'RETENIDA' })}>
              Se retiene
            </Button>
            <Button onClick={() => cambiar.mutate({ estado: 'CANCELADO', cancelacionSena: 'DEVUELTA' })}>Se devuelve</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ------------------------------------------------------------ general */

function General({ ficha, puedeEditar, onCambio }: { ficha: Ficha; puedeEditar: boolean; onCambio: () => void }) {
  const r = ficha.reserva
  const { origenes, salones } = useCatalogos()
  const inicial = useMemo(
    () => ({
      nombre: r.nombre,
      contactoNombre: r.contactoNombre ?? '',
      contactoTelefono: r.contactoTelefono ?? '',
      contactoEmail: ficha.propia.contactoEmail ?? '',
      titularId: r.titularId ?? '',
      fecha: r.fecha,
      hora: r.hora ?? '',
      sectorId: r.sectorId ?? '',
      mesaIds: ficha.propia.mesaIds,
      mesaInamovible: r.mesaInamovible,
      origen: r.origen ?? '',
      observaciones: r.observaciones ?? '',
      notaServicio: r.notaServicio ?? '',
    }),
    [r, ficha.propia]
  )
  const [f, setF] = useState(inicial)
  useEffect(() => setF(inicial), [inicial])

  const guardar = useMutation({
    mutationFn: () =>
      enviar(`/api/eventos/reservas/${r.id}`, 'PATCH', {
        ...f,
        titularId: f.titularId || null,
        hora: f.hora || null,
        sectorId: f.sectorId || null,
        origen: f.origen || null,
      }),
    onSuccess: () => {
      toast.success('Guardado')
      onCambio()
    },
    onError: avisarError,
  })

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }))
  // Las mesas que se ofrecen son las del salón elegido; si no hay salón, todas.
  const salonesMesas = f.sectorId ? salones.filter((s) => s.id === f.sectorId) : salones
  const alternarMesa = (mid: string) =>
    setF((x) => ({ ...x, mesaIds: x.mesaIds.includes(mid) ? x.mesaIds.filter((m) => m !== mid) : [...x.mesaIds, mid] }))
  const cambiado = JSON.stringify(f) !== JSON.stringify(inicial)

  return (
    <form
      className="ax-card grid max-w-4xl gap-3 p-5 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault()
        guardar.mutate()
      }}
    >
      <fieldset disabled={!puedeEditar} className="contents">
        <Campo etiqueta="Nombre de la reserva" className="sm:col-span-2">
          <Input value={f.nombre} onChange={set('nombre')} />
        </Campo>
        <Campo etiqueta="Origen">
          <select value={f.origen} onChange={set('origen')} className={claseSelect}>
            <option value="">—</option>
            {origenes.map((o) => (
              <option key={o.clave} value={o.clave} disabled={!o.activo && o.clave !== f.origen}>
                {o.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Evento">
          {r.eventoId ? (
            <Link href={`/eventos/evento/${r.eventoId}` as Route} className="flex h-10 items-center truncate text-sm text-[var(--azul-2)] hover:underline">
              {r.eventoNombre}
            </Link>
          ) : (
            <p className="flex h-10 items-center text-sm text-[var(--ter)]">A la carta / suelta</p>
          )}
        </Campo>
        <Campo etiqueta="Contacto">
          <Input value={f.contactoNombre} onChange={set('contactoNombre')} />
        </Campo>
        <Campo etiqueta="Teléfono">
          <Input value={f.contactoTelefono} onChange={set('contactoTelefono')} inputMode="tel" />
        </Campo>
        <Campo etiqueta="Email" className="sm:col-span-2">
          <Input value={f.contactoEmail} onChange={set('contactoEmail')} type="email" />
        </Campo>
        <Campo etiqueta="Cliente (factura a nombre de)" className="sm:col-span-2">
          <SelectorCliente value={f.titularId} onChange={(id) => setF((x) => ({ ...x, titularId: id }))} />
        </Campo>
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
        <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={f.mesaInamovible} onChange={(e) => setF((x) => ({ ...x, mesaInamovible: e.target.checked }))} />
          <Lock className="h-3.5 w-3.5 text-amber-600" />
          Mesa inamovible (no se mueve al reacomodar el salón)
        </label>
        <div className="sm:col-span-4">
          <span className="mb-1 block text-xs font-medium text-slate-500">Mesas</span>
          {salonesMesas.every((s) => s.mesas.length === 0) ? (
            <p className="text-sm text-[var(--ter)]">No hay mesas cargadas en el POS para este salón.</p>
          ) : (
            <div className="space-y-2">
              {salonesMesas.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-1.5">
                  {!f.sectorId && <span className="mr-1 text-xs text-[var(--ter)]">{s.nombre}</span>}
                  {s.mesas.map((m) => {
                    const on = f.mesaIds.includes(m.id)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => alternarMesa(m.id)}
                        title={`${m.capacidad} lugares`}
                        className={cn(
                          'min-w-[2.5rem] rounded-lg border px-2 py-1 text-xs',
                          on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:bg-slate-50'
                        )}
                      >
                        {m.nombre}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
        <Campo etiqueta="Observaciones generales" className="sm:col-span-2">
          <textarea value={f.observaciones} onChange={set('observaciones')} className={claseTextarea} />
        </Campo>
        <Campo etiqueta="Nota para la hoja de servicio" className="sm:col-span-2" ayuda="Lo que tiene que saber el salón y la cocina: alergias, torta, sorpresa…">
          <textarea value={f.notaServicio} onChange={set('notaServicio')} className={claseTextarea} />
        </Campo>
        {puedeEditar && (
          <div className="flex justify-end gap-2 sm:col-span-4">
            {cambiado && (
              <Button type="button" variant="ghost" onClick={() => setF(inicial)}>
                Descartar
              </Button>
            )}
            <Button type="submit" disabled={!cambiado || guardar.isPending || !f.nombre.trim()}>
              {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  )
}

/* ------------------------------------------------------------ personas */

function Personas({ ficha, puedeEditar, onCambio }: { ficha: Ficha; puedeEditar: boolean; onCambio: () => void }) {
  const r = ficha.reserva
  const p = ficha.propia
  const ev = ficha.evento
  const s = (n: number | null | undefined) => (n == null ? '' : String(n))
  const inicial = useMemo(
    () => ({
      adultos: String(r.adultos),
      menores: String(r.menores),
      bebes: String(r.bebes),
      liberados: String(r.liberados),
      precioAdulto: s(p.precioAdultoPropio),
      precioMenor: s(p.precioMenorPropio),
      precioLiberado: s(p.precioLiberado),
      ivaModo: (p.ivaModoPropio ?? '') as IvaModo | '',
      ivaAlicuota: s(p.ivaAlicuotaPropia),
      descuento: p.descuento ? String(p.descuento) : '',
      descuentoNota: p.descuentoNota ?? '',
      regimenes: r.regimenes.map((g) => ({ tipo: g.tipo, cantidad: String(g.cantidad), nota: g.nota ?? '' })),
    }),
    [r, p]
  )
  const [f, setF] = useState(inicial)
  useEffect(() => setF(inicial), [inicial])
  const num = (v: string) => parsearMonto(v)

  // Lo heredado: del evento si hay, si no cero / precio final.
  const base = {
    precioAdulto: ev?.precioAdulto ?? 0,
    precioMenor: ev?.precioMenor ?? 0,
    ivaModo: (ev?.ivaModo ?? 'FINAL') as IvaModo,
    ivaAlicuota: ev?.ivaAlicuota ?? 21,
  }
  const vista = calcularTotal({
    adultos: num(f.adultos) ?? 0,
    menores: num(f.menores) ?? 0,
    liberados: num(f.liberados) ?? 0,
    precioAdulto: num(f.precioAdulto) ?? base.precioAdulto,
    precioMenor: num(f.precioMenor) ?? base.precioMenor,
    precioLiberado: num(f.precioLiberado) ?? 0,
    descuento: num(f.descuento) ?? 0,
    ivaModo: f.ivaModo || base.ivaModo,
    ivaAlicuota: num(f.ivaAlicuota) ?? base.ivaAlicuota,
    // Los adicionales por persona acompañan a la cantidad que se está tipeando.
    adicionales: sumaAdicionales(
      p.adicionalesLineas.map((a, i) => ({ ...a, descripcion: '', nota: null, orden: i })),
      { adultos: num(f.adultos) ?? 0, menores: num(f.menores) ?? 0 }
    ).titular,
  })

  const guardar = useMutation({
    mutationFn: () =>
      enviarConCupo(`/api/eventos/reservas/${r.id}`, 'PATCH', {
        adultos: num(f.adultos) ?? 0,
        menores: num(f.menores) ?? 0,
        bebes: num(f.bebes) ?? 0,
        liberados: num(f.liberados) ?? 0,
        regimenes: f.regimenes.map((g) => ({ tipo: g.tipo, cantidad: num(g.cantidad) ?? 0, nota: g.nota })),
        // Sin permiso de importes, los precios no viajan (vinieron en cero).
        ...(ficha.verImportes
          ? {
              precioAdulto: num(f.precioAdulto),
              precioMenor: num(f.precioMenor),
              precioLiberado: num(f.precioLiberado),
              ivaModo: f.ivaModo || null,
              ivaAlicuota: num(f.ivaAlicuota),
              descuento: num(f.descuento) ?? 0,
              descuentoNota: f.descuentoNota,
            }
          : {}),
      }),
    onSuccess: () => {
      toast.success('Guardado')
      onCambio()
    },
    onError: avisarError,
  })

  const set = (k: Exclude<keyof typeof f, 'regimenes'>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }))
  const setReg = (i: number, k: 'tipo' | 'cantidad' | 'nota', v: string) =>
    setF((x) => ({ ...x, regimenes: x.regimenes.map((g, j) => (j === i ? { ...g, [k]: v } : g)) }))
  const cambiado = JSON.stringify(f) !== JSON.stringify(inicial)
  const totalPersonas = (num(f.adultos) ?? 0) + (num(f.menores) ?? 0) + (num(f.bebes) ?? 0) + (num(f.liberados) ?? 0)

  return (
    <form
      className="ax-card max-w-4xl space-y-5 p-5"
      onSubmit={(e) => {
        e.preventDefault()
        guardar.mutate()
      }}
    >
      <fieldset disabled={!puedeEditar} className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Campo etiqueta="Adultos">
            <Input value={f.adultos} onChange={set('adultos')} inputMode="numeric" />
          </Campo>
          <Campo etiqueta="Menores">
            <Input value={f.menores} onChange={set('menores')} inputMode="numeric" />
          </Campo>
          <Campo etiqueta="Bebés" ayuda="Siempre gratis">
            <Input value={f.bebes} onChange={set('bebes')} inputMode="numeric" />
          </Campo>
          <Campo etiqueta="Liberados" ayuda="Gratis o precio a mano">
            <Input value={f.liberados} onChange={set('liberados')} inputMode="numeric" />
          </Campo>
          <div className="flex flex-col justify-center rounded-xl bg-slate-900/[0.04] px-3 py-2">
            <span className="text-xs text-[var(--ter)]">Total</span>
            <span className="ax-num text-xl font-semibold">{totalPersonas}</span>
          </div>
        </div>

        {ficha.verImportes && (
          <div className="grid gap-3 rounded-xl border border-slate-900/[0.08] p-3 sm:grid-cols-4">
            <p className="text-sm font-medium sm:col-span-4">
              Precios de esta reserva <span className="font-normal text-[var(--ter)]">— vacío = {ev ? 'el del evento' : 'sin precio'}</span>
            </p>
            <Campo etiqueta="Adulto">
              <Input value={f.precioAdulto} onChange={set('precioAdulto')} inputMode="decimal" placeholder={base.precioAdulto ? String(base.precioAdulto) : '0'} />
            </Campo>
            <Campo etiqueta="Menor">
              <Input value={f.precioMenor} onChange={set('precioMenor')} inputMode="decimal" placeholder={base.precioMenor ? String(base.precioMenor) : '0'} />
            </Campo>
            <Campo etiqueta="Liberado" ayuda="Preferencial; vacío = gratis">
              <Input value={f.precioLiberado} onChange={set('precioLiberado')} inputMode="decimal" placeholder="0" />
            </Campo>
            <Campo etiqueta="IVA">
              <select value={f.ivaModo} onChange={set('ivaModo')} className={claseSelect}>
                <option value="">{ev ? `El del evento (${IVA_MODOS.find((m) => m.valor === base.ivaModo)?.texto})` : 'Precio final'}</option>
                {IVA_MODOS.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.texto}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Alícuota %">
              <Input value={f.ivaAlicuota} onChange={set('ivaAlicuota')} inputMode="decimal" placeholder={String(base.ivaAlicuota)} />
            </Campo>
            <Campo etiqueta="Descuento $">
              <Input value={f.descuento} onChange={set('descuento')} inputMode="decimal" placeholder="0" />
            </Campo>
            <Campo etiqueta="Motivo del descuento" className="sm:col-span-2">
              <Input value={f.descuentoNota} onChange={set('descuentoNota')} />
            </Campo>
            <div className="ax-num flex flex-wrap gap-x-5 gap-y-1 text-sm sm:col-span-4">
              <span>Neto {pesos(vista.neto)}</span>
              {p.adicionalesLineas.length > 0 && <span className="text-[var(--sec)]">incluye adicionales (pestaña Menú)</span>}
              {vista.iva > 0 && <span className="text-[var(--sec)]">IVA {pesos(vista.iva)}</span>}
              <span className="font-semibold">Total {pesos(vista.total)}</span>
              {cambiado && <span className="text-xs text-[var(--ter)]">(antes {pesos(r.total)})</span>}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Regímenes especiales</p>
            {puedeEditar && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => setF((x) => ({ ...x, regimenes: [...x.regimenes, { tipo: 'CELIACO', cantidad: '1', nota: '' }] }))}
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar
              </Button>
            )}
          </div>
          {f.regimenes.length === 0 && <p className="text-sm text-[var(--ter)]">Ninguno.</p>}
          {f.regimenes.map((g, i) => (
            <div key={i} className="grid grid-cols-[1fr_4.5rem_auto] gap-2 sm:grid-cols-[12rem_5rem_1fr_auto]">
              <SelectSimple value={g.tipo} onChange={(v) => setReg(i, 'tipo', v as Regimen)} opciones={REGIMENES} />
              <Input value={g.cantidad} onChange={(e) => setReg(i, 'cantidad', e.target.value)} inputMode="numeric" />
              <Input
                value={g.nota}
                onChange={(e) => setReg(i, 'nota', e.target.value)}
                placeholder={g.tipo === 'ALERGIA' ? '¿A qué? (maní, mariscos…)' : 'Indicación para la cocina'}
                className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="row-start-1 sm:row-start-auto"
                onClick={() => setF((x) => ({ ...x, regimenes: x.regimenes.filter((_, j) => j !== i) }))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <p className="text-xs text-[var(--ter)]">Qué come cada régimen (menú alternativo) se elige en la pestaña Menú.</p>
        </div>

        {puedeEditar && (
          <div className="flex justify-end gap-2">
            {cambiado && (
              <Button type="button" variant="ghost" onClick={() => setF(inicial)}>
                Descartar
              </Button>
            )}
            <Button type="submit" disabled={!cambiado || guardar.isPending || totalPersonas === 0}>
              {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  )
}

/* ------------------------------------------------------------ pagos */

const ESTADO_CUOTA: Record<CuotaCalculada['estado'], { texto: string; clase: string }> = {
  PAGADA: { texto: 'Pagada', clase: 'ax-chip-verde' },
  PARCIAL: { texto: 'Parcial', clase: 'ax-chip-ambar' },
  PENDIENTE: { texto: 'Pendiente', clase: 'ax-chip-gris' },
  POR_VENCER: { texto: 'Por vencer', clase: 'ax-chip-ambar' },
  VENCIDA: { texto: 'Vencida', clase: 'ax-chip-rojo' },
}

function Pagos({ ficha, puedeEditar, onCambio }: { ficha: Ficha; puedeEditar: boolean; onCambio: () => void }) {
  const r = ficha.reserva
  const [editandoPlan, setEditandoPlan] = useState(false)
  const [plan, setPlan] = useState(() => ficha.plan.map((c) => ({ concepto: c.concepto, tipo: c.monto != null ? 'monto' : c.porcentaje != null ? 'pct' : 'resto', valor: String(c.monto ?? c.porcentaje ?? ''), vencimiento: c.vencimiento ?? '' })))
  const [pago, setPago] = useState({ tipo: 'PAGO', fecha: hoyAR(), monto: '', medio: 'TRANSFERENCIA' as MedioPago, comprobante: '', nota: '' })

  useEffect(() => {
    setPlan(ficha.plan.map((c) => ({ concepto: c.concepto, tipo: c.monto != null ? 'monto' : c.porcentaje != null ? 'pct' : 'resto', valor: String(c.monto ?? c.porcentaje ?? ''), vencimiento: c.vencimiento ?? '' })))
  }, [ficha.plan])

  const guardarPlan = useMutation({
    mutationFn: (cuerpo: unknown) => enviar(`/api/eventos/reservas/${r.id}/cuotas`, 'PUT', cuerpo),
    onSuccess: () => {
      toast.success('Plan de pagos guardado')
      setEditandoPlan(false)
      onCambio()
    },
    onError: avisarError,
  })
  const registrar = useMutation({
    mutationFn: () =>
      enviar('/api/eventos/pagos', 'POST', {
        reservaId: r.id,
        tipo: pago.tipo,
        fecha: pago.fecha,
        monto: parsearMonto(pago.monto),
        medio: pago.medio,
        comprobante: pago.comprobante,
        nota: pago.nota,
      }),
    onSuccess: () => {
      toast.success(pago.tipo === 'PAGO' ? 'Pago registrado' : 'Devolución registrada')
      setPago((x) => ({ ...x, monto: '', comprobante: '', nota: '' }))
      onCambio()
    },
    onError: avisarError,
  })
  const anular = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      enviar(`/api/eventos/pagos?id=${id}&motivo=${encodeURIComponent(motivo)}`, 'DELETE'),
    onSuccess: () => {
      toast.success('Pago anulado')
      onCambio()
    },
    onError: avisarError,
  })

  return (
    <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
      <section className="ax-card p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="ax-card-titulo">Plan de pagos</h3>
          {puedeEditar && !editandoPlan && (
            <div className="flex gap-1">
              {r.eventoId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => window.confirm('¿Rehacer el plan con la regla actual del evento?') && guardarPlan.mutate({ regenerar: true })}
                >
                  Rehacer desde el evento
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setEditandoPlan(true)}>
                Editar
              </Button>
            </div>
          )}
        </div>
        {!editandoPlan ? (
          ficha.plan.length === 0 ? (
            <p className="text-sm text-[var(--ter)]">Sin plan: se cobra lo que se pueda, sin vencimientos.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {ficha.plan.map((c, i) => (
                  <tr key={i} className="border-b border-slate-900/[0.05] last:border-0">
                    <td className="py-2">
                      <div className="font-medium">{c.concepto}</div>
                      <div className="text-xs text-[var(--ter)]">
                        {c.porcentaje != null ? `${c.porcentaje} % del total` : c.monto != null ? 'monto fijo' : 'el resto'}
                        {c.vencimiento && ` · vence ${fechaCorta(c.vencimiento, true)}`}
                      </div>
                    </td>
                    <td className="ax-num py-2 text-right">
                      {pesos(c.importe)}
                      {c.pendiente > 0 && c.imputado > 0 && <div className="text-xs text-[var(--ter)]">faltan {pesos(c.pendiente)}</div>}
                    </td>
                    <td className="py-2 pl-3 text-right">
                      <span className={cn('ax-chip', ESTADO_CUOTA[c.estado].clase)}>{ESTADO_CUOTA[c.estado].texto}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <div className="space-y-2">
            {plan.map((c, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-lg bg-slate-900/[0.025] p-2 sm:grid-cols-[1fr_6.5rem_6rem_8.5rem_auto]">
                <Input value={c.concepto} onChange={(e) => setPlan((xs) => xs.map((x, j) => (j === i ? { ...x, concepto: e.target.value } : x)))} placeholder="Seña" />
                <select value={c.tipo} onChange={(e) => setPlan((xs) => xs.map((x, j) => (j === i ? { ...x, tipo: e.target.value } : x)))} className={claseSelect}>
                  <option value="pct">% total</option>
                  <option value="monto">Monto $</option>
                  <option value="resto">El resto</option>
                </select>
                <Input value={c.valor} disabled={c.tipo === 'resto'} onChange={(e) => setPlan((xs) => xs.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} inputMode="decimal" />
                <Input type="date" value={c.vencimiento} onChange={(e) => setPlan((xs) => xs.map((x, j) => (j === i ? { ...x, vencimiento: e.target.value } : x)))} />
                <Button type="button" variant="ghost" size="icon" onClick={() => setPlan((xs) => xs.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setPlan((xs) => [...xs, { concepto: xs.length ? 'Saldo' : 'Seña', tipo: xs.length ? 'resto' : 'pct', valor: xs.length ? '' : '30', vencimiento: '' }])}>
                <Plus className="h-3.5 w-3.5" />
                Cuota
              </Button>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditandoPlan(false)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={guardarPlan.isPending}
                  onClick={() =>
                    guardarPlan.mutate({
                      cuotas: plan.map((c) => ({
                        concepto: c.concepto,
                        monto: c.tipo === 'monto' ? c.valor : null,
                        porcentaje: c.tipo === 'pct' ? c.valor : null,
                        vencimiento: c.vencimiento || null,
                      })),
                    })
                  }
                >
                  Guardar plan
                </Button>
              </div>
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-[var(--ter)]">
          Lo cobrado se imputa en orden: primero la seña. Una cuota vencida sólo avisa; el lugar no se libera solo.
        </p>
      </section>

      <section className="ax-card p-5">
        <h3 className="ax-card-titulo mb-3">Pagos registrados</h3>
        {ficha.pagos.length === 0 && <p className="text-sm text-[var(--ter)]">Todavía no entró plata.</p>}
        <ul className="space-y-2">
          {ficha.pagos.map((pg) => (
            <li key={pg.id} className={cn('flex items-start justify-between gap-2 border-b border-slate-900/[0.05] pb-2 text-sm last:border-0', pg.anuladoAt && 'opacity-50')}>
              <div className="min-w-0">
                <div className={cn('ax-num font-medium', pg.anuladoAt && 'line-through', pg.tipo === 'DEVOLUCION' && 'text-[var(--rojo-t)]')}>
                  {pg.tipo === 'DEVOLUCION' ? '− ' : ''}
                  {pesos(pg.monto)} <span className="font-normal text-[var(--sec)]">· {MEDIO_TEXTO[pg.medio as MedioPago] ?? pg.medio}</span>
                </div>
                <div className="text-xs text-[var(--ter)]">
                  {fechaCorta(pg.fecha, true)} · {pg.usuarioNombre}
                  {pg.comprobante && ` · comp. ${pg.comprobante}`}
                  {pg.nota && ` · ${pg.nota}`}
                </div>
                {pg.anuladoAt && (
                  <div className="text-xs text-[var(--rojo-t)]">
                    Anulado por {pg.anuladoPor}: {pg.anuladoMotivo}
                  </div>
                )}
              </div>
              {ficha.puedeCobrar && !pg.anuladoAt && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-xs"
                  onClick={() => {
                    const motivo = window.prompt('¿Por qué se anula este pago?')
                    if (motivo?.trim()) anular.mutate({ id: pg.id, motivo })
                  }}
                >
                  Anular
                </Button>
              )}
            </li>
          ))}
        </ul>

        {ficha.puedeCobrar && (
          <form
            className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-900/[0.03] p-3"
            onSubmit={(e) => {
              e.preventDefault()
              registrar.mutate()
            }}
          >
            <p className="col-span-2 text-sm font-medium">Registrar</p>
            <SelectSimple
              value={pago.tipo}
              onChange={(v) => setPago((x) => ({ ...x, tipo: v }))}
              opciones={[
                { valor: 'PAGO', texto: 'Pago' },
                { valor: 'DEVOLUCION', texto: 'Devolución' },
              ]}
            />
            <Input type="date" value={pago.fecha} onChange={(e) => setPago((x) => ({ ...x, fecha: e.target.value }))} />
            <Input
              value={pago.monto}
              onChange={(e) => setPago((x) => ({ ...x, monto: e.target.value }))}
              inputMode="decimal"
              placeholder={r.saldo > 0 ? `Saldo ${pesos(r.saldo)}` : 'Monto'}
            />
            <SelectSimple value={pago.medio} onChange={(v) => setPago((x) => ({ ...x, medio: v as MedioPago }))} opciones={MEDIOS} />
            <Input value={pago.comprobante} onChange={(e) => setPago((x) => ({ ...x, comprobante: e.target.value }))} placeholder="Comprobante / nº de operación" />
            <Input value={pago.nota} onChange={(e) => setPago((x) => ({ ...x, nota: e.target.value }))} placeholder="Nota" />
            <div className="col-span-2 flex justify-end gap-2">
              {r.saldo > 0 && pago.tipo === 'PAGO' && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setPago((x) => ({ ...x, monto: String(r.saldo) }))}>
                  Todo el saldo
                </Button>
              )}
              <Button type="submit" size="sm" disabled={registrar.isPending || !pago.monto}>
                {registrar.isPending ? 'Guardando…' : 'Registrar'}
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}

'use client'

import { Suspense, use, useMemo, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, CalendarDays, FileText, Plus, Salad, Trash2, Users, Wallet } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Kpi, millones, pesos } from '@/components/dashboard/inicio'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BarraSiglas, Campo, avisarError, enviar, useCatalogos } from '@/components/eventos/comunes'
import { EventoForm, cuerpoDe, formDe, type FormEvento } from '@/components/eventos/evento-form'
import { LineaTiempo } from '@/components/eventos/linea-tiempo'
import { MenuEvento } from '@/components/eventos/menu-tab'
import { NuevaReservaDialog, ReservaRapida } from '@/components/eventos/nueva-reserva'
import { TablaReservas } from '@/components/eventos/tabla-reservas'
import { useUser } from '@/hooks/use-user'
import { SECCION } from '@/lib/permisos'
import { REGIMEN_TEXTO, fechaCorta, type Regimen } from '@/lib/eventos/constantes'
import type { AgendaFila, AuditoriaFila, EventoBase, ReservaFila } from '@/lib/eventos/db'
import type { KpisEvento } from '@/lib/eventos/resumen'

interface Ficha {
  evento: EventoBase
  reservas: ReservaFila[]
  kpis: KpisEvento
  auditoria: AuditoriaFila[]
  agenda: AgendaFila[]
  avisoCupoPct: number
  verImportes: boolean
}

export default function FichaEvento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  // useSearchParams (la fecha que viene del calendario) pide un Suspense.
  return id === 'nuevo' ? (
    <Suspense fallback={null}>
      <NuevoEvento />
    </Suspense>
  ) : (
    <Evento id={id} />
  )
}

/**
 * Alta de un evento. "Privado" crea además la única reserva (un casamiento,
 * un grupo de agencia): es un evento con una sola reserva, y así se carga
 * todo de una vez.
 */
function NuevoEvento() {
  const router = useRouter()
  const fecha = useSearchParams().get('fecha') ?? ''
  const { canSeeImportes } = useUser()
  const [privado, setPrivado] = useState(false)
  const [personas, setPersonas] = useState('')
  const inicial = useMemo(() => formDe(null, fecha), [fecha])

  const crear = useMutation({
    mutationFn: async (f: FormEvento) => {
      const { id } = await enviar('/api/eventos', 'POST', cuerpoDe(f, canSeeImportes(SECCION.EVENTOS_RESERVAS)))
      if (privado) {
        const r = await enviar('/api/eventos/reservas', 'POST', { eventoId: id, nombre: f.nombre, adultos: Number(personas) || 1 })
        return { id, reservaId: r.id as string }
      }
      return { id, reservaId: null }
    },
    onSuccess: ({ id, reservaId }) => {
      toast.success('Evento creado')
      router.replace((reservaId ? `/eventos/reserva/${reservaId}` : `/eventos/evento/${id}`) as Route)
    },
    onError: avisarError,
  })

  return (
    <DashboardLayout>
      <Header title="Nuevo evento" description="Las condiciones que comparten todas sus reservas." compacto />
      <div className="ax-card max-w-4xl p-5">
        <EventoForm
          inicial={inicial}
          verImportes={canSeeImportes(SECCION.EVENTOS_RESERVAS)}
          guardando={crear.isPending}
          onGuardar={(f) => crear.mutate(f)}
          textoBoton="Crear evento"
          extra={
            <div className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-900/[0.03] p-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={privado} onChange={(e) => setPrivado(e.target.checked)} />
                Evento privado (una sola reserva: casamiento, grupo de agencia…)
              </label>
              {privado && (
                <Campo etiqueta="Adultos" className="w-28">
                  <Input value={personas} onChange={(e) => setPersonas(e.target.value)} inputMode="numeric" />
                </Campo>
              )}
            </div>
          }
        />
      </div>
    </DashboardLayout>
  )
}

function Evento({ id }: { id: string }) {
  const router = useRouter()
  const qc = useQueryClient()
  const { canEdit } = useUser()
  const puedeEditar = canEdit(SECCION.EVENTOS_RESERVAS)
  const { tipoEvento, salones } = useCatalogos()
  const [tab, setTab] = useState('reservas')
  const [nueva, setNueva] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['evento', id],
    queryFn: async () => {
      const res = await fetch(`/api/eventos/${id}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo cargar el evento')
      return res.json() as Promise<Ficha>
    },
  })
  const refrescar = () => qc.invalidateQueries({ queryKey: ['evento', id] })

  const inicial = useMemo(() => formDe(data?.evento ?? null), [data?.evento])
  const guardar = useMutation({
    mutationFn: (f: FormEvento) => enviar(`/api/eventos/${id}`, 'PATCH', cuerpoDe(f, data?.verImportes ?? false)),
    onSuccess: () => {
      toast.success('Evento actualizado')
      refrescar()
    },
    onError: avisarError,
  })
  const borrar = useMutation({
    mutationFn: () => enviar(`/api/eventos/${id}`, 'DELETE'),
    onSuccess: () => {
      toast.success('Evento borrado')
      router.replace('/eventos' as Route)
    },
    onError: avisarError,
  })

  if (error) {
    return (
      <DashboardLayout>
        <p className="py-10 text-center text-sm text-[var(--sec)]">{(error as Error).message}</p>
      </DashboardLayout>
    )
  }

  const ev = data?.evento
  const k = data?.kpis
  const verImportes = data?.verImportes ?? false
  const tipo = ev ? tipoEvento(ev.tipo) : undefined
  const casiLleno = !!(k?.ocupacionPct != null && data && k.ocupacionPct >= data.avisoCupoPct)
  const salonesEv = ev ? salones.filter((s) => ev.salonIds.includes(s.id)).map((s) => s.nombre) : []

  return (
    <DashboardLayout>
      <Header
        compacto
        title={ev?.nombre ?? 'Evento'}
        description={
          ev
            ? [
                tipo?.nombre,
                `${fechaCorta(ev.fecha, true)}${ev.horaInicio ? ` · ${ev.horaInicio}${ev.horaFin ? `–${ev.horaFin}` : ''}` : ''}`,
                salonesEv.join(', '),
              ]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" asChild>
              <Link href={'/eventos' as Route}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild className="gap-1.5">
              <Link href={`/eventos/evento/${id}/presupuesto` as Route}>
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Presupuesto</span>
              </Link>
            </Button>
            {puedeEditar && (
              <Button className="gap-1.5" onClick={() => setNueva(true)}>
                <Plus className="h-4 w-4" />
                Reserva completa
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          etiqueta="Reservas"
          valor={String(k?.reservas ?? 0)}
          nota={k ? `${k.canceladas} canceladas` : undefined}
          icono={CalendarDays}
          cargando={isLoading}
        />
        <Kpi
          etiqueta="Personas"
          valor={k ? `${k.personas}` : '0'}
          nota={
            k
              ? `${k.confirmadas} confirmadas · ${k.categorias.adultos} ad · ${k.categorias.menores} men · ${k.categorias.bebes} beb · ${k.categorias.liberados} lib`
              : undefined
          }
          icono={Users}
          cargando={isLoading}
        />
        <Kpi
          etiqueta="Cupo restante"
          valor={k?.restante != null ? String(k.restante) : 'Sin tope'}
          nota={k?.cupo ? `${k.ocupacionPct} % de ${k.cupo}${(k.restante ?? 0) < 0 ? ' · pasado de cupo' : casiLleno ? ' · casi lleno' : ''}` : 'el evento no tiene cupo'}
          tono={k?.restante != null && k.restante < 0 ? 'rojo' : casiLleno ? 'ambar' : 'verde'}
          icono={AlertTriangle}
          cargando={isLoading}
        />
        {verImportes ? (
          <Kpi
            etiqueta="Cobrado"
            valor={millones(k?.cobrado ?? 0)}
            nota={k ? `de ${millones(k.total)} · faltan ${millones(k.saldo)}${k.vencidas ? ` · ${k.vencidas} con seña vencida (${pesos(k.montoVencido)})` : ''}` : undefined}
            tono={k?.vencidas ? 'rojo' : 'verde'}
            icono={Wallet}
            cargando={isLoading}
          />
        ) : (
          <Kpi etiqueta="Señas vencidas" valor={String(k?.vencidas ?? 0)} nota="reservas con una cuota vencida" tono={k?.vencidas ? 'rojo' : 'verde'} icono={Wallet} cargando={isLoading} />
        )}
      </div>

      {k && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <BarraSiglas siglas={k.siglas} className="w-full sm:w-64" />
          {Object.entries(k.regimenes).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <Salad className="h-4 w-4 text-[var(--ambar-2)]" />
              {Object.entries(k.regimenes).map(([t, n]) => (
                <span key={t} className="ax-chip ax-chip-ambar">
                  {n} {REGIMEN_TEXTO[t as Regimen].toLowerCase()}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="reservas">Reservas{data ? ` (${data.reservas.length})` : ''}</TabsTrigger>
          <TabsTrigger value="condiciones">Condiciones</TabsTrigger>
          <TabsTrigger value="menu">Menú · cocina</TabsTrigger>
          <TabsTrigger value="timeline">Línea de tiempo</TabsTrigger>
        </TabsList>

        <TabsContent value="reservas" className="mt-4 space-y-4">
          {puedeEditar && <ReservaRapida eventoId={id} />}
          <TablaReservas reservas={data?.reservas ?? []} verImportes={verImportes} cargando={isLoading} />
        </TabsContent>

        <TabsContent value="condiciones" className="mt-4">
          <div className="ax-card max-w-4xl p-5">
            {ev && (
              <EventoForm inicial={inicial} verImportes={verImportes} guardando={guardar.isPending} onGuardar={(f) => guardar.mutate(f)} />
            )}
            <p className="mt-4 text-xs text-[var(--ter)]">
              Si cambiás la fecha o la hora, se mueven también las reservas que estaban en la fecha y hora del evento. Los
              precios nuevos valen para todas las reservas que no tengan precio propio. El plan de pagos de cada reserva
              se arma al crearla; para rehacerlo con una regla nueva, usá “Rehacer desde el evento” en la reserva.
            </p>
            {puedeEditar && data && data.reservas.length === 0 && (
              <Button
                variant="ghost"
                className="mt-4 gap-1.5 text-[var(--rojo-t)]"
                onClick={() => window.confirm('¿Borrar el evento? No tiene reservas.') && borrar.mutate()}
              >
                <Trash2 className="h-4 w-4" />
                Borrar evento
              </Button>
            )}
          </div>
        </TabsContent>

        <TabsContent value="menu" className="mt-4">
          <MenuEvento eventoId={id} puedeEditar={puedeEditar} onCambio={refrescar} />
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <div className="ax-card max-w-4xl p-5">
            <LineaTiempo
              auditoria={data?.auditoria ?? []}
              agenda={data?.agenda ?? []}
              eventoId={id}
              puedeEditar={puedeEditar}
              onCambio={refrescar}
            />
          </div>
        </TabsContent>
      </Tabs>

      <NuevaReservaDialog abierto={nueva} onCerrar={() => setNueva(false)} eventoId={id} />
    </DashboardLayout>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ChevronLeft, ChevronRight, CreditCard, FileEdit, Landmark, Wallet } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Kpi } from '@/components/dashboard/inicio'
import { DetalleDia, PaymentCalendar, claveDia, type CalendarEvent } from '@/components/payments/payment-calendar'
import { ChequesPorDebitar, type ChequePendiente } from '@/components/payments/cheques-por-debitar'
import { useUser } from '@/hooks/use-user'
import { hoyAR } from '@/lib/fechas'
import { formatCurrency } from '@/lib/utils'

const fechaCorta = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}`
}

/** Rango que cubre la grilla del mes (con la semana anterior y la siguiente). */
function rangoDelMes(mes: Date) {
  const desde = new Date(mes.getFullYear(), mes.getMonth(), 1 - 7)
  const hasta = new Date(mes.getFullYear(), mes.getMonth() + 1, 7)
  return { desde: claveDia(desde), hasta: claveDia(hasta) }
}

export default function CalendarioPagos() {
  const { clienteId } = useUser()
  const hoy = hoyAR()
  const [mes, setMes] = useState(() => {
    const [a, m] = hoy.split('-').map(Number) as [number, number]
    return new Date(a, m - 1, 1)
  })
  const [dia, setDia] = useState<string | null>(null)
  const { desde, hasta } = rangoDelMes(mes)

  const { data, isLoading } = useQuery<{ eventos: CalendarEvent[]; porDebitar: ChequePendiente[] }>({
    queryKey: ['pagos-calendario', desde, hasta],
    queryFn: async () => {
      const res = await fetch(`/api/pagos/calendario?desde=${desde}&hasta=${hasta}`)
      if (!res.ok) throw new Error('Error al cargar')
      return res.json()
    },
    enabled: !!clienteId,
  })

  const eventos = data?.eventos || []
  const porDebitar = data?.porDebitar || []
  const totalPorDebitar = porDebitar.reduce((s2, c) => s2 + c.monto, 0)
  const prefijo = claveDia(mes).slice(0, 7)
  const delMes = eventos.filter((e) => e.fecha.startsWith(prefijo))
  const items = delMes.flatMap((e) => e.items)
  const total = delMes.reduce((s, e) => s + e.total, 0)
  const emitidas = items.filter((i) => i.estado === 'EMITIDA')
  const borradores = items.filter((i) => i.estado === 'BORRADOR')
  // Un cheque entregado sigue siendo plata que todavía no salió: cuenta como
  // pagado sólo cuando el pago ya se hizo efectivo (transferencia, efectivo).
  const pagados = items.filter((i) => i.estado === 'PAGADO' && i.tipo !== 'CHEQUE' && i.tipo !== 'ECHEQ')
  const suma = (xs: typeof items) => xs.reduce((s, i) => s + i.monto, 0)

  // Día elegido por defecto: hoy si es de este mes, si no el primer día con pagos.
  useEffect(() => {
    if (isLoading) return
    if (hoy.startsWith(prefijo)) setDia(hoy)
    else setDia(delMes[0]?.fecha ?? `${prefijo}-01`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefijo, isLoading])

  const mover = (n: number) => setMes((m) => new Date(m.getFullYear(), m.getMonth() + n, 1))
  const nombreMes = mes.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

  if (!clienteId) {
    return (
      <DashboardLayout>
        <p className="py-8 text-center text-sm text-slate-500">No tenés acceso.</p>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <Header
        title="Calendario de pagos"
        description="Qué salió y qué sale de la cuenta cada día: transferencias, cheques y eCheq."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl border border-slate-900/[0.12] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
              <button type="button" onClick={() => mover(-1)} className="grid h-10 w-10 place-items-center rounded-l-xl text-slate-500 hover:bg-slate-50 hover:text-slate-900" aria-label="Mes anterior">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[9.5rem] px-2 text-center text-sm font-medium capitalize">{nombreMes}</span>
              <button type="button" onClick={() => mover(1)} className="grid h-10 w-10 place-items-center rounded-r-xl text-slate-500 hover:bg-slate-50 hover:text-slate-900" aria-label="Mes siguiente">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {!hoy.startsWith(prefijo) && (
              <button
                type="button"
                onClick={() => {
                  const [a, m] = hoy.split('-').map(Number) as [number, number]
                  setMes(new Date(a, m - 1, 1))
                }}
                className="inline-flex h-10 items-center rounded-xl px-3 text-sm text-[var(--azul-2)] hover:bg-slate-900/[0.05]"
              >
                Volver a hoy
              </button>
            )}
          </div>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi etiqueta="Movimientos del mes" valor={formatCurrency(total)} nota={`${items.length} pagos`} icono={Wallet} cargando={isLoading} />
        <Kpi etiqueta="Ya pagado" valor={formatCurrency(suma(pagados))} nota={`${pagados.length} órdenes hechas`} tono="verde" icono={CheckCircle2} cargando={isLoading} />
        <Kpi etiqueta="Emitidas" valor={formatCurrency(suma(emitidas))} nota={`${emitidas.length} listas para pagar`} icono={CreditCard} cargando={isLoading} />
        <Kpi etiqueta="Borradores" valor={formatCurrency(suma(borradores))} nota={`${borradores.length} sin emitir`} tono="ambar" icono={FileEdit} cargando={isLoading} />
        <Kpi
          etiqueta="Por debitar"
          valor={formatCurrency(totalPorDebitar)}
          nota={
            porDebitar.length === 0
              ? 'sin cheques pendientes'
              : `${porDebitar.length} cheque${porDebitar.length === 1 ? '' : 's'}, el próximo el ${fechaCorta(porDebitar[0]!.fecha)}`
          }
          tono="ambar"
          icono={Landmark}
          cargando={isLoading}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        {isLoading ? <div className="h-[34rem] animate-pulse rounded-2xl bg-slate-900/[0.04]" /> : <PaymentCalendar month={mes} eventos={eventos} seleccionado={dia} onSeleccionar={setDia} hoy={hoy} />}
        <div className="space-y-5 xl:sticky xl:top-20 xl:self-start">
          <DetalleDia dia={dia} evento={eventos.find((e) => e.fecha === dia)} hoy={hoy} />
          {/* Los cheques entregados vencen cuando vencen, no en el mes que se
              esté mirando: van en su propio panel y no dependen del mes. */}
          <ChequesPorDebitar cheques={porDebitar} cargando={isLoading} />
        </div>
      </div>
    </DashboardLayout>
  )
}

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarClock, ChevronRight, CircleDollarSign, Clock, Salad, Users } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { pesos } from '@/components/dashboard/inicio'
import { TIPOS_ALERTA, type Alerta, type TipoAlerta } from '@/lib/eventos/constantes'
import { cn } from '@/lib/utils'

const ICONO: Record<TipoAlerta, typeof AlertTriangle> = {
  cuota_vencida: CircleDollarSign,
  cuota_proxima: Clock,
  presupuesto_sin_respuesta: Clock,
  agenda: CalendarClock,
  regimen_sin_nota: Salad,
  evento_sin_finalizar: AlertTriangle,
  finalizada_con_saldo: CircleDollarSign,
  cupo: Users,
}

const TONO = {
  alta: 'border-l-[var(--rojo)] [&_.ico]:text-[var(--rojo-t)]',
  media: 'border-l-[var(--ambar)] [&_.ico]:text-[var(--ambar-2)]',
  baja: 'border-l-slate-300 [&_.ico]:text-slate-400',
}

/**
 * Lo que pide atención en eventos y reservas, de lo más urgente a lo menos.
 * Todo sale de los datos: nadie marca una alerta, se resuelve en la ficha y
 * desaparece sola.
 */
export default function AlertasEventos() {
  const [tipo, setTipo] = useState<TipoAlerta | ''>('')
  const { data, isLoading } = useQuery({
    queryKey: ['eventos-alertas'],
    queryFn: async () => {
      const res = await fetch('/api/eventos/alertas')
      if (!res.ok) throw new Error('No se pudieron cargar las alertas')
      return res.json() as Promise<{ alertas: Alerta[] }>
    },
  })
  const alertas = data?.alertas ?? []
  const conteo = useMemo(() => {
    const c = new Map<TipoAlerta, number>()
    for (const a of alertas) c.set(a.tipo, (c.get(a.tipo) ?? 0) + 1)
    return c
  }, [alertas])
  const visibles = tipo ? alertas.filter((a) => a.tipo === tipo) : alertas

  return (
    <DashboardLayout>
      <Header title="Alertas de eventos" description="Señas vencidas, presupuestos sin respuesta, pendientes de agenda y lo que quedó sin cerrar." />

      <div className="mb-4 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setTipo('')}
          className={cn('rounded-full border px-3 py-1 text-sm', !tipo ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white')}
        >
          Todas <span className="opacity-60">{alertas.length}</span>
        </button>
        {(Object.keys(TIPOS_ALERTA) as TipoAlerta[])
          .filter((t) => conteo.get(t))
          .map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t === tipo ? '' : t)}
              className={cn('rounded-full border px-3 py-1 text-sm', t === tipo ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white')}
            >
              {TIPOS_ALERTA[t]} <span className="opacity-60">{conteo.get(t)}</span>
            </button>
          ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-900/[0.04]" />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <div className="ax-card p-10 text-center text-sm text-[var(--sec)]">Nada pendiente. 👌</div>
      ) : (
        <ul className="space-y-2">
          {visibles.map((a) => {
            const Icono = ICONO[a.tipo]
            return (
              <li key={a.id}>
                <Link href={a.href as Route} className={cn('ax-card flex items-center gap-3 border-l-4 p-3 hover:-translate-y-0.5', TONO[a.gravedad])}>
                  <Icono className="ico h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-[var(--ter)]">{TIPOS_ALERTA[a.tipo]}</p>
                    <p className="truncate text-sm font-medium">{a.titulo}</p>
                    <p className="text-sm text-[var(--sec)]">{a.detalle}</p>
                  </div>
                  {a.monto != null && <span className="ax-num hidden shrink-0 text-sm font-medium sm:block">{pesos(a.monto)}</span>}
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </DashboardLayout>
  )
}

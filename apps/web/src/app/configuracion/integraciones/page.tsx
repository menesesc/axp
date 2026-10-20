'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUser } from '@/hooks/use-user'
import { formatCurrency } from '@/lib/utils'
import { CheckCircle2, Clock, Link2, Loader2, Plug, Trash2, TriangleAlert } from 'lucide-react'

/**
 * Integraciones con otros sistemas, y el costo de personal que alimentan.
 *
 * La primera es Presentia, que es donde viven las horas y los sueldos. Sin
 * eso, finanzas muestra compras y ventas pero se pierde el gasto más grande
 * después de la mercadería, y el resultado del mes miente por mucho.
 *
 * Mientras la conexión no esté, el número se puede cargar a mano: un dato
 * por mes ya arregla el resultado.
 */

interface Integracion {
  sistema: string
  baseUrl: string | null
  apiKeyCola: string | null
  activa: boolean
  config: { ruta?: string; auth?: string; diaPago?: number }
  ultimaSync: string | null
  ultimoError: string | null
}

interface Costo {
  id: string
  periodo: string
  concepto: string
  importe: number
  empleados: number | null
  fechaPago: string | null
  pagado: boolean
  origen: string
}

export default function IntegracionesPage() {
  const { isAdmin, isLoading } = useUser()
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['integraciones'],
    queryFn: async () =>
      (await fetch('/api/integraciones')).json() as Promise<{ integraciones: Integracion[]; cifradoListo: boolean }>,
  })
  const { data: costosData } = useQuery({
    queryKey: ['costos-personal'],
    queryFn: async () => (await fetch('/api/finanzas/costos-personal')).json() as Promise<{ costos: Costo[] }>,
  })

  const presentia = data?.integraciones.find((i) => i.sistema === 'presentia')
  const [url, setUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [ruta, setRuta] = useState('')
  const [diaPago, setDiaPago] = useState('5')

  useEffect(() => {
    if (!presentia) return
    setUrl(presentia.baseUrl ?? '')
    setRuta(presentia.config?.ruta ?? '')
    setDiaPago(String(presentia.config?.diaPago ?? 5))
  }, [presentia])

  const guardar = useMutation({
    mutationFn: async (activa: boolean) => {
      const r = await fetch('/api/integraciones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sistema: 'presentia',
          baseUrl: url.trim(),
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          activa,
          config: { ...(ruta.trim() ? { ruta: ruta.trim() } : {}), diaPago: Number(diaPago) || 5 },
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo guardar')
    },
    onSuccess: () => {
      setApiKey('')
      qc.invalidateQueries({ queryKey: ['integraciones'] })
      toast.success('Integración guardada')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const sincronizar = useMutation({
    mutationFn: async (probar: boolean) => {
      const r = await fetch('/api/integraciones/presentia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ probar }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo conectar')
      return j as { periodos: number }
    },
    onSuccess: (r, probar) => {
      qc.invalidateQueries({ queryKey: ['integraciones'] })
      qc.invalidateQueries({ queryKey: ['costos-personal'] })
      qc.invalidateQueries({ queryKey: ['finanzas-flujo'] })
      toast.success(probar ? `Conecta bien: ${r.periodos} períodos` : `${r.periodos} períodos sincronizados`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading) return null
  if (!isAdmin) {
    return (
      <DashboardLayout>
        <p className="py-8 text-center text-sm text-slate-500">Sólo administración.</p>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <Header
        title="Integraciones"
        description="Otros sistemas que alimentan los números de finanzas."
      />

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white">
            <Plug className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="font-semibold">Presentia · sueldos y horas</p>
            <p className="text-sm text-slate-500">
              Trae el costo de personal de cada mes. Entra en el flujo de caja el día que se paga, no el mes trabajado.
            </p>
          </div>
          {presentia?.ultimaSync && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              {presentia.ultimaSync.replace('T', ' ').slice(0, 16)}
            </span>
          )}
        </div>

        {data && !data.cifradoListo && (
          <p className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
            Falta <code className="font-mono">APP_SECRET</code> en el servidor. Sin eso la clave quedaría guardada en
            claro, así que no se guarda.
          </p>
        )}
        {presentia?.ultimoError && (
          <p className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
            {presentia.ultimoError}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-500">
            URL de Presentia
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://presentia.example.com" />
          </label>
          <label className="text-xs text-slate-500">
            Clave de API
            <Input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type="password"
              placeholder={presentia?.apiKeyCola ? `guardada ····${presentia.apiKeyCola}` : 'pegala acá'}
            />
          </label>
          <label className="text-xs text-slate-500">
            Ruta del endpoint de costos
            <Input value={ruta} onChange={(e) => setRuta(e.target.value)} placeholder="/api/costos/mensual" />
          </label>
          <label className="text-xs text-slate-500">
            Día de pago de sueldos
            <Input
              value={diaPago}
              onChange={(e) => setDiaPago(e.target.value.replace(/\D/g, '').slice(0, 2))}
              inputMode="numeric"
              placeholder="5"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => guardar.mutate(true)} disabled={guardar.isPending || !url.trim()}>
            {guardar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar y activar
          </Button>
          <Button variant="outline" onClick={() => sincronizar.mutate(true)} disabled={sincronizar.isPending} className="gap-1.5">
            <Link2 className="h-4 w-4" /> Probar conexión
          </Button>
          <Button variant="outline" onClick={() => sincronizar.mutate(false)} disabled={sincronizar.isPending} className="gap-1.5">
            {sincronizar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
            Sincronizar ahora
          </Button>
        </div>
      </section>

      <CostosPersonal costos={costosData?.costos ?? []} />
    </DashboardLayout>
  )
}

/** Carga a mano, para cuando la integración todavía no está conectada. */
function CostosPersonal({ costos }: { costos: Costo[] }) {
  const qc = useQueryClient()
  const [periodo, setPeriodo] = useState(() => new Date().toISOString().slice(0, 7))
  const [importe, setImporte] = useState('')
  const [empleados, setEmpleados] = useState('')

  const guardar = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/finanzas/costos-personal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodo,
          importe: Number(importe),
          empleados: empleados ? Number(empleados) : null,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo guardar')
    },
    onSuccess: () => {
      setImporte('')
      setEmpleados('')
      qc.invalidateQueries({ queryKey: ['costos-personal'] })
      qc.invalidateQueries({ queryKey: ['finanzas-flujo'] })
      toast.success('Guardado')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const borrar = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/finanzas/costos-personal?id=${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('No se pudo borrar')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['costos-personal'] })
      qc.invalidateQueries({ queryKey: ['finanzas-flujo'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="font-semibold">Costo de personal</p>
      <p className="mb-4 text-sm text-slate-500">
        Lo que trae Presentia, o lo que cargues a mano mientras tanto. Un número por mes ya hace que el resultado de
        caja deje de mentir.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">
          Mes trabajado
          <Input value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="2026-10" className="w-32" />
        </label>
        <label className="text-xs text-slate-500">
          Importe
          <Input
            value={importe}
            onChange={(e) => setImporte(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className="w-40 text-right"
          />
        </label>
        <label className="text-xs text-slate-500">
          Empleados
          <Input
            value={empleados}
            onChange={(e) => setEmpleados(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className="w-24 text-right"
          />
        </label>
        <Button onClick={() => guardar.mutate()} disabled={!importe || guardar.isPending}>
          Guardar
        </Button>
      </div>

      {costos.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Todavía no hay ningún mes cargado.</p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {costos.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="w-20 font-semibold tabular-nums">{c.periodo}</span>
              <span className="w-28 text-right font-semibold tabular-nums">{formatCurrency(c.importe)}</span>
              <span className="text-xs text-slate-400">
                {c.empleados ? `${c.empleados} personas · ` : ''}
                paga {c.fechaPago?.slice(8)}/{c.fechaPago?.slice(5, 7)}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  c.origen === 'presentia' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {c.origen === 'presentia' ? 'Presentia' : 'a mano'}
              </span>
              <button
                onClick={() => borrar.mutate(c.id)}
                className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-600"
                aria-label="Borrar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

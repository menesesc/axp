'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUser } from '@/hooks/use-user'
import { SECCION } from '@/lib/permisos'
import { hoyAR } from '@/lib/fechas'
import { fmtNumAR } from '@/components/sales/shared'
import { AlertTriangle, CheckCircle2, ClipboardList, Loader2, Save, Search, Warehouse } from 'lucide-react'

interface FilaStock {
  id: string
  nombre: string
  unidadBase: string
  categoria: string | null
  conteo: number | null
  nota: string | null
  ultimoConteoFecha: string | null
  ultimoConteo: number | null
  esperado: number | null
  actual: number | null
  stockSeguro: number | null
}

interface Deposito {
  id: string
  nombre: string
  esCentral: boolean
}

interface StockResponse {
  fecha: string
  deposito: Deposito
  depositos: Deposito[]
  insumos: FilaStock[]
  fechas: Array<{ fecha: string; insumos: number }>
}

type Modo = 'contar' | 'seguro'
type Filtro = 'todos' | 'pendientes' | 'contados' | 'bajos'

function fmtFecha(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y!.slice(2)}`
}

/** Parsea "1,5" o "1.5" → 1.5. Vacío → null. Inválido → undefined. */
function parseCantidad(v: string): number | null | undefined {
  const t = v.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

const aTexto = (n: number | null) => (n === null ? '' : String(n).replace('.', ','))

/** ¿El stock actual llegó al stock seguro? (alerta de reposición) */
function bajoSeguro(i: { actual: number | null; stockSeguro: number | null }) {
  return i.stockSeguro !== null && i.actual !== null && i.actual <= i.stockSeguro
}

export default function StockPage() {
  const { isLoading, canEdit } = useUser()
  const edita = canEdit(SECCION.CONCILIACION_STOCK)
  const qc = useQueryClient()
  const [fecha, setFecha] = useState(hoyAR())
  const [depositoId, setDepositoId] = useState('')
  const [modo, setModo] = useState<Modo>('contar')
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  // Borradores (texto tipeado) de conteo y de stock seguro, por insumo.
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [draftSeguro, setDraftSeguro] = useState<Record<string, string>>({})

  const { data, isLoading: cargando } = useQuery({
    queryKey: ['conciliacion-stock', fecha, depositoId],
    queryFn: async () => {
      const p = new URLSearchParams({ fecha })
      if (depositoId) p.set('depositoId', depositoId)
      const res = await fetch(`/api/conciliacion/stock?${p}`)
      if (!res.ok) throw new Error('Error cargando stock')
      return res.json() as Promise<StockResponse>
    },
    enabled: !isLoading,
  })

  useEffect(() => {
    if (!data) return
    setDraft(Object.fromEntries(data.insumos.map((i) => [i.id, aTexto(i.conteo)])))
    setDraftSeguro(Object.fromEntries(data.insumos.map((i) => [i.id, aTexto(i.stockSeguro)])))
  }, [data])

  const cambios = useMemo(() => {
    if (!data) return { conteos: [], seguros: [] }
    return {
      conteos: data.insumos
        .map((i) => ({ i, v: parseCantidad(draft[i.id] ?? '') }))
        .filter(({ i, v }) => v !== undefined && v !== i.conteo)
        .map(({ i, v }) => ({ insumoId: i.id, cantidad: v as number | null })),
      seguros: data.insumos
        .map((i) => ({ i, v: parseCantidad(draftSeguro[i.id] ?? '') }))
        .filter(({ i, v }) => v !== undefined && v !== i.stockSeguro)
        .map(({ i, v }) => ({ insumoId: i.id, stockSeguro: v as number | null })),
    }
  }, [data, draft, draftSeguro])
  const totalCambios = cambios.conteos.length + cambios.seguros.length
  const invalidos =
    data?.insumos.filter(
      (i) => parseCantidad(draft[i.id] ?? '') === undefined || parseCantidad(draftSeguro[i.id] ?? '') === undefined
    ).length ?? 0

  const guardar = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/conciliacion/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, depositoId: data!.deposito.id, ...cambios }),
      })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error || 'Error al guardar')
      return r as { guardados: number }
    },
    onSuccess: (r) => {
      toast.success(`${r.guardados} cambio${r.guardados === 1 ? '' : 's'} guardado${r.guardados === 1 ? '' : 's'}`)
      qc.invalidateQueries({ queryKey: ['conciliacion-stock'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading) return null

  const q = search.trim().toLowerCase()
  const filas = (data?.insumos ?? [])
    .filter((i) => !q || i.nombre.toLowerCase().includes(q))
    .filter((i) =>
      filtro === 'pendientes' ? i.conteo === null : filtro === 'contados' ? i.conteo !== null : filtro === 'bajos' ? bajoSeguro(i) : true
    )
  const contados = data?.insumos.filter((i) => i.conteo !== null).length ?? 0
  const bajos = data?.insumos.filter(bajoSeguro).length ?? 0
  const total = data?.insumos.length ?? 0

  const cambiarDeposito = (id: string) => {
    if (totalCambios > 0 && !window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) return
    setDepositoId(id)
  }

  return (
    <DashboardLayout>
      <Header
        title="Stock"
        description="Conteo físico y stock seguro por depósito. El esperado sale del último conteo + compras (central) + pedidos recibidos − pedidos despachados − consumo de ventas según recetas. Contá a la mañana, antes del servicio."
      />

      {/* Depósitos */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {data?.depositos.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => cambiarDeposito(d.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
              d.id === data.deposito.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Warehouse className="h-4 w-4" />
            {d.nombre}
            {d.esCentral && <span className="text-[10px] uppercase opacity-70">central</span>}
          </button>
        ))}
        <div className="ml-auto inline-flex rounded-md border border-slate-200 p-0.5 text-sm bg-white">
          {([['contar', 'Contar'], ['seguro', 'Stock seguro']] as Array<[Modo, string]>).map(([m, l]) => (
            <button
              key={m}
              type="button"
              onClick={() => { setModo(m); setFiltro('todos') }}
              className={`px-3 py-1 rounded ${modo === m ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        {modo === 'contar' && (
          <Input
            type="date"
            value={fecha}
            max={hoyAR()}
            onChange={(e) => e.target.value && setFecha(e.target.value)}
            className="w-auto"
          />
        )}
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Buscar insumo" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="inline-flex rounded-md border border-slate-200 p-0.5 text-sm">
          {(
            (modo === 'contar'
              ? [['todos', 'Todos'], ['pendientes', 'Pendientes'], ['contados', 'Contados']]
              : [['todos', 'Todos'], ['bajos', 'A reponer']]) as Array<[Filtro, string]>
          ).map(([f, l]) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={`px-3 py-1 rounded ${filtro === f ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
            >
              {l}
            </button>
          ))}
        </div>
        {modo === 'contar' ? (
          <span className="text-sm text-slate-500 inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            {contados} de {total} contados
          </span>
        ) : (
          bajos > 0 && (
            <span className="text-sm text-red-600 inline-flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              {bajos} en o bajo el stock seguro
            </span>
          )
        )}
      </div>

      {modo === 'contar' && data && data.fechas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4 text-xs">
          <span className="text-slate-400">Conteos anteriores:</span>
          {data.fechas.map((f) => (
            <button
              key={f.fecha}
              type="button"
              onClick={() => setFecha(f.fecha)}
              className={`rounded-full border px-2 py-0.5 ${f.fecha === fecha ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {fmtFecha(f.fecha)} · {f.insumos}
            </button>
          ))}
        </div>
      )}

      {cargando || !data ? (
        <div className="bg-white border rounded-lg p-12 text-center text-slate-400 text-sm">
          <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
          Cargando…
        </div>
      ) : total === 0 ? (
        <div className="bg-white border rounded-lg p-12 text-center text-slate-500 text-sm">
          <ClipboardList className="h-10 w-10 mx-auto mb-2 text-slate-300" />
          No hay insumos activos. Crealos en Conciliación → Insumos.
        </div>
      ) : modo === 'contar' ? (
        <div className="bg-white border rounded-lg divide-y pb-16 sm:pb-0">
          <div className="hidden sm:grid grid-cols-[1fr_140px_130px_150px_110px] gap-3 px-4 py-2 text-xs font-medium text-slate-500 bg-slate-50 rounded-t-lg">
            <span>Insumo</span>
            <span className="text-right">Último conteo</span>
            <span className="text-right">Esperado</span>
            <span className="text-right">Conteo</span>
            <span className="text-right">Diferencia</span>
          </div>
          {filas.map((i) => {
            const v = parseCantidad(draft[i.id] ?? '')
            const dif = typeof v === 'number' && i.esperado !== null ? v - i.esperado : null
            const tol = Math.max(0.5, Math.abs(i.esperado ?? 0) * 0.05)
            const modificado = v !== undefined && v !== i.conteo
            return (
              <div
                key={i.id}
                className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_140px_130px_150px_110px] gap-x-3 gap-y-1 px-4 py-3 items-center"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{i.nombre}</p>
                  <p className="text-xs text-slate-400 sm:hidden">
                    {i.esperado !== null ? `Esperado ${fmtNumAR(i.esperado, 2)} ${i.unidadBase}` : 'Sin conteo previo'}
                  </p>
                </div>
                <div className="hidden sm:block text-right text-sm text-slate-500 tabular-nums">
                  {i.ultimoConteo !== null ? (
                    <>
                      {fmtNumAR(i.ultimoConteo, 2)} {i.unidadBase}
                      <div className="text-[11px] text-slate-400">{fmtFecha(i.ultimoConteoFecha!)}</div>
                    </>
                  ) : (
                    '—'
                  )}
                </div>
                <div className="hidden sm:block text-right text-sm tabular-nums">
                  {i.esperado !== null ? `${fmtNumAR(i.esperado, 2)} ${i.unidadBase}` : <span className="text-slate-300">—</span>}
                </div>
                <div className="flex items-center justify-end gap-1.5 row-span-2 sm:row-span-1">
                  <Input
                    inputMode="decimal"
                    disabled={!edita}
                    value={draft[i.id] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [i.id]: e.target.value }))}
                    placeholder="—"
                    className={`w-24 text-right tabular-nums ${
                      v === undefined ? 'border-red-400' : modificado ? 'border-blue-400 bg-blue-50' : ''
                    }`}
                  />
                  <span className="text-xs text-slate-500 w-6">{i.unidadBase}</span>
                </div>
                <div
                  className={`text-xs sm:text-sm sm:text-right tabular-nums ${
                    dif === null ? 'text-slate-300' : Math.abs(dif) <= tol ? 'text-emerald-600' : dif < 0 ? 'text-red-600' : 'text-amber-600'
                  }`}
                >
                  {dif === null ? '' : `${dif > 0 ? '+' : ''}${fmtNumAR(dif, 2)} ${i.unidadBase}`}
                </div>
              </div>
            )
          })}
          {filas.length === 0 && <p className="p-8 text-center text-sm text-slate-400">Nada para mostrar con este filtro.</p>}
        </div>
      ) : (
        <div className="bg-white border rounded-lg divide-y pb-16 sm:pb-0">
          <div className="hidden sm:grid grid-cols-[1fr_150px_170px_120px] gap-3 px-4 py-2 text-xs font-medium text-slate-500 bg-slate-50 rounded-t-lg">
            <span>Insumo</span>
            <span className="text-right">Stock actual (estimado)</span>
            <span className="text-right">Stock seguro</span>
            <span className="text-right">Estado</span>
          </div>
          {filas.map((i) => {
            const v = parseCantidad(draftSeguro[i.id] ?? '')
            const seguro = typeof v === 'number' ? v : v === null ? null : i.stockSeguro
            const bajo = bajoSeguro({ actual: i.actual, stockSeguro: seguro })
            return (
              <div
                key={i.id}
                className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_150px_170px_120px] gap-x-3 gap-y-1 px-4 py-3 items-center"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{i.nombre}</p>
                  <p className="text-xs text-slate-400 sm:hidden">
                    Actual {i.actual !== null ? `${fmtNumAR(i.actual, 2)} ${i.unidadBase}` : 'sin conteo'}
                  </p>
                </div>
                <div className="hidden sm:block text-right text-sm tabular-nums">
                  {i.actual !== null ? `${fmtNumAR(i.actual, 2)} ${i.unidadBase}` : <span className="text-slate-300">sin conteo</span>}
                </div>
                <div className="flex items-center justify-end gap-1.5 row-span-2 sm:row-span-1">
                  <Input
                    inputMode="decimal"
                    disabled={!edita}
                    value={draftSeguro[i.id] ?? ''}
                    onChange={(e) => setDraftSeguro((d) => ({ ...d, [i.id]: e.target.value }))}
                    placeholder="—"
                    className={`w-24 text-right tabular-nums ${
                      v === undefined ? 'border-red-400' : v !== i.stockSeguro ? 'border-blue-400 bg-blue-50' : ''
                    }`}
                  />
                  <span className="text-xs text-slate-500 w-6">{i.unidadBase}</span>
                </div>
                <div className="text-xs sm:text-right">
                  {bajo ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 px-2 py-0.5">
                      <AlertTriangle className="h-3 w-3" /> Reponer
                    </span>
                  ) : seguro !== null && i.actual !== null ? (
                    <span className="text-emerald-600">OK</span>
                  ) : null}
                </div>
              </div>
            )
          })}
          {filas.length === 0 && <p className="p-8 text-center text-sm text-slate-400">Nada para mostrar con este filtro.</p>}
        </div>
      )}

      {edita && (
        <div className="fixed bottom-0 inset-x-0 sm:static sm:mt-4 bg-white/95 sm:bg-transparent border-t sm:border-0 p-3 sm:p-0 flex items-center justify-end gap-3 z-20">
          {invalidos > 0 && <span className="text-sm text-red-600">{invalidos} cantidad(es) inválida(s)</span>}
          <Button onClick={() => guardar.mutate()} disabled={totalCambios === 0 || invalidos > 0 || guardar.isPending} className="gap-2">
            {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar {totalCambios > 0 ? `(${totalCambios})` : ''}
          </Button>
        </div>
      )}
    </DashboardLayout>
  )
}

'use client'

import { Fragment, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useUser } from '@/hooks/use-user'
import { fmtNumAR } from '@/components/sales/shared'
import { ChevronDown, ChevronRight, Loader2, Plus, Star, Warehouse } from 'lucide-react'

interface Deposito {
  id: string
  nombre: string
  esCentral: boolean
  orden: number
  activo: boolean
}

interface Producto {
  id: string
  nombre: string
  rubro: string | null
  depositoId: string | null
  unidades: number
  conReceta: boolean
}

const SIN_RUBRO = '(sin rubro)'

async function llamar(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const r = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(r.error || 'Error')
  return r
}

export default function DepositosPage() {
  const { isLoading, isAdmin } = useUser()
  const qc = useQueryClient()
  const [nuevo, setNuevo] = useState('')
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [guardando, setGuardando] = useState<string | null>(null)

  const { data } = useQuery({
    queryKey: ['config-depositos'],
    queryFn: async () => {
      const res = await fetch('/api/configuracion/depositos')
      if (!res.ok) throw new Error('Error cargando depósitos')
      return res.json() as Promise<{ depositos: Deposito[]; productos: Producto[] }>
    },
    enabled: !isLoading,
  })
  const refrescar = () => qc.invalidateQueries({ queryKey: ['config-depositos'] })

  const rubros = useMemo(() => {
    const m = new Map<string, Producto[]>()
    for (const p of data?.productos ?? []) {
      const k = p.rubro ?? SIN_RUBRO
      m.set(k, [...(m.get(k) ?? []), p])
    }
    return [...m.entries()]
      .map(([rubro, productos]) => {
        const ids = new Set(productos.map((p) => p.depositoId ?? ''))
        return {
          rubro,
          productos,
          unidades: productos.reduce((s, p) => s + p.unidades, 0),
          depositoId: ids.size === 1 ? [...ids][0]! : 'mixto',
        }
      })
      .sort((a, b) => b.unidades - a.unidades)
  }, [data])

  if (isLoading) return null
  if (!isAdmin) {
    return (
      <DashboardLayout>
        <p className="text-sm text-slate-500">Solo los administradores pueden configurar depósitos.</p>
      </DashboardLayout>
    )
  }

  const depositos = data?.depositos ?? []
  const activos = depositos.filter((d) => d.activo)
  const central = depositos.find((d) => d.esCentral)
  const sinAsignar = (data?.productos ?? []).filter((p) => !p.depositoId).length

  const ejecutar = async (clave: string, fn: () => Promise<unknown>, ok?: string) => {
    setGuardando(clave)
    try {
      await fn()
      if (ok) toast.success(ok)
      refrescar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setGuardando(null)
    }
  }

  const asignarRubro = (rubro: string, depositoId: string) =>
    ejecutar(
      `rubro:${rubro}`,
      () =>
        llamar('/api/configuracion/depositos/salida', 'POST', {
          depositoId: depositoId || null,
          ...(rubro === SIN_RUBRO ? { sinRubro: true } : { rubro }),
        }),
      `${rubro}: depósito de salida actualizado`
    )

  const asignarProducto = (p: Producto, depositoId: string) =>
    ejecutar(`prod:${p.id}`, () =>
      llamar('/api/configuracion/depositos/salida', 'POST', { depositoId: depositoId || null, productIds: [p.id] })
    )

  const SelectDeposito = ({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) => (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white min-w-[150px]"
    >
      {value === 'mixto' && <option value="mixto">Varios</option>}
      <option value="">Sin asignar ({central?.nombre ?? 'central'})</option>
      {activos.map((d) => (
        <option key={d.id} value={d.id}>
          {d.nombre}
        </option>
      ))}
    </select>
  )

  return (
    <DashboardLayout>
      <Header
        title="Depósitos"
        description="El central recibe todas las compras y despacha a los demás. Cada producto vendido sale de un depósito: de ahí se descuenta su receta y a ese depósito se le arma el pedido interno del día."
      />

      {/* Depósitos */}
      <div className="bg-white border rounded-lg mb-6">
        <div className="px-4 py-3 border-b">
          <h3 className="font-medium text-slate-900">Depósitos</h3>
        </div>
        <div className="divide-y">
          {depositos.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Warehouse className={`h-4 w-4 ${d.activo ? 'text-slate-500' : 'text-slate-300'}`} />
              <Input
                defaultValue={d.nombre}
                className="max-w-[240px]"
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v && v !== d.nombre) ejecutar(`dep:${d.id}`, () => llamar(`/api/configuracion/depositos/${d.id}`, 'PATCH', { nombre: v }), 'Depósito renombrado')
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
              {d.esCentral ? (
                <span className="inline-flex items-center gap-1 text-sm text-amber-700 bg-amber-50 rounded-full px-2.5 py-0.5">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" /> Central
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-500"
                  onClick={() =>
                    ejecutar(`dep:${d.id}`, () => llamar(`/api/configuracion/depositos/${d.id}`, 'PATCH', { esCentral: true }), `${d.nombre} es ahora el central`)
                  }
                >
                  <Star className="h-3.5 w-3.5 mr-1" /> Marcar como central
                </Button>
              )}
              <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
                Activo
                <Switch
                  checked={d.activo}
                  disabled={d.esCentral}
                  onCheckedChange={(v) => ejecutar(`dep:${d.id}`, () => llamar(`/api/configuracion/depositos/${d.id}`, 'PATCH', { activo: v }))}
                />
              </label>
              {guardando === `dep:${d.id}` && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            </div>
          ))}
          <div className="flex items-center gap-2 px-4 py-3">
            <Input
              placeholder="Nuevo depósito"
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && nuevo.trim() && ejecutar('nuevo', () => llamar('/api/configuracion/depositos', 'POST', { nombre: nuevo }).then(() => setNuevo('')))}
              className="max-w-[240px]"
            />
            <Button
              variant="outline"
              disabled={!nuevo.trim() || guardando === 'nuevo'}
              onClick={() => ejecutar('nuevo', () => llamar('/api/configuracion/depositos', 'POST', { nombre: nuevo }).then(() => setNuevo('')))}
              className="gap-1"
            >
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          </div>
        </div>
      </div>

      {/* Depósito de salida */}
      <div className="bg-white border rounded-lg">
        <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-medium text-slate-900">Depósito de salida de lo vendido</h3>
            <p className="text-xs text-slate-500">
              Asigná por rubro y, si hace falta, cambiá productos puntuales. Lo que quede sin asignar consume del central.
            </p>
          </div>
          {sinAsignar > 0 && <span className="text-xs text-amber-700 bg-amber-50 rounded-full px-2.5 py-1">{sinAsignar} productos sin asignar</span>}
        </div>
        {!data ? (
          <div className="p-8 text-center text-sm text-slate-400">Cargando…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="text-left font-medium px-4 py-2">Rubro</th>
                <th className="text-right font-medium px-4 py-2 hidden sm:table-cell">Productos</th>
                <th className="text-right font-medium px-4 py-2 hidden sm:table-cell">Vendidos 60 días</th>
                <th className="text-right font-medium px-4 py-2">Sale de</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rubros.map((r) => {
                const abierto = abiertos.has(r.rubro)
                return (
                  <Fragment key={r.rubro}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-medium"
                          onClick={() =>
                            setAbiertos((s) => {
                              const n = new Set(s)
                              if (n.has(r.rubro)) n.delete(r.rubro)
                              else n.add(r.rubro)
                              return n
                            })
                          }
                        >
                          {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          {r.rubro}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-500 hidden sm:table-cell">{r.productos.length}</td>
                      <td className="px-4 py-2 text-right text-slate-500 tabular-nums hidden sm:table-cell">{fmtNumAR(r.unidades)}</td>
                      <td className="px-4 py-2 text-right">
                        <span className="inline-flex items-center gap-2">
                          {guardando === `rubro:${r.rubro}` && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                          <SelectDeposito value={r.depositoId} onChange={(v) => v !== 'mixto' && asignarRubro(r.rubro, v)} />
                        </span>
                      </td>
                    </tr>
                    {abierto &&
                      r.productos.map((p) => (
                        <tr key={p.id} className="bg-slate-50/50">
                          <td className="pl-10 pr-4 py-1.5 text-slate-600" colSpan={2}>
                            {p.nombre}
                            {!p.conReceta && <span className="ml-2 text-[11px] text-amber-600">sin receta</span>}
                          </td>
                          <td className="px-4 py-1.5 text-right text-slate-400 tabular-nums hidden sm:table-cell">{fmtNumAR(p.unidades)}</td>
                          <td className="px-4 py-1.5 text-right">
                            <SelectDeposito
                              value={p.depositoId ?? ''}
                              disabled={guardando === `prod:${p.id}`}
                              onChange={(v) => asignarProducto(p, v)}
                            />
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </DashboardLayout>
  )
}

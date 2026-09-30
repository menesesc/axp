'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useUser } from '@/hooks/use-user'
import { SECCION } from '@/lib/permisos'
import { formatCurrency } from '@/lib/utils'
import { waPhone } from '@/lib/whatsapp'
import { AlertTriangle, CheckCircle2, Clock, Copy, Loader2, MessageCircle, Search, ShoppingBasket, Truck, X } from 'lucide-react'
import type { Sugerencia } from '@/lib/stock/compras'

type Filtro = 'alertas' | 'pedir' | 'pronto' | 'todos' | 'sin_datos'

interface PedidoProveedor {
  id: string
  numero: number
  proveedorId: string
  proveedor: string
  estado: 'enviado' | 'facturado' | 'recibido' | 'cancelado'
  fecha: string
  fechaEsperada: string | null
  items: Array<{ descripcion: string; cantidad: number; cantidadBase: number; unidad: string | null }>
}

/** Línea elegida para pedir: insumo + proveedor + cantidad en unidad de factura. */
interface Eleccion {
  proveedorId: string
  cantidad: string
}

const ESTADO: Record<Sugerencia['estado'], { label: string; cls: string }> = {
  pedir: { label: 'Pedir ya', cls: 'bg-red-50 text-red-700' },
  pronto: { label: 'Pedir pronto', cls: 'bg-amber-50 text-amber-700' },
  ok: { label: 'OK', cls: 'bg-emerald-50 text-emerald-700' },
  sin_datos: { label: 'Sin datos', cls: 'bg-slate-100 text-slate-500' },
}

const n = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined ? '—' : v.toLocaleString('es-AR', { maximumFractionDigits: d })

function fmtFecha(iso: string | null) {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

/** Cantidad sugerida en unidad de factura: cajas enteras, o kg/l con un decimal. */
function enUnidadFactura(base: number, factor: number): number {
  if (base <= 0) return 0
  const q = base / factor
  return factor > 1 ? Math.ceil(q - 1e-9) : Math.ceil(q * 10 - 1e-9) / 10
}

function saludo() {
  const h = new Date().getHours()
  return h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
}

export default function ComprasPage() {
  const { isLoading, canEdit, canSeeImportes } = useUser()
  const edita = canEdit(SECCION.CONCILIACION_COMPRAS)
  const veImportes = canSeeImportes(SECCION.CONCILIACION_COMPRAS)
  const qc = useQueryClient()
  const [dias, setDias] = useState(7)
  const [filtro, setFiltro] = useState<Filtro>('alertas')
  const [search, setSearch] = useState('')
  const [eleccion, setEleccion] = useState<Record<string, Eleccion>>({})
  const [enviando, setEnviando] = useState<string | null>(null)

  const { data, isLoading: cargando } = useQuery({
    queryKey: ['compras-sugeridas', dias],
    queryFn: async () => {
      const res = await fetch(`/api/compras/sugeridas?dias=${dias}`)
      if (!res.ok) throw new Error('Error cargando sugerencias')
      return res.json() as Promise<{ sugerencias: Sugerencia[] }>
    },
    enabled: !isLoading,
  })
  const { data: pedidosData } = useQuery({
    queryKey: ['compras-pedidos'],
    queryFn: async () => {
      const res = await fetch('/api/compras/pedidos')
      if (!res.ok) throw new Error('Error cargando pedidos')
      return res.json() as Promise<{ pedidos: PedidoProveedor[] }>
    },
    enabled: !isLoading,
  })

  const sugerencias = useMemo(() => data?.sugerencias ?? [], [data])
  const porId = useMemo(() => new Map(sugerencias.map((s) => [s.insumoId, s])), [sugerencias])
  const cuenta = (e: Sugerencia['estado']) => sugerencias.filter((s) => s.estado === e).length

  const toggle = (s: Sugerencia) =>
    setEleccion((prev) => {
      const next = { ...prev }
      if (next[s.insumoId]) delete next[s.insumoId]
      else {
        const p = s.proveedores[0]
        next[s.insumoId] = {
          proveedorId: p?.proveedorId ?? '',
          cantidad: String(enUnidadFactura(s.sugeridoBase, p?.factor ?? 1) || '').replace('.', ','),
        }
      }
      return next
    })

  const tildarAlertas = () =>
    setEleccion((prev) => {
      const next = { ...prev }
      for (const s of sugerencias) {
        if (s.estado !== 'pedir' && s.estado !== 'pronto') continue
        if (next[s.insumoId] || s.proveedores.length === 0) continue
        const p = s.proveedores[0]!
        next[s.insumoId] = { proveedorId: p.proveedorId, cantidad: String(enUnidadFactura(s.sugeridoBase, p.factor) || '').replace('.', ',') }
      }
      return next
    })

  // Pedido agrupado por proveedor.
  const grupos = useMemo(() => {
    const m = new Map<
      string,
      {
        proveedorId: string
        razonSocial: string
        telefono: string | null
        contacto: string | null
        diasEntrega: number | null
        lineas: Array<{ insumoId: string; descripcion: string; cantidad: number; factor: number; precioUnitario: number | null }>
      }
    >()
    for (const [insumoId, e] of Object.entries(eleccion)) {
      const s = porId.get(insumoId)
      const p = s?.proveedores.find((x) => x.proveedorId === e.proveedorId)
      const cantidad = Number(e.cantidad.replace(',', '.'))
      if (!s || !p || !(cantidad > 0)) continue
      const g = m.get(p.proveedorId) ?? {
        proveedorId: p.proveedorId,
        razonSocial: p.razonSocial,
        telefono: p.telefono,
        contacto: p.contacto,
        diasEntrega: p.diasEntrega,
        lineas: [],
      }
      g.lineas.push({ insumoId, descripcion: p.descripcion.replace(/\s+/g, ' ').trim(), cantidad, factor: p.factor, precioUnitario: p.precioUnitario })
      m.set(p.proveedorId, g)
    }
    return [...m.values()]
  }, [eleccion, porId])

  const textoGrupo = (g: (typeof grupos)[number]) =>
    [
      `${saludo()}${g.contacto ? ` ${g.contacto}` : ''}, te paso el pedido:`,
      ...g.lineas.map((l) => `• ${n(l.cantidad, 2)} × ${l.descripcion}`),
      '',
      'Gracias!',
    ].join('\n')

  const enviarGrupo = useCallback(
    async (g: (typeof grupos)[number], abrirWhatsapp: boolean) => {
      const texto = textoGrupo(g)
      // Copiar y abrir WhatsApp sin await previo: el navegador solo permite
      // ventanas nuevas y portapapeles dentro del gesto del usuario.
      const copia = navigator.clipboard?.writeText(texto).catch(() => undefined)
      if (!abrirWhatsapp) {
        await copia
        toast.success('Pedido copiado')
        return
      }
      const phone = waPhone(g.telefono)
      window.open(
        phone ? `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(texto)}` : 'https://web.whatsapp.com/',
        'whatsapp'
      )
      if (!phone) toast.info(`${g.razonSocial} no tiene teléfono de pedidos: el pedido quedó copiado para pegarlo.`)
      if (!edita) return
      setEnviando(g.proveedorId)
      try {
        const res = await fetch('/api/compras/pedidos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proveedorId: g.proveedorId, items: g.lineas }),
        })
        const r = await res.json()
        if (!res.ok) throw new Error(r.error || 'Error')
        toast.success(`Pedido #${r.pedido.numero} a ${g.razonSocial} registrado como en camino`)
        setEleccion((prev) => {
          const next = { ...prev }
          for (const l of g.lineas) delete next[l.insumoId]
          return next
        })
        qc.invalidateQueries({ queryKey: ['compras-sugeridas'] })
        qc.invalidateQueries({ queryKey: ['compras-pedidos'] })
        qc.invalidateQueries({ queryKey: ['compras-alertas'] })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Error al registrar el pedido')
      } finally {
        setEnviando(null)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edita, qc]
  )

  // Tecla rápida: W abre WhatsApp con el primer pedido armado (fuera de inputs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'w' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return
      const g = grupos[0]
      if (!g) return
      e.preventDefault()
      enviarGrupo(g, true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [grupos, enviarGrupo])

  const cambiarEstadoPedido = async (id: string, estado: string) => {
    const res = await fetch(`/api/compras/pedidos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    if (!res.ok) {
      toast.error('No se pudo actualizar')
      return
    }
    qc.invalidateQueries({ queryKey: ['compras-pedidos'] })
    qc.invalidateQueries({ queryKey: ['compras-sugeridas'] })
  }

  if (isLoading) return null

  const q = search.trim().toLowerCase()
  const filas = sugerencias
    .filter((s) => !q || s.nombre.toLowerCase().includes(q))
    .filter((s) =>
      filtro === 'alertas' ? s.estado === 'pedir' || s.estado === 'pronto' : filtro === 'todos' ? true : s.estado === filtro
    )
    .sort((a, b) => {
      const orden = { pedir: 0, pronto: 1, ok: 2, sin_datos: 3 }
      return orden[a.estado] - orden[b.estado] || (a.diasCobertura ?? 999) - (b.diasCobertura ?? 999)
    })
  const enCamino = (pedidosData?.pedidos ?? []).filter((p) => p.estado === 'enviado')

  return (
    <DashboardLayout>
      <Header
        title="Compras sugeridas"
        description="Qué pedir a proveedores según el stock del depósito central, el stock seguro, el consumo de las últimas 4 semanas y el tiempo de entrega de cada proveedor."
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(
          [
            ['alertas', `Alertas (${cuenta('pedir') + cuenta('pronto')})`],
            ['pedir', `Pedir ya (${cuenta('pedir')})`],
            ['pronto', `Pronto (${cuenta('pronto')})`],
            ['todos', 'Todos'],
            ['sin_datos', `Sin datos (${cuenta('sin_datos')})`],
          ] as Array<[Filtro, string]>
        ).map(([f, l]) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={`rounded-full border px-3 py-1 text-sm ${filtro === f ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
          >
            {l}
          </button>
        ))}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Buscar insumo" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 ml-auto" title="Además del tiempo de entrega, cuántos días de consumo tiene que cubrir lo que se pide">
          Cubrir
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="border border-slate-200 rounded-md px-2 py-1.5 bg-white">
            {[3, 5, 7, 10, 14, 21, 30].map((d) => (
              <option key={d} value={d}>
                {d} días
              </option>
            ))}
          </select>
        </label>
        {edita && (
          <Button variant="outline" size="sm" onClick={tildarAlertas} disabled={cuenta('pedir') + cuenta('pronto') === 0}>
            Tildar alertas
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5 items-start">
        {/* Insumos */}
        <div className="bg-white border rounded-lg overflow-x-auto">
          {cargando ? (
            <div className="p-12 text-center text-sm text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Calculando…
            </div>
          ) : filas.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-300" />
              {filtro === 'alertas' ? 'Nada para pedir por ahora.' : 'Nada para mostrar.'}
              {cuenta('sin_datos') > 0 && (
                <p className="text-xs text-slate-400 mt-2">
                  {cuenta('sin_datos')} insumos sin datos: les falta conteo o stock seguro en el central (Conciliación → Stock).
                </p>
              )}
            </div>
          ) : (
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  {edita && <th className="w-8" />}
                  <th className="text-left font-medium px-3 py-2">Insumo</th>
                  <th className="text-right font-medium px-3 py-2">Stock / seguro</th>
                  <th className="text-right font-medium px-3 py-2">Consumo/día</th>
                  <th className="text-right font-medium px-3 py-2">Cobertura</th>
                  <th className="text-left font-medium px-3 py-2">Proveedor</th>
                  <th className="text-right font-medium px-3 py-2">Pedir</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filas.map((s) => {
                  const e = eleccion[s.insumoId]
                  const prov = s.proveedores.find((p) => p.proveedorId === (e?.proveedorId ?? s.proveedorSugeridoId)) ?? s.proveedores[0]
                  return (
                    <tr key={s.insumoId} className={e ? 'bg-blue-50/40' : ''}>
                      {edita && (
                        <td className="pl-3">
                          <Checkbox checked={!!e} disabled={s.proveedores.length === 0} onCheckedChange={() => toggle(s)} />
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <p className="font-medium">{s.nombre}</p>
                        <span className={`inline-block text-[11px] rounded-full px-2 py-0.5 mt-0.5 ${ESTADO[s.estado].cls}`}>
                          {s.estado === 'pedir' && <AlertTriangle className="h-3 w-3 inline mr-0.5 -mt-0.5" />}
                          {ESTADO[s.estado].label}
                        </span>
                        {s.estado === 'sin_datos' && (
                          <span className="text-[11px] text-slate-400 ml-1">
                            {s.stock === null ? 'sin conteo en central' : 'sin stock seguro'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {n(s.stock)} <span className="text-slate-400">/ {n(s.seguro)}</span> <span className="text-xs text-slate-400">{s.unidad}</span>
                        {s.enCamino > 0 && (
                          <div className="text-[11px] text-blue-600">
                            <Truck className="h-3 w-3 inline -mt-0.5" /> +{n(s.enCamino)} en camino
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {s.demandaDiaria > 0 ? `${n(s.demandaDiaria, 2)} ${s.unidad}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s.diasCobertura !== null ? (
                          <span className={s.diasCobertura <= s.diasEntrega ? 'text-red-600 font-medium' : ''}>{n(s.diasCobertura, 0)} días</span>
                        ) : (
                          '—'
                        )}
                        <div className="text-[11px] text-slate-400">entrega {s.diasEntrega === 0 ? 'en el día' : `${s.diasEntrega} d`}</div>
                      </td>
                      <td className="px-3 py-2 max-w-[260px]">
                        {s.proveedores.length === 0 ? (
                          <span className="text-xs text-slate-400">Sin compras asignadas a este insumo</span>
                        ) : e && s.proveedores.length > 1 ? (
                          <select
                            value={e.proveedorId}
                            onChange={(ev) => {
                              const np = s.proveedores.find((p) => p.proveedorId === ev.target.value)!
                              setEleccion((prev) => ({
                                ...prev,
                                [s.insumoId]: {
                                  proveedorId: np.proveedorId,
                                  cantidad: String(enUnidadFactura(s.sugeridoBase, np.factor) || '').replace('.', ','),
                                },
                              }))
                            }}
                            className="w-full text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white"
                          >
                            {s.proveedores.map((p, i) => (
                              <option key={p.proveedorId} value={p.proveedorId}>
                                {p.razonSocial}
                                {veImportes && p.precioBase !== null ? ` · ${formatCurrency(p.precioBase)}/${s.unidad}` : ''}
                                {i === 0 ? ' · última compra' : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          prov && (
                            <div className="text-xs">
                              <p className="font-medium truncate">{prov.razonSocial}</p>
                              <p className="text-slate-400 truncate">
                                {veImportes && prov.precioBase !== null && `${formatCurrency(prov.precioBase)}/${s.unidad} · `}
                                {fmtFecha(prov.ultimaFecha)}
                                {s.proveedores.length > 1 && ` · +${s.proveedores.length - 1} proveedor${s.proveedores.length > 2 ? 'es' : ''}`}
                              </p>
                            </div>
                          )
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {e ? (
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              inputMode="decimal"
                              value={e.cantidad}
                              onChange={(ev) => setEleccion((prev) => ({ ...prev, [s.insumoId]: { ...e, cantidad: ev.target.value } }))}
                              className="w-20 h-8 text-right tabular-nums"
                            />
                            <span className="text-[11px] text-slate-400 w-12 text-left leading-tight">
                              {prov && prov.factor !== 1 ? `× ${n(prov.factor, 3)} ${s.unidad}` : s.unidad}
                            </span>
                          </div>
                        ) : s.sugeridoBase > 0 ? (
                          <span className="tabular-nums text-slate-600">
                            {n(s.sugeridoBase)} {s.unidad}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pedido armado + en camino */}
        <div className="space-y-4 xl:sticky xl:top-4">
          <div className="bg-white border rounded-lg">
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <ShoppingBasket className="h-4 w-4 text-slate-500" />
              <h3 className="font-medium text-slate-900">Pedido</h3>
              {grupos.length > 0 && <span className="text-xs text-slate-400 ml-auto">Tecla W: WhatsApp del primero</span>}
            </div>
            {grupos.length === 0 ? (
              <p className="p-4 text-sm text-slate-400">Tildá insumos para armar el pedido. Se agrupan por proveedor.</p>
            ) : (
              <div className="divide-y">
                {grupos.map((g, gi) => {
                  const total = g.lineas.reduce((t, l) => t + (l.precioUnitario ?? 0) * l.cantidad, 0)
                  return (
                    <div key={g.proveedorId} className={`p-4 space-y-2 ${gi === 0 ? 'bg-emerald-50/40' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{g.razonSocial}</p>
                          <p className="text-xs text-slate-400">
                            {g.telefono ? `${g.contacto ? `${g.contacto} · ` : ''}${g.telefono}` : 'Sin teléfono de pedidos'}
                            {g.diasEntrega !== null && ` · entrega ${g.diasEntrega === 0 ? 'en el día' : `${g.diasEntrega} d`}`}
                          </p>
                        </div>
                      </div>
                      <ul className="text-sm space-y-0.5">
                        {g.lineas.map((l) => (
                          <li key={l.insumoId} className="flex items-center gap-2">
                            <span className="tabular-nums text-slate-500 w-12 text-right shrink-0">{n(l.cantidad, 2)} ×</span>
                            <span className="truncate flex-1" title={l.descripcion}>
                              {l.descripcion}
                            </span>
                            <button
                              type="button"
                              className="text-slate-300 hover:text-red-600"
                              onClick={() =>
                                setEleccion((prev) => {
                                  const next = { ...prev }
                                  delete next[l.insumoId]
                                  return next
                                })
                              }
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                      {veImportes && total > 0 && (
                        <p className="text-xs text-slate-500 text-right">Estimado {formatCurrency(total)} + IVA (último precio)</p>
                      )}
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => enviarGrupo(g, false)} className="gap-1">
                          <Copy className="h-3.5 w-3.5" /> Copiar
                        </Button>
                        <Button size="sm" onClick={() => enviarGrupo(g, true)} disabled={enviando === g.proveedorId} className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                          {enviando === g.proveedorId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                          WhatsApp{gi === 0 ? ' (W)' : ''}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="bg-white border rounded-lg">
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <Truck className="h-4 w-4 text-slate-500" />
              <h3 className="font-medium text-slate-900">En camino</h3>
              <span className="text-xs text-slate-400">({enCamino.length})</span>
            </div>
            {enCamino.length === 0 ? (
              <p className="p-4 text-sm text-slate-400">No hay pedidos a proveedores pendientes de entrega.</p>
            ) : (
              <ul className="divide-y">
                {enCamino.map((p) => (
                  <li key={p.id} className="p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium truncate">{p.proveedor}</p>
                      <span className="text-xs text-slate-400 shrink-0 inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {fmtFecha(p.fechaEsperada ?? p.fecha)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{p.items.map((it) => `${n(it.cantidad, 2)} × ${it.descripcion}`).join(' · ')}</p>
                    {edita && (
                      <div className="flex gap-2 mt-1">
                        <button type="button" className="text-xs text-emerald-700 hover:underline" onClick={() => cambiarEstadoPedido(p.id, 'recibido')}>
                          Marcar recibido
                        </button>
                        <button type="button" className="text-xs text-slate-400 hover:text-red-600 hover:underline" onClick={() => cambiarEstadoPedido(p.id, 'cancelado')}>
                          Cancelar
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="px-4 pb-3 text-[11px] text-slate-400">Se dan por recibidos solos al cargarse una factura del proveedor.</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

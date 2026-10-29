'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Clock, MessageCircle, ShoppingBasket, Truck } from 'lucide-react'
import { Titulo } from '../shell'
import { Card, Kpi, Tabs, pesos } from '../ui'

type Estado = 'pedir' | 'pronto' | 'ok'

const INSUMOS: Array<{ id: string; nombre: string; u: string; stock: number; seguro: number; dia: number; prov: string; precio: number; sugerido: number; estado: Estado; entrega: string }> = [
  { id: 'h', nombre: 'Harina 0000 × 25 kg', u: 'bolsas', stock: 3, seguro: 4, dia: 1.4, prov: 'Mayorista del Valle', precio: 26225, sugerido: 8, estado: 'pedir', entrega: 'En el día' },
  { id: 'a', nombre: 'Aceite de girasol 5 L', u: 'bidones', stock: 5, seguro: 6, dia: 1.8, prov: 'Mayorista del Valle', precio: 21740, sugerido: 10, estado: 'pedir', entrega: 'En el día' },
  { id: 'l', nombre: 'Lomo', u: 'kg', stock: 9.5, seguro: 8, dia: 3.5, prov: 'Frigorífico Patagonia', precio: 32760, sugerido: 18, estado: 'pedir', entrega: '1 día' },
  { id: 'c', nombre: 'Crema de leche 5 L', u: 'baldes', stock: 4, seguro: 2, dia: 0.6, prov: 'Lácteos del Sur', precio: 42525, sugerido: 4, estado: 'pronto', entrega: '2 días' },
  { id: 't', nombre: 'Trucha desespinada', u: 'kg', stock: 14, seguro: 8, dia: 2.2, prov: 'Pescadería Austral', precio: 22840, sugerido: 12, estado: 'pronto', entrega: '3 días' },
  { id: 'v', nombre: 'Malbec Reserva', u: 'botellas', stock: 46, seguro: 24, dia: 3.1, prov: 'Bodega Los Andes', precio: 18900, sugerido: 0, estado: 'ok', entrega: '2 días' },
]

const ESTADO = {
  pedir: { t: 'Pedir ya', c: 'pt-chip pt-chip-rojo' },
  pronto: { t: 'Pedir pronto', c: 'pt-chip pt-chip-ambar' },
  ok: { t: 'OK', c: 'pt-chip pt-chip-verde' },
}

export function PantallaCompras() {
  const [filtro, setFiltro] = useState('alertas')
  const [sel, setSel] = useState<Set<string>>(new Set(['h', 'a']))

  const filas = INSUMOS.filter((i) => (filtro === 'alertas' ? i.estado !== 'ok' : filtro === 'todos' ? true : i.estado === filtro))
  const grupos = useMemo(() => {
    const m = new Map<string, typeof INSUMOS>()
    for (const i of INSUMOS) if (sel.has(i.id)) m.set(i.prov, [...(m.get(i.prov) ?? []), i])
    return [...m.entries()]
  }, [sel])

  return (
    <>
      <Titulo escena="stock" titulo="Compras sugeridas" bajada="Qué pedir según el stock del depósito central, lo que venís vendiendo y cuánto tarda cada proveedor." />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Kpi etiqueta="Pedir ya" valor="3" tono="rojo" nota="En o bajo el stock seguro" icono={AlertTriangle} />
        <Kpi etiqueta="Pedir pronto" valor="2" tono="ambar" nota="Llegarían justo con la entrega" icono={Clock} />
        <Kpi etiqueta="En camino" valor="2" nota="Pedidos sin factura todavía" icono={Truck} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem] items-start">
        <div>
          <div className="mb-4">
            <Tabs
              activa={filtro}
              onCambiar={setFiltro}
              opciones={[
                { v: 'alertas', t: 'Alertas', n: 5 },
                { v: 'pedir', t: 'Pedir ya', n: 3 },
                { v: 'pronto', t: 'Pronto', n: 2 },
                { v: 'todos', t: 'Todos' },
              ]}
            />
          </div>
          <Card sinPadding>
            <div className="overflow-x-auto">
              <table className="pt-tabla min-w-[46rem]">
                <thead>
                  <tr>
                    <th className="w-10" />
                    <th>Insumo</th>
                    <th>Stock</th>
                    <th className="text-right">Alcanza</th>
                    <th>Proveedor</th>
                    <th className="text-right">Pedir</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((i) => {
                    const dias = i.stock / i.dia
                    const pct = Math.min(100, (i.stock / (i.seguro * 2.2)) * 100)
                    const c1 = i.estado === 'pedir' ? '#f87171' : i.estado === 'pronto' ? '#f5a524' : '#34d399'
                    return (
                      <tr key={i.id} className={sel.has(i.id) ? 'bg-[rgba(59,155,255,0.06)]' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Pedir ${i.nombre}`}
                            checked={sel.has(i.id)}
                            disabled={i.estado === 'ok'}
                            onChange={() =>
                              setSel((s) => {
                                const n = new Set(s)
                                if (n.has(i.id)) n.delete(i.id)
                                else n.add(i.id)
                                return n
                              })
                            }
                            className="h-4 w-4 accent-[#3b9bff]"
                          />
                        </td>
                        <td>
                          <p className="font-medium">{i.nombre}</p>
                          <span className={ESTADO[i.estado].c}>{ESTADO[i.estado].t}</span>
                        </td>
                        <td>
                          <div className="w-32">
                            <p className="text-xs text-[var(--sec)] pt-num mb-1.5">
                              {i.stock.toLocaleString('es-AR')} {i.u} <span className="text-[var(--ter)]">/ mín. {i.seguro}</span>
                            </p>
                            <div className="pt-barra" style={{ '--c1': c1 } as React.CSSProperties}>
                              <i style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className={`text-right pt-num ${dias <= 3 ? 'text-[var(--rojo-t)] font-medium' : 'text-[var(--sec)]'}`}>
                          {dias.toLocaleString('es-AR', { maximumFractionDigits: 0 })} días
                        </td>
                        <td>
                          <p className="text-sm">{i.prov}</p>
                          <p className="text-xs text-[var(--ter)] pt-num">
                            {pesos(i.precio)}, entrega {i.entrega.toLowerCase()}
                          </p>
                        </td>
                        <td className="text-right pt-num">{i.sugerido ? `${i.sugerido} ${i.u}` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <aside className="xl:sticky xl:top-24 space-y-4">
          <Card titulo="Tu pedido" accion={<ShoppingBasket className="h-4 w-4 text-[var(--ter)]" />}>
            {grupos.length === 0 ? (
              <p className="text-sm text-[var(--sec)]">Tildá insumos para armar el pedido. Se agrupan por proveedor.</p>
            ) : (
              <div className="space-y-5">
                {grupos.map(([prov, items]) => (
                  <div key={prov}>
                    <p className="text-sm font-medium">{prov}</p>
                    <ul className="mt-2 space-y-1 text-sm text-[var(--sec)]">
                      {items.map((i) => (
                        <li key={i.id} className="flex justify-between gap-3">
                          <span className="truncate">{i.nombre}</span>
                          <span className="pt-num text-[var(--texto)]">× {i.sugerido}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-[var(--ter)] pt-num">
                      Estimado {pesos(items.reduce((s, i) => s + i.precio * i.sugerido, 0))} + IVA
                    </p>
                    <button
                      type="button"
                      className="pt-boton mt-3 w-full text-white bg-gradient-to-b from-[#16a34a] to-[#11883f] shadow-[0_10px_30px_-12px_rgba(37,211,102,0.6)]"
                    >
                      <MessageCircle className="h-4 w-4" /> Mandar por WhatsApp
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card titulo="En camino">
            <ul className="space-y-3 text-sm">
              {[
                ['Frigorífico Patagonia', 'Llega mañana'],
                ['Lácteos del Sur', 'Llega el viernes'],
              ].map(([p, c]) => (
                <li key={p} className="flex items-center justify-between gap-3">
                  <span>{p}</span>
                  <span className="pt-chip pt-chip-azul">{c}</span>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </>
  )
}

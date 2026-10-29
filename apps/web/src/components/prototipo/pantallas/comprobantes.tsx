'use client'

import { useMemo, useState } from 'react'
import { Download, Filter, Mail, MessageCircle, Search, UploadCloud } from 'lucide-react'
import { Titulo } from '../shell'
import { Card, Inicial, Tabs, pesos } from '../ui'

type Estado = 'Para revisar' | 'Confirmada' | 'Pagada' | 'Con error'

const FACTURAS: Array<{ prov: string; tipo: string; nro: string; fecha: string; total: number; confianza: number; estado: Estado; canal: 'mail' | 'whatsapp' | 'escaner' }> = [
  { prov: 'Mayorista del Valle', tipo: 'Factura A', nro: '0012-00004871', fecha: '08/10/2026', total: 391346, confianza: 71, estado: 'Para revisar', canal: 'mail' },
  { prov: 'Lácteos del Sur', tipo: 'Factura A', nro: '0003-00018254', fecha: '08/10/2026', total: 218673, confianza: 98, estado: 'Confirmada', canal: 'whatsapp' },
  { prov: 'Ropa de Trabajo SRL', tipo: 'Factura A', nro: '0002-00000415', fecha: '08/10/2026', total: 161000, confianza: 64, estado: 'Para revisar', canal: 'escaner' },
  { prov: 'Frigorífico Patagonia', tipo: 'Factura A', nro: '0026-00018883', fecha: '07/10/2026', total: 1240880, confianza: 97, estado: 'Confirmada', canal: 'mail' },
  { prov: 'Panificadora Centro', tipo: 'Factura A', nro: '0007-00002931', fecha: '07/10/2026', total: 84200, confianza: 99, estado: 'Pagada', canal: 'whatsapp' },
  { prov: 'Bodega Los Andes', tipo: 'Factura A', nro: '0175-00003112', fecha: '06/10/2026', total: 642500, confianza: 96, estado: 'Pagada', canal: 'mail' },
  { prov: 'Pescadería Austral', tipo: 'Nota de crédito', nro: '0021-00002508', fecha: '06/10/2026', total: -5650.3, confianza: 93, estado: 'Confirmada', canal: 'mail' },
  { prov: 'Distribuidora Andina', tipo: 'Factura A', nro: '4352-00017547', fecha: '05/10/2026', total: 1068520, confianza: 58, estado: 'Para revisar', canal: 'escaner' },
  { prov: 'Limpieza Total', tipo: 'Factura B', nro: '0001-00006791', fecha: '05/10/2026', total: 12800, confianza: 41, estado: 'Con error', canal: 'whatsapp' },
  { prov: 'Verdulería El Huerto', tipo: 'Factura A', nro: '0004-00000622', fecha: '04/10/2026', total: 47231, confianza: 95, estado: 'Pagada', canal: 'whatsapp' },
]

const CHIP: Record<Estado, string> = {
  'Para revisar': 'pt-chip pt-chip-ambar',
  Confirmada: 'pt-chip pt-chip-azul',
  Pagada: 'pt-chip pt-chip-verde',
  'Con error': 'pt-chip pt-chip-rojo',
}

const CANAL = { mail: Mail, whatsapp: MessageCircle, escaner: UploadCloud }

export function PantallaComprobantes() {
  const [filtro, setFiltro] = useState('todos')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())

  const filas = useMemo(
    () =>
      FACTURAS.filter((f) =>
        filtro === 'todos' ? true : filtro === 'revisar' ? f.estado === 'Para revisar' : filtro === 'confirmadas' ? f.estado === 'Confirmada' : filtro === 'pagadas' ? f.estado === 'Pagada' : f.estado === 'Con error'
      ).filter((f) => !q || `${f.prov} ${f.nro}`.toLowerCase().includes(q.toLowerCase())),
    [filtro, q]
  )
  const cuenta = (e: Estado) => FACTURAS.filter((f) => f.estado === e).length

  return (
    <>
      <Titulo
        escena="comprobantes"
        titulo="Comprobantes"
        bajada="Todas las facturas que te mandan tus proveedores, leídas y ordenadas."
        acciones={
          <button type="button" className="pt-boton pt-boton-sec">
            <Download className="h-4 w-4" /> Exportar
          </button>
        }
      />

      <div className="pt-entra mb-5 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="flex items-center gap-4 rounded-2xl border border-dashed border-[rgba(124,196,255,0.35)] bg-[rgba(59,155,255,0.05)] px-5 py-4">
          <span className="pt-icono">
            <UploadCloud className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">Arrastrá facturas acá o reenviálas a facturas@tuempresa.axp.com.ar</p>
            <p className="text-xs text-[var(--sec)]">PDF o foto. AXP las lee solas y te avisa si algo no está claro.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--borde)] bg-[var(--pizarra)] px-5 py-4 text-sm">
          <span className="text-[var(--sec)]">Leídas sin tocar este mes</span>
          <span className="pt-display text-2xl font-semibold pt-num">96 %</span>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          activa={filtro}
          onCambiar={setFiltro}
          opciones={[
            { v: 'todos', t: 'Todos', n: FACTURAS.length },
            { v: 'revisar', t: 'Para revisar', n: cuenta('Para revisar') },
            { v: 'confirmadas', t: 'Confirmadas', n: cuenta('Confirmada') },
            { v: 'pagadas', t: 'Pagadas', n: cuenta('Pagada') },
            { v: 'error', t: 'Con error', n: cuenta('Con error') },
          ]}
        />
        <label className="pt-buscador ml-auto w-full sm:w-72">
          <Search className="h-4 w-4" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Proveedor o número"
            className="flex-1 bg-transparent text-[var(--texto)] placeholder:text-[var(--ter)] outline-none"
          />
        </label>
        <button type="button" className="pt-boton pt-boton-sec">
          <Filter className="h-4 w-4" /> Filtros
        </button>
      </div>

      {sel.size > 0 && (
        <div className="pt-entra mb-4 flex items-center gap-3 rounded-xl border border-[rgba(124,196,255,0.3)] bg-[rgba(59,155,255,0.08)] px-4 py-2.5 text-sm">
          <span>{sel.size} seleccionadas</span>
          <button type="button" className="pt-boton pt-boton-primario h-8 ml-auto">
            Confirmar
          </button>
          <button type="button" className="pt-boton pt-boton-sec h-8">
            Armar orden de pago
          </button>
        </div>
      )}

      <Card sinPadding>
        <div className="overflow-x-auto">
          <table className="pt-tabla min-w-[52rem]">
            <thead>
              <tr>
                <th className="w-10" />
                <th>Proveedor</th>
                <th>Fecha</th>
                <th>Leída con</th>
                <th className="text-right">Total</th>
                <th className="text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const Canal = CANAL[f.canal]
                const marcada = sel.has(f.nro)
                return (
                  <tr key={f.nro} className={marcada ? 'bg-[rgba(59,155,255,0.06)]' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${f.prov}`}
                        checked={marcada}
                        onChange={() =>
                          setSel((s) => {
                            const n = new Set(s)
                            if (n.has(f.nro)) n.delete(f.nro)
                            else n.add(f.nro)
                            return n
                          })
                        }
                        className="h-4 w-4 accent-[#3b9bff]"
                      />
                    </td>
                    <td>
                      <div className="flex items-center gap-3">
                        <Inicial nombre={f.prov} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{f.prov}</p>
                          <p className="text-xs text-[var(--ter)] pt-num">
                            {f.tipo} {f.nro}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="text-[var(--sec)] pt-num">
                      <span className="inline-flex items-center gap-2">
                        <Canal className="h-3.5 w-3.5 text-[var(--ter)]" />
                        {f.fecha}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2.5 w-36">
                        <div className="pt-barra flex-1" style={{ '--c1': f.confianza >= 90 ? '#34d399' : f.confianza >= 60 ? '#f5a524' : '#f87171' } as React.CSSProperties}>
                          <i style={{ width: `${f.confianza}%` }} />
                        </div>
                        <span className="text-xs text-[var(--sec)] pt-num w-9 text-right">{f.confianza} %</span>
                      </div>
                    </td>
                    <td className={`text-right font-medium pt-num ${f.total < 0 ? 'text-[var(--verde)]' : ''}`}>{pesos(f.total, f.total % 1 ? 2 : 0)}</td>
                    <td className="text-right">
                      <span className={CHIP[f.estado]}>{f.estado}</span>
                    </td>
                  </tr>
                )
              })}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[var(--ter)]">
                    No hay comprobantes con ese filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

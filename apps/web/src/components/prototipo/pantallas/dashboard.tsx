'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  FileText,
  Receipt,
  ScanLine,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Titulo, ruta } from '../shell'
import { Area, Dona } from '../graficos'
import { Aviso, Card, Inicial, Kpi, Tabs, pesos } from '../ui'

const dias30 = Array.from({ length: 30 }, (_, i) => `${((i + 8) % 30) + 1}/${i < 22 ? '09' : '10'}`)
const facturasDia = [8, 11, 6, 9, 14, 3, 2, 12, 10, 9, 13, 15, 4, 2, 11, 12, 8, 10, 16, 5, 3, 13, 9, 11, 14, 12, 4, 3, 10, 12]
const meses = ['nov', 'dic', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct']
const comprado = [31, 38, 44, 36, 33, 35, 37, 39, 42, 41, 44, 18].map((v) => v * 1_000_000)
const vendido = [52, 66, 81, 70, 58, 60, 63, 66, 74, 71, 76, 29].map((v) => v * 1_000_000)

const ultimos = [
  { prov: 'Mayorista del Valle', nro: 'A 0012-00004871', fecha: '08/10', total: 391346, estado: 'Para revisar' },
  { prov: 'Lácteos del Sur', nro: 'A 0003-00018254', fecha: '08/10', total: 218673, estado: 'Confirmada' },
  { prov: 'Frigorífico Patagonia', nro: 'A 0026-00018883', fecha: '07/10', total: 1240880, estado: 'Confirmada' },
  { prov: 'Panificadora Centro', nro: 'A 0007-00002931', fecha: '07/10', total: 84200, estado: 'Pagada' },
  { prov: 'Bodega Los Andes', nro: 'A 0175-00003112', fecha: '06/10', total: 642500, estado: 'Pagada' },
]

const CHIP: Record<string, string> = {
  'Para revisar': 'pt-chip pt-chip-ambar',
  Confirmada: 'pt-chip pt-chip-azul',
  Pagada: 'pt-chip pt-chip-verde',
  'Con error': 'pt-chip pt-chip-rojo',
}

function Operaciones() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta="Facturas cargadas hoy" valor="12" variacion={9} serie={facturasDia.slice(-12)} icono={ScanLine} />
        <Kpi etiqueta="Para revisar" valor="4" tono="ambar" nota="La IA no está segura de algún dato" icono={AlertTriangle} />
        <Kpi etiqueta="Leídas sin errores" valor="96 %" variacion={3} serie={[88, 90, 91, 89, 93, 94, 95, 96]} tono="verde" icono={BadgeCheck} />
        <Kpi etiqueta="Confirmadas este mes" valor="183" variacion={-4} serie={[160, 172, 181, 190, 176, 183]} icono={FileText} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Card titulo="Facturas por día" accion={<span className="text-xs text-[var(--ter)]">Últimos 30 días</span>}>
          <Area etiquetas={dias30} series={[{ nombre: 'Facturas', valores: facturasDia, color: '#3b9bff' }]} />
        </Card>
        <Card titulo="Estado de los comprobantes">
          <Dona
            centro="1.502"
            bajada="comprobantes"
            partes={[
              { nombre: 'Pagadas', valor: 1403, color: '#34d399' },
              { nombre: 'Confirmadas', valor: 91, color: '#3b9bff' },
              { nombre: 'Para revisar', valor: 4, color: '#f5a524' },
              { nombre: 'Con error', valor: 4, color: '#f87171' },
            ]}
          />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Card
          titulo="Últimos comprobantes"
          sinPadding
          accion={
            <Link href={ruta('/documentos')} className="text-sm text-[var(--azul-2)] hover:underline underline-offset-4">
              Ver todos
            </Link>
          }
        >
          <div className="overflow-x-auto">
            <table className="pt-tabla">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Fecha</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Estado</th>
                </tr>
              </thead>
              <tbody>
                {ultimos.map((f) => (
                  <tr key={f.nro}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Inicial nombre={f.prov} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{f.prov}</p>
                          <p className="text-xs text-[var(--ter)] pt-num">Factura {f.nro}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-[var(--sec)] pt-num">{f.fecha}</td>
                    <td className="text-right font-medium pt-num">{pesos(f.total)}</td>
                    <td className="text-right">
                      <span className={CHIP[f.estado]}>{f.estado}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card titulo="Más comprado este mes">
          <ul className="space-y-4">
            {[
              ['Frigorífico Patagonia', 8.42, 100],
              ['Mayorista del Valle', 5.18, 62],
              ['Bodega Los Andes', 3.06, 36],
              ['Lácteos del Sur', 2.41, 29],
              ['Pescadería Austral', 1.97, 23],
            ].map(([p, m, w]) => (
              <li key={p as string}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="truncate">{p}</span>
                  <span className="pt-num text-[var(--sec)]">$ {(m as number).toLocaleString('es-AR')} M</span>
                </div>
                <div className="pt-barra">
                  <i style={{ width: `${w}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

function Finanzas() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta="Para pagar" valor={pesos(12_480_300)} nota="91 facturas confirmadas" icono={Wallet} />
        <Kpi etiqueta="Vence esta semana" valor={pesos(4_206_800)} tono="ambar" nota="2 eCheq y 6 transferencias" icono={CalendarClock} />
        <Kpi etiqueta="Pagado en octubre" valor={pesos(18_920_450)} variacion={6} serie={[12, 15, 14, 17, 16, 19]} tono="verde" icono={Receipt} />
        <Kpi etiqueta="Vendido en octubre" valor={pesos(29_480_000)} variacion={4} serie={[22, 24, 23, 27, 26, 29]} icono={ShoppingCart} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Card
          titulo="Comprado contra vendido"
          accion={
            <span className="flex items-center gap-4 text-xs text-[var(--sec)]">
              <span className="flex items-center gap-1.5">
                <i className="h-2 w-2 rounded-full bg-[#3b9bff]" /> Vendido
              </span>
              <span className="flex items-center gap-1.5">
                <i className="h-2 w-2 rounded-full bg-[#f5a524]" /> Comprado
              </span>
            </span>
          }
        >
          <Area
            etiquetas={meses}
            formato={(n) => `$ ${(n / 1_000_000).toLocaleString('es-AR')} M`}
            series={[
              { nombre: 'Vendido', valores: vendido, color: '#3b9bff' },
              { nombre: 'Comprado', valores: comprado, color: '#f5a524' },
            ]}
          />
        </Card>
        <Card titulo="¿En qué se va la plata?">
          <Dona
            centro="$ 44 M"
            bajada="en septiembre"
            partes={[
              { nombre: 'Carnes', valor: 41, color: '#f87171' },
              { nombre: 'Pescados', valor: 17, color: '#22d3ee' },
              { nombre: 'Almacén', valor: 9, color: '#f5a524' },
              { nombre: 'Lácteos', valor: 8, color: '#a78bfa' },
              { nombre: 'Otros', valor: 25, color: '#3b9bff' },
            ]}
          />
        </Card>
      </div>
      <Card titulo="A quién le debés más" sinPadding>
        <div className="overflow-x-auto">
          <table className="pt-tabla">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th className="text-right">Facturas</th>
                <th className="text-right">Vence primero</th>
                <th className="text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Frigorífico Patagonia', 6, '10/10', 3_840_200],
                ['Bodega Los Andes', 4, '12/10', 2_166_000],
                ['Mayorista del Valle', 9, '09/10', 1_904_870],
                ['Pescadería Austral', 3, '15/10', 1_210_400],
              ].map(([p, n, v, s]) => (
                <tr key={p as string}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Inicial nombre={p as string} />
                      <span className="font-medium">{p}</span>
                    </div>
                  </td>
                  <td className="text-right text-[var(--sec)] pt-num">{n}</td>
                  <td className="text-right text-[var(--sec)] pt-num">{v}</td>
                  <td className="text-right font-medium pt-num">{pesos(s as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function Compras() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi etiqueta="Comprado en octubre" valor={pesos(18_420_300)} variacion={-8} bueno="baja" serie={[40, 44, 41, 45, 43, 18]} tono="ambar" icono={ShoppingCart} />
        <Kpi etiqueta="Artículos comprados" valor="214" nota="En 38 proveedores" icono={FileText} />
        <Kpi etiqueta="Aumentos de precio" valor="7" tono="rojo" nota="Más de 5 % en el mes" icono={TrendingUp} />
      </div>
      <Card titulo="Lo que más subió este mes" sinPadding>
        <div className="overflow-x-auto">
          <table className="pt-tabla">
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Proveedor</th>
                <th className="text-right">Antes</th>
                <th className="text-right">Ahora</th>
                <th className="text-right">Cambio</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Aceite de girasol 5 L', 'Mayorista del Valle', 18420, 21740],
                ['Crema de leche 5 L', 'Lácteos del Sur', 38300, 42525],
                ['Trucha desespinada kg', 'Pescadería Austral', 21300, 22840],
                ['Harina 0000 × 25 kg', 'Mayorista del Valle', 24750, 26225],
              ].map(([a, p, antes, ahora]) => {
                const v = (((ahora as number) - (antes as number)) / (antes as number)) * 100
                return (
                  <tr key={a as string}>
                    <td className="font-medium">{a}</td>
                    <td className="text-[var(--sec)]">{p}</td>
                    <td className="text-right text-[var(--sec)] pt-num">{pesos(antes as number)}</td>
                    <td className="text-right pt-num">{pesos(ahora as number)}</td>
                    <td className="text-right">
                      <span className="pt-chip pt-chip-ambar pt-num">+{v.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

export function PantallaDashboard() {
  const [tab, setTab] = useState('operaciones')
  return (
    <>
      <Titulo
        escena="inicio"
        titulo="Hola, Cristian"
        bajada="Miércoles 8 de octubre. Esto es lo que pasó en tu negocio."
        acciones={
          <Tabs
            activa={tab}
            onCambiar={setTab}
            opciones={[
              { v: 'operaciones', t: 'Operaciones' },
              { v: 'finanzas', t: 'Finanzas' },
              { v: 'compras', t: 'Compras' },
            ]}
          />
        }
      />
      <Aviso
        icono={CalendarClock}
        titulo="Mañana vence un eCheq de $ 7.000.000"
        texto="Distribuidora Lucero. Asegurate de tener saldo en la cuenta."
        accion={
          <Link href={ruta('/finanzas')} className="pt-boton pt-boton-sec">
            Ver calendario
          </Link>
        }
      />
      <div key={tab}>{tab === 'operaciones' ? <Operaciones /> : tab === 'finanzas' ? <Finanzas /> : <Compras />}</div>
    </>
  )
}

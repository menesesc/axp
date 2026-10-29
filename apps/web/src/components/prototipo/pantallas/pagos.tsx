'use client';

import { useState } from 'react';
import {
  CalendarClock,
  Download,
  FileSpreadsheet,
  Plus,
  Receipt,
  Send,
  Wallet,
} from 'lucide-react';
import { Titulo } from '../shell';
import { Card, Inicial, Kpi, Tabs, pesos } from '../ui';

type Estado = 'Borrador' | 'Emitida' | 'Pagada';
const ORDENES: Array<{
  op: string;
  prov: string;
  fecha: string;
  forma: 'Transferencia' | 'eCheq' | 'Cheque';
  docs: number;
  monto: number;
  estado: Estado;
}> = [
  {
    op: '000352',
    prov: 'Frigorífico Patagonia',
    fecha: '08/10',
    forma: 'Transferencia',
    docs: 4,
    monto: 3_840_200,
    estado: 'Borrador',
  },
  {
    op: '000351',
    prov: 'Bodega Los Andes',
    fecha: '08/10',
    forma: 'eCheq',
    docs: 3,
    monto: 2_166_000,
    estado: 'Emitida',
  },
  {
    op: '000350',
    prov: 'Mayorista del Valle',
    fecha: '07/10',
    forma: 'Transferencia',
    docs: 9,
    monto: 1_904_870,
    estado: 'Emitida',
  },
  {
    op: '000349',
    prov: 'Lácteos del Sur',
    fecha: '07/10',
    forma: 'Transferencia',
    docs: 2,
    monto: 629_986,
    estado: 'Pagada',
  },
  {
    op: '000348',
    prov: 'Pescadería Austral',
    fecha: '06/10',
    forma: 'Cheque',
    docs: 3,
    monto: 1_210_400,
    estado: 'Pagada',
  },
  {
    op: '000347',
    prov: 'Panificadora Centro',
    fecha: '06/10',
    forma: 'Transferencia',
    docs: 1,
    monto: 84_200,
    estado: 'Pagada',
  },
];
const CHIP: Record<Estado, string> = {
  Borrador: 'pt-chip pt-chip-gris',
  Emitida: 'pt-chip pt-chip-azul',
  Pagada: 'pt-chip pt-chip-verde',
};
const FORMA = {
  Transferencia: 'pt-chip pt-chip-gris',
  eCheq: 'pt-chip pt-chip-ambar',
  Cheque: 'pt-chip pt-chip-ambar',
};

const SEMANA = [
  { d: 'Lun 6', items: [] as string[] },
  { d: 'Mar 7', items: ['Transf. $ 2,5 M'] },
  { d: 'Mié 8', items: [] },
  { d: 'Jue 9', items: ['eCheq $ 7 M'] },
  { d: 'Vie 10', items: ['Lote Galicia $ 4,2 M', 'Cheque $ 1,2 M'] },
  { d: 'Sáb 11', items: [] },
  { d: 'Dom 12', items: [] },
];

export function PantallaPagos() {
  const [tab, setTab] = useState('ordenes');
  const [filtro, setFiltro] = useState('todas');
  const filas = ORDENES.filter((o) => filtro === 'todas' || o.estado.toLowerCase() === filtro);

  return (
    <>
      <Titulo
        escena="pagos"
        titulo="Pagos"
        bajada="Órdenes de pago, cheques, eCheq y transferencias en lote para el banco."
        acciones={
          <>
            <button type="button" className="pt-boton pt-boton-sec">
              <FileSpreadsheet className="h-4 w-4" /> Pagar en lote
            </button>
            <button type="button" className="pt-boton pt-boton-primario">
              <Plus className="h-4 w-4" /> Nueva orden
            </button>
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          etiqueta="Para pagar"
          valor={pesos(12_480_300)}
          nota="91 facturas confirmadas"
          icono={Wallet}
        />
        <Kpi
          etiqueta="Esta semana"
          valor={pesos(14_900_000)}
          tono="ambar"
          nota="eCheq, cheque y un lote"
          icono={CalendarClock}
        />
        <Kpi
          etiqueta="A transferir"
          valor="10"
          nota="Borradores listos para el banco"
          icono={Send}
        />
        <Kpi
          etiqueta="Pagado en octubre"
          valor={pesos(18_920_450)}
          variacion={6}
          serie={[12, 15, 14, 17, 16, 19]}
          tono="verde"
          icono={Receipt}
        />
      </div>

      <Card titulo="Esta semana" className="mb-5">
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="grid min-w-[40rem] grid-cols-7 gap-2">
            {SEMANA.map((s) => (
              <div
                key={s.d}
                className={`min-h-[6.5rem] rounded-xl border p-2.5 ${
                  s.d === 'Mié 8'
                    ? 'border-[rgba(124,196,255,0.45)] bg-[rgba(59,155,255,0.07)]'
                    : 'border-[var(--borde)] bg-slate-900/[0.035]'
                }`}
              >
                <p
                  className={`text-xs ${s.d === 'Mié 8' ? 'text-[var(--azul-2)] font-medium' : 'text-[var(--ter)]'}`}
                >
                  {s.d}
                </p>
                <div className="mt-2 space-y-1.5">
                  {s.items.map((i) => (
                    <p
                      key={i}
                      className={`rounded-md px-1.5 py-1 text-[11px] leading-tight ${
                        i.startsWith('eCheq') || i.startsWith('Cheque')
                          ? 'bg-[rgba(245,165,36,0.15)] text-[var(--ambar-2)]'
                          : 'bg-[rgba(59,155,255,0.14)] text-[var(--azul-2)]'
                      }`}
                    >
                      {i}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          activa={tab}
          onCambiar={setTab}
          opciones={[
            { v: 'ordenes', t: 'Órdenes' },
            { v: 'transferir', t: 'A transferir', n: 10 },
            { v: 'lotes', t: 'Lotes' },
          ]}
        />
        {tab === 'ordenes' && (
          <div className="ml-auto">
            <Tabs
              activa={filtro}
              onCambiar={setFiltro}
              opciones={[
                { v: 'todas', t: 'Todas' },
                { v: 'borrador', t: 'Borrador' },
                { v: 'emitida', t: 'Emitidas' },
                { v: 'pagada', t: 'Pagadas' },
              ]}
            />
          </div>
        )}
      </div>

      {tab === 'ordenes' ? (
        <Card sinPadding>
          <div className="overflow-x-auto">
            <table className="pt-tabla min-w-[46rem]">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Proveedor</th>
                  <th>Forma de pago</th>
                  <th className="text-right">Monto</th>
                  <th className="text-right">Estado</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {filas.map((o) => (
                  <tr key={o.op}>
                    <td>
                      <p className="pt-num font-medium">OP {o.op}</p>
                      <p className="text-xs text-[var(--ter)] pt-num">{o.fecha}</p>
                    </td>
                    <td>
                      <div className="flex items-center gap-3">
                        <Inicial nombre={o.prov} />
                        <div>
                          <p className="font-medium">{o.prov}</p>
                          <p className="text-xs text-[var(--ter)]">
                            {o.docs} {o.docs === 1 ? 'factura' : 'facturas'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={FORMA[o.forma]}>{o.forma}</span>
                    </td>
                    <td className="text-right font-medium pt-num">{pesos(o.monto)}</td>
                    <td className="text-right">
                      <span className={CHIP[o.estado]}>{o.estado}</span>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="text-[var(--ter)] hover:text-[var(--texto)]"
                        aria-label={`Descargar OP ${o.op}`}
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-[var(--sec)]">
            Esta pestaña usaría el mismo estilo que Órdenes. En el prototipo está diseñada esa.
          </p>
        </Card>
      )}
    </>
  );
}

'use client'

import { useRef } from 'react'
import { BellRing, Check, ScanLine } from 'lucide-react'

/**
 * El momento central de la landing: una factura de proveedor que AXP "lee"
 * sola. Una barra la recorre, cada dato se marca en orden, aparece la tarjeta
 * con lo leído y al final la alerta del aumento. Corre una sola vez al cargar.
 * La escena se inclina siguiendo el mouse.
 */

const renglones = [
  { desc: 'Aceite de girasol 5 L', cant: '6', precio: '$ 21.740', total: '$ 130.440', aumento: true },
  { desc: 'Harina 0000 × 25 kg', cant: '4', precio: '$ 26.225', total: '$ 104.900' },
  { desc: 'Tomate perita × 3 kg', cant: '8', precio: '$ 5.944', total: '$ 47.552' },
  { desc: 'Leche entera 1 L', cant: '24', precio: '$ 1.652', total: '$ 39.648' },
]

const leidos = ['Proveedor', 'Número y fecha', '4 artículos', 'Total con IVA']

export function EscenaFactura() {
  const ref = useRef<HTMLDivElement>(null)

  const mover = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el || e.pointerType !== 'mouse') return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--ry', `${x * 7}deg`)
    el.style.setProperty('--rx', `${-y * 5}deg`)
  }
  const soltar = () => {
    ref.current?.style.setProperty('--ry', '0deg')
    ref.current?.style.setProperty('--rx', '0deg')
  }

  return (
    <div className="relative mx-auto w-full max-w-[34rem] lx-entra lx-entra-3" onPointerMove={mover} onPointerLeave={soltar}>
      <div className="lx-halo" aria-hidden />
      <div ref={ref} className="lx-inclinable relative pb-16 pt-6 sm:pl-10">
        {/* La factura */}
        <div className="lx-papel w-[88%] sm:w-[84%] p-5 sm:p-6 text-[13px]" aria-hidden>
          <div className="lx-escaneo" />
          <div className="flex items-start justify-between gap-3">
            <div className="lx-dato px-1.5 py-1 -m-1.5" style={{ '--d': '1.05s' } as React.CSSProperties}>
              <p className="font-semibold text-[15px] leading-tight">Distribuidora Norte</p>
              <p className="text-slate-500 text-[11px]">Mayorista en alimentos</p>
            </div>
            <div className="text-right">
              <div className="inline-grid place-items-center w-8 h-8 border border-slate-300 rounded font-bold text-lg leading-none">A</div>
            </div>
            <div className="lx-dato text-right px-1.5 py-1 -m-1.5" style={{ '--d': '1.25s' } as React.CSSProperties}>
              <p className="font-semibold tabular-nums">0004-00012873</p>
              <p className="text-slate-500 text-[11px] tabular-nums">06/10/2026</p>
            </div>
          </div>

          <div className="mt-5 border-t border-slate-200 pt-3">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[10.5px] text-slate-400 pb-1.5">
              <span>Detalle</span>
              <span className="text-right">Cant.</span>
              <span className="text-right w-[4.8rem]">Importe</span>
            </div>
            {renglones.map((r, i) => (
              <div
                key={r.desc}
                className={`lx-dato ${r.aumento ? 'lx-dato-ambar' : ''} grid grid-cols-[1fr_auto_auto] gap-x-3 px-1.5 py-1.5 -mx-1.5 tabular-nums`}
                style={{ '--d': `${1.45 + i * 0.22}s` } as React.CSSProperties}
              >
                <span className="truncate">{r.desc}</span>
                <span className="text-right text-slate-500">{r.cant}</span>
                <span className="text-right w-[4.8rem]">{r.total}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-slate-200 pt-3 flex justify-end">
            <div className="lx-dato px-2 py-1 -m-1 text-right" style={{ '--d': '2.45s' } as React.CSSProperties}>
              <p className="text-[11px] text-slate-500">Total</p>
              <p className="font-semibold text-[17px] tabular-nums">$ 374.265,94</p>
            </div>
          </div>
        </div>

        {/* Lo que AXP leyó */}
        <div
          className="lx-vidrio lx-aparece absolute right-0 top-[22%] w-[13.5rem] p-4"
          style={{ '--d': '2.7s' } as React.CSSProperties}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="grid place-items-center w-7 h-7 rounded-lg bg-[rgba(59,155,255,0.15)] text-[var(--azul-2)]">
              <ScanLine className="h-4 w-4" />
            </span>
            Factura cargada
          </div>
          <ul className="mt-3 space-y-1.5 text-[13px] text-[var(--sec)]">
            {leidos.map((t, i) => (
              <li key={t} className="lx-aparece flex items-center gap-2" style={{ '--d': `${2.95 + i * 0.15}s` } as React.CSSProperties}>
                <Check className="h-3.5 w-3.5 text-[var(--verde)]" strokeWidth={3} />
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-[var(--ter)]">Lista para revisar y pagar.</p>
        </div>

        {/* El aviso */}
        <div className="absolute bottom-0 left-0 sm:left-4 w-[17.5rem] lx-aparece" style={{ '--d': '3.7s' } as React.CSSProperties}>
          <div className="lx-alerta lx-flota p-3.5 flex gap-3">
            <span className="grid place-items-center w-9 h-9 shrink-0 rounded-xl bg-[var(--ambar)] text-[#1c1405]">
              <BellRing className="h-[18px] w-[18px]" />
            </span>
            <div className="text-[13px] leading-snug">
              <p className="font-semibold text-[var(--ambar-2)]">El aceite de girasol subió 18 %</p>
              <p className="text-[var(--sec)] mt-0.5">Lo pagabas $ 18.420 la última vez.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Banknote, CreditCard, Landmark, QrCode, Smartphone, X } from 'lucide-react'

/**
 * El cobro de la mesa.
 *
 * Un consumo se paga de muchas formas a la vez —mitad efectivo, mitad
 * tarjeta— así que se cargan importes por forma y lo que cierra la mesa es
 * que la suma llegue al total. El botón de cada forma la completa con lo que
 * falta, que es lo que pasa el 90% de las veces: una sola forma, el total.
 *
 * El vuelto se calcula solo sobre el efectivo. La propina va aparte: no es
 * parte de la venta, pero el cajero la tiene en la caja y en el arqueo
 * aparece.
 *
 * Todavía no emite factura: eso llega con Factukey y se engancha a este
 * mismo cobro.
 */

const FORMAS = [
  { valor: 'efectivo', nombre: 'Efectivo', icono: Banknote },
  { valor: 'tarjeta_debito', nombre: 'Débito', icono: CreditCard },
  { valor: 'tarjeta_credito', nombre: 'Crédito', icono: CreditCard },
  { valor: 'qr', nombre: 'QR / MP', icono: QrCode },
  { valor: 'transferencia', nombre: 'Transferencia', icono: Landmark },
  { valor: 'otro', nombre: 'Otro', icono: Smartphone },
]

const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

export function Cobro({
  pedidoId,
  titulo,
  total,
  onCerrar,
  onCobrado,
}: {
  pedidoId: string
  titulo: string
  total: number
  onCerrar: () => void
  onCobrado: () => void
}) {
  const [montos, setMontos] = useState<Record<string, string>>({})
  const [propina, setPropina] = useState('')
  const [cobrando, setCobrando] = useState(false)

  const cargado = useMemo(
    () => Object.values(montos).reduce((s, v) => s + (Number(v) || 0), 0),
    [montos]
  )
  const falta = Math.max(0, Math.round(total - cargado))
  const vuelto = Math.max(0, Math.round(cargado - total))

  const completar = (forma: string) =>
    setMontos((m) => ({ ...m, [forma]: String(Math.round(total - (cargado - (Number(m[forma]) || 0)))) }))

  const cobrar = async () => {
    setCobrando(true)
    try {
      const pagos = Object.entries(montos)
        .filter(([, v]) => (Number(v) || 0) > 0)
        .map(([forma, v], i) => ({
          forma,
          importe: Number(v),
          // La propina se cuelga del primer pago: es de la mesa, no de la
          // forma, y así no hay que repartirla.
          propina: i === 0 ? Number(propina) || 0 : 0,
        }))
      const r = await fetch('/api/pos/cobros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidoId, pagos }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo cobrar')
      toast.success(vuelto > 0 ? `Cobrado. Vuelto ${pesos(vuelto)}` : 'Cobrado')
      onCobrado()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCobrando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-lg font-bold">Cobrar {titulo}</p>
            <p className="text-3xl font-bold tabular-nums">{pesos(total)}</p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2">
          {FORMAS.map((f) => (
            <div key={f.valor} className="flex items-center gap-2">
              <button
                onClick={() => completar(f.valor)}
                className="flex h-12 flex-1 items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-semibold text-slate-700 active:scale-[0.99]"
              >
                <f.icono className="h-4 w-4 text-slate-500" />
                {f.nombre}
              </button>
              <input
                value={montos[f.valor] ?? ''}
                onChange={(e) => setMontos((m) => ({ ...m, [f.valor]: e.target.value.replace(/\D/g, '') }))}
                inputMode="numeric"
                placeholder="0"
                className="h-12 w-36 rounded-xl border border-slate-200 px-3 text-right text-lg font-semibold tabular-nums outline-none focus:border-slate-900"
              />
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="flex-1 text-sm text-slate-500">Propina (no va en la factura)</span>
          <input
            value={propina}
            onChange={(e) => setPropina(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="0"
            className="h-11 w-36 rounded-xl border border-slate-200 px-3 text-right text-base tabular-nums outline-none focus:border-slate-900"
          />
        </div>

        <div className="mt-4 flex items-baseline justify-between rounded-xl bg-slate-50 px-3 py-2">
          {falta > 0 ? (
            <>
              <span className="text-sm text-slate-500">Falta</span>
              <span className="text-xl font-bold tabular-nums text-red-600">{pesos(falta)}</span>
            </>
          ) : (
            <>
              <span className="text-sm text-slate-500">Vuelto</span>
              <span className="text-xl font-bold tabular-nums text-emerald-600">{pesos(vuelto)}</span>
            </>
          )}
        </div>

        <button
          onClick={cobrar}
          disabled={cobrando || cargado <= 0 || falta > 1}
          className="mt-4 h-16 w-full rounded-xl bg-emerald-600 text-lg font-semibold text-white disabled:opacity-30 active:scale-[0.99]"
        >
          {cobrando ? 'Cobrando…' : 'Cobrar y cerrar la mesa'}
        </button>
        <p className="mt-2 text-center text-[11px] text-slate-400">
          La factura electrónica se emite en la etapa de Factukey.
        </p>
      </div>
    </div>
  )
}

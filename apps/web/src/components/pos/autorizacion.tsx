'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Delete, ShieldCheck } from 'lucide-react'

/**
 * La llave para lo que el mozo no puede hacer solo.
 *
 * Aparece cuando hay que sacar un plato que la cocina ya vio. El motivo no
 * es burocracia: es lo único que después explica una diferencia entre lo que
 * salió del depósito y lo que se facturó.
 */
export function Autorizacion({
  titulo,
  detalle,
  accion,
  onCancelar,
  onAutorizado,
}: {
  titulo: string
  detalle?: string
  /** La acción de pos_permisos que hay que tener habilitada sin autorización. */
  accion: string
  onCancelar: () => void
  onAutorizado: (usuarioId: string, motivo: string) => void
}) {
  const [pin, setPin] = useState('')
  const [motivo, setMotivo] = useState('')
  const [probando, setProbando] = useState(false)

  const confirmar = async () => {
    setProbando(true)
    try {
      const r = await fetch('/api/pos/autorizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, accion }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo autorizar')
      onAutorizado(j.usuario.id as string, motivo.trim())
    } catch (e) {
      toast.error((e as Error).message)
      setPin('')
    } finally {
      setProbando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5">
        <p className="flex items-center gap-2 text-lg font-bold">
          <ShieldCheck className="h-5 w-5 text-amber-500" />
          {titulo}
        </p>
        {detalle && <p className="mt-1 text-sm text-slate-500">{detalle}</p>}

        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-slate-500">Motivo</label>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Se equivocó el mozo, el cliente lo cambió…"
            className="h-12 w-full rounded-lg border border-slate-200 px-3 text-base outline-none focus:border-slate-900"
          />
        </div>

        <p className="mb-2 mt-4 text-xs font-medium text-slate-500">PIN del supervisor</p>
        <div className="mb-3 flex justify-center gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? 'bg-slate-900' : i < 4 ? 'bg-slate-200' : 'bg-slate-100'}`}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              onClick={() => setPin((p) => (p.length >= 6 ? p : p + d))}
              className="h-14 rounded-xl bg-slate-100 text-xl font-bold active:scale-95"
            >
              {d}
            </button>
          ))}
          <span />
          <button
            onClick={() => setPin((p) => (p.length >= 6 ? p : p + '0'))}
            className="h-14 rounded-xl bg-slate-100 text-xl font-bold active:scale-95"
          >
            0
          </button>
          <button
            onClick={() => setPin((p) => p.slice(0, -1))}
            aria-label="Borrar"
            className="grid h-14 place-items-center rounded-xl bg-slate-100 active:scale-95"
          >
            <Delete className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={onCancelar} className="h-14 flex-1 rounded-xl bg-slate-100 font-semibold text-slate-600">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={pin.length < 4 || probando}
            className="h-14 flex-[2] rounded-xl bg-slate-900 font-semibold text-white disabled:opacity-30"
          >
            {probando ? 'Verificando…' : 'Autorizar'}
          </button>
        </div>
      </div>
    </div>
  )
}

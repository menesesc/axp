'use client'

import { useState } from 'react'
import { toast } from 'sonner'

/**
 * Alta de mesas por rango.
 *
 * Un salón se carga una sola vez y son treinta mesas numeradas. Cargarlas de
 * a una, con un formulario cada una, es media hora de nada.
 */
export function CrearMesas({
  sucursalId,
  sectorId,
  onListo,
}: {
  sucursalId: string
  sectorId: string
  onListo: () => void
}) {
  const [desde, setDesde] = useState('1')
  const [hasta, setHasta] = useState('20')
  const [capacidad, setCapacidad] = useState('4')
  const [guardando, setGuardando] = useState(false)

  const crear = async () => {
    setGuardando(true)
    try {
      const r = await fetch('/api/pos/salon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sucursalId,
          sectorId,
          desde: Number(desde) || 1,
          hasta: Number(hasta) || 1,
          capacidad: Number(capacidad) || 4,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudieron crear')
      toast.success(`${j.creadas} mesas creadas`)
      onListo()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <p className="text-lg font-semibold">Este salón no tiene mesas</p>
      <p className="mt-1 text-sm text-slate-500">Cargalas de una vez con el número que usan en el salón.</p>
      <div className="mt-6 flex items-end justify-center gap-3">
        <Campo label="Desde" value={desde} onChange={setDesde} />
        <Campo label="Hasta" value={hasta} onChange={setHasta} />
        <Campo label="Cubiertos" value={capacidad} onChange={setCapacidad} />
      </div>
      <button
        onClick={crear}
        disabled={guardando}
        className="mt-6 h-16 w-full rounded-xl bg-slate-900 text-lg font-semibold text-white disabled:opacity-40 active:scale-[0.99]"
      >
        Crear mesas
      </button>
    </div>
  )
}

function Campo({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col items-center gap-1 text-xs text-slate-500">
      {label}
      <input
        value={value}
        inputMode="numeric"
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 3))}
        className="h-16 w-24 rounded-xl border border-slate-200 text-center text-2xl font-bold tabular-nums outline-none focus:border-slate-900"
      />
    </label>
  )
}

'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

/**
 * A nombre de quién está la mesa.
 *
 * Sirve para buscarla y para saber a quién se le lleva la cuenta. Cuando
 * exista la cuenta corriente, este mismo dato la engancha.
 */
export function NombreCliente({
  valor,
  onCerrar,
  onGuardar,
}: {
  valor: string | null
  onCerrar: () => void
  onGuardar: (nombre: string | null) => void
}) {
  const [nombre, setNombre] = useState(valor ?? '')
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5">
        <div className="mb-3 flex items-start justify-between">
          <p className="text-lg font-bold">Cliente de la mesa</p>
          <button onClick={onCerrar} aria-label="Cerrar" className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onGuardar(nombre.trim() || null)}
          placeholder="Apellido o empresa"
          className="h-14 w-full rounded-xl border border-slate-200 px-4 text-lg outline-none focus:border-slate-900"
        />
        <div className="mt-4 flex gap-2">
          {valor && (
            <button onClick={() => onGuardar(null)} className="h-14 flex-1 rounded-xl bg-slate-100 font-semibold text-slate-600">
              Quitar
            </button>
          )}
          <button
            onClick={() => onGuardar(nombre.trim() || null)}
            className="h-14 flex-[2] rounded-xl bg-slate-900 font-semibold text-white"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

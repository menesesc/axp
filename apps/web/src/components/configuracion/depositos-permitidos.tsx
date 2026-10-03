'use client'

import { useQuery } from '@tanstack/react-query'
import { Warehouse } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Deposito {
  id: string
  nombre: string
  esCentral: boolean
}

/**
 * Depósitos en los que el usuario puede contar stock.
 *
 * Ninguno seleccionado = todos, que es lo que corresponde a un encargado. El
 * de barra se limita a Barra. El filtro real está en el servidor: la API no
 * devuelve la planilla de un depósito ajeno ni deja guardar en él.
 *
 * Solo tiene sentido si el usuario puede entrar a Conteo, así que el panel
 * aparece únicamente cuando esa sección está habilitada.
 */
export function DepositosPermitidos({
  valor,
  onChange,
  disabled,
}: {
  valor: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}) {
  const { data } = useQuery({
    queryKey: ['depositos'],
    queryFn: async () => {
      const res = await fetch('/api/configuracion/depositos')
      if (!res.ok) throw new Error('No se pudieron cargar los depósitos')
      return res.json() as Promise<{ depositos: Deposito[] }>
    },
    staleTime: 5 * 60 * 1000,
  })

  const depositos = data?.depositos ?? []
  if (depositos.length === 0) return null

  const todos = valor.length === 0
  const toggle = (id: string) => {
    if (disabled) return
    onChange(valor.includes(id) ? valor.filter((x) => x !== id) : [...valor, id])
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
      <div className="flex items-center gap-1.5">
        <Warehouse className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        <span className="text-sm font-medium text-slate-700">Depósitos para contar</span>
        <span className="text-xs text-slate-400">{todos ? 'todos' : `${valor.length} de ${depositos.length}`}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([])}
          className={cn(
            'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
            todos
              ? 'border-sky-200 bg-sky-50 text-sky-700'
              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
            disabled && 'cursor-not-allowed opacity-60'
          )}
        >
          Todos
        </button>
        {depositos.map((d) => {
          const activo = valor.includes(d.id)
          return (
            <button
              key={d.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(d.id)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                activo
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                disabled && 'cursor-not-allowed opacity-60'
              )}
            >
              {d.nombre}
              {d.esCentral && <span className="ml-1 text-[10px] opacity-60">central</span>}
            </button>
          )
        })}
      </div>
      {!todos && (
        <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
          Solo va a ver y poder guardar el conteo de estos depósitos.
        </p>
      )}
    </div>
  )
}

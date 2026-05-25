'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Props {
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
  sucursales?: string[] | undefined
  sucursal?: string | undefined
  onSucursalChange?: ((s: string) => void) | undefined
}

function fmtIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function startOfMonth(d = new Date()): string {
  return fmtIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)))
}
function startOfPrevMonth(d = new Date()): { from: string; to: string } {
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0))
  return { from: fmtIso(first), to: fmtIso(last) }
}
function todayIso(): string {
  return fmtIso(new Date())
}
function daysAgo(n: number): string {
  return fmtIso(new Date(Date.now() - n * 24 * 60 * 60 * 1000))
}

export function DateRange({ from, to, onChange, sucursales, sucursal, onSucursalChange }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={from}
          onChange={(e) => onChange({ from: e.target.value, to })}
          className="w-36 text-sm"
        />
        <span className="text-slate-400 text-sm">→</span>
        <Input
          type="date"
          value={to}
          onChange={(e) => onChange({ from, to: e.target.value })}
          className="w-36 text-sm"
        />
      </div>
      <div className="flex gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ from: todayIso(), to: todayIso() })}
        >
          Hoy
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ from: daysAgo(1), to: daysAgo(1) })}
        >
          Ayer
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ from: daysAgo(6), to: todayIso() })}
        >
          7d
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ from: daysAgo(29), to: todayIso() })}
        >
          30d
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ from: startOfMonth(), to: todayIso() })}
        >
          Este mes
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(startOfPrevMonth())}
        >
          Mes anterior
        </Button>
      </div>
      {sucursales && sucursales.length > 1 && onSucursalChange && (
        <select
          value={sucursal ?? ''}
          onChange={(e) => onSucursalChange(e.target.value)}
          className="border border-slate-200 rounded-md px-2 py-1.5 text-sm bg-white"
        >
          <option value="">Todas las sucursales</option>
          {sucursales.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      )}
    </div>
  )
}

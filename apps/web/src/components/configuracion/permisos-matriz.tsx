'use client'

import { Eye, EyeOff, Lock, Pencil, Wallet, type LucideIcon } from 'lucide-react'
import {
  MODULOS_ASIGNABLES,
  NIVELES,
  parsePermisos,
  serializePermisos,
  type Nivel,
} from '@/lib/permisos'
import { cn } from '@/lib/utils'

interface PermisosMatrizProps {
  /** Permisos serializados del usuario (columna `permisos`). */
  permisos: string[]
  onChange: (permisos: string[]) => void
  /** Los admin no usan la matriz: se muestra deshabilitada. */
  disabled?: boolean
}

const ICONO_NIVEL: Record<Nivel, LucideIcon> = {
  none: EyeOff,
  view: Eye,
  edit: Pencil,
}

/**
 * Editor de la matriz de permisos: una fila por módulo, con el nivel de acceso
 * y —donde aplica— si además ve los importes en pesos o solo cantidades.
 */
export function PermisosMatriz({ permisos, onChange, disabled = false }: PermisosMatrizProps) {
  const matriz = parsePermisos(permisos)

  const setNivel = (modulo: string, nivel: Nivel) => {
    const siguiente = { ...matriz, [modulo]: { ...matriz[modulo]!, nivel } }
    onChange(serializePermisos(siguiente))
  }

  const toggleImportes = (modulo: string) => {
    const actual = matriz[modulo]!
    const siguiente = { ...matriz, [modulo]: { ...actual, importes: !actual.importes } }
    onChange(serializePermisos(siguiente))
  }

  const aplicarATodos = (nivel: Nivel, importes: boolean) => {
    const siguiente = { ...matriz }
    for (const def of MODULOS_ASIGNABLES) {
      siguiente[def.value] = {
        nivel: def.soloLectura && nivel === 'edit' ? 'view' : nivel,
        importes: nivel === 'none' ? false : importes,
      }
    }
    onChange(serializePermisos(siguiente))
  }

  return (
    <div className={cn('rounded-lg border border-slate-200 overflow-hidden', disabled && 'opacity-50')}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">Permisos por sección</span>
        </div>
        {!disabled && (
          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => aplicarATodos('none', false)}
              className="px-2 py-0.5 rounded text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            >
              Ninguno
            </button>
            <button
              type="button"
              onClick={() => aplicarATodos('view', true)}
              className="px-2 py-0.5 rounded text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            >
              Ver todo
            </button>
          </div>
        )}
      </div>

      <div className="divide-y divide-slate-100">
        {MODULOS_ASIGNABLES.map((def) => {
          const actual = matriz[def.value]!
          const sinAcceso = actual.nivel === 'none'

          return (
            <div key={def.value} className="px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{def.label}</p>
                  <p className="text-xs text-slate-400 truncate">{def.hint}</p>
                </div>

                <div className="flex shrink-0 rounded-md border border-slate-200 overflow-hidden">
                  {NIVELES.filter((n) => !(def.soloLectura && n.value === 'edit')).map((n) => {
                    const Icono = ICONO_NIVEL[n.value]
                    const activo = actual.nivel === n.value
                    return (
                      <button
                        key={n.value}
                        type="button"
                        disabled={disabled}
                        onClick={() => setNivel(def.value, n.value)}
                        title={n.hint}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors',
                          'border-r border-slate-200 last:border-r-0',
                          activo
                            ? n.value === 'none'
                              ? 'bg-slate-200 text-slate-700'
                              : n.value === 'view'
                                ? 'bg-sky-100 text-sky-700'
                                : 'bg-emerald-100 text-emerald-700'
                            : 'bg-white text-slate-400 hover:bg-slate-50',
                          disabled && 'cursor-not-allowed'
                        )}
                      >
                        <Icono className="h-3 w-3" />
                        {n.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {def.importes && (
                <label
                  className={cn(
                    'mt-1.5 flex items-center gap-1.5 text-xs w-fit',
                    sinAcceso || disabled ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 cursor-pointer'
                  )}
                >
                  <input
                    type="checkbox"
                    className="rounded border-slate-300"
                    checked={!sinAcceso && actual.importes}
                    disabled={sinAcceso || disabled}
                    onChange={() => toggleImportes(def.value)}
                  />
                  <Wallet className="h-3 w-3" />
                  Ver importes en pesos
                  {!sinAcceso && !actual.importes && (
                    <span className="text-slate-400">— hoy ve solo cantidades</span>
                  )}
                </label>
              )}
            </div>
          )
        })}
      </div>

      <p className="px-3 py-2 text-xs text-slate-400 bg-slate-50 border-t border-slate-200">
        Configuración (empresa, usuarios, canales) queda reservada a los administradores.
      </p>
    </div>
  )
}

/** Resumen compacto de la matriz, para la tabla de usuarios. */
export function PermisosResumen({ permisos }: { permisos: string[] }) {
  const matriz = parsePermisos(permisos)
  const activos = MODULOS_ASIGNABLES.filter((def) => matriz[def.value]!.nivel !== 'none')

  if (activos.length === 0) {
    return <span className="text-[10px] text-slate-400">Sin secciones habilitadas</span>
  }

  return (
    <div className="flex flex-wrap justify-center gap-1">
      {activos.map((def) => {
        const { nivel, importes } = matriz[def.value]!
        return (
          <span
            key={def.value}
            title={def.importes && !importes ? `${def.label}: solo cantidades` : def.label}
            className={cn(
              'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium',
              nivel === 'edit' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'
            )}
          >
            {def.label}
            {nivel === 'edit' && <Pencil className="h-2.5 w-2.5" />}
            {def.importes && !importes && <EyeOff className="h-2.5 w-2.5" />}
          </span>
        )
      })}
    </div>
  )
}

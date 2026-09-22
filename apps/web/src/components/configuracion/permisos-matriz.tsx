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

/** Color del segmento activo, por nivel. */
const ACTIVO_NIVEL: Record<Nivel, string> = {
  none: 'bg-white text-slate-600 shadow-sm ring-1 ring-slate-200',
  view: 'bg-white text-sky-700 shadow-sm ring-1 ring-sky-200',
  edit: 'bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200',
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
    <div className={cn('rounded-xl border border-slate-200 overflow-hidden', disabled && 'opacity-50')}>
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">Permisos por sección</span>
        </div>
        {!disabled && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => aplicarATodos('none', false)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Ninguno
            </button>
            <button
              type="button"
              onClick={() => aplicarATodos('view', true)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
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
          // Siempre 3 celdas del mismo ancho: los módulos de solo lectura
          // dejan la de "Editar" como un hueco inerte. Así todas las filas
          // alinean sus columnas entre sí, no solo el borde derecho.

          return (
            <div key={def.value} className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-sm font-medium text-slate-800">{def.label}</p>
                <p className="mt-0.5 text-xs leading-snug text-slate-400">{def.hint}</p>
              </div>

              <div className="flex w-full shrink-0 flex-col items-end gap-1.5 sm:w-auto">
                <div className="grid w-full grid-cols-3 gap-0.5 rounded-lg bg-slate-100 p-0.5 sm:w-[18rem]">
                  {NIVELES.map((n) => {
                    if (def.soloLectura && n.value === 'edit') {
                      return (
                        <span
                          key={n.value}
                          title="Esta sección no tiene acciones de edición"
                          className="flex items-center justify-center rounded-md py-1.5 text-xs text-slate-300"
                        >
                          &mdash;
                        </span>
                      )
                    }
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
                          'flex items-center justify-center gap-1 whitespace-nowrap rounded-md px-1 py-1.5 text-xs font-medium transition-colors',
                          activo
                            ? ACTIVO_NIVEL[n.value]
                            : 'text-slate-500 hover:bg-white/60 hover:text-slate-700',
                          disabled && 'cursor-not-allowed'
                        )}
                      >
                        <Icono className="h-3 w-3 shrink-0" />
                        {n.label}
                      </button>
                    )
                  })}
                </div>

                {def.importes && !sinAcceso && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleImportes(def.value)}
                    title={
                      actual.importes
                        ? 'Ve los montos en pesos'
                        : 'El servidor borra los montos: ve solo cantidades'
                    }
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      actual.importes
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                      disabled && 'cursor-not-allowed'
                    )}
                  >
                    <Wallet className="h-3 w-3 shrink-0" />
                    {actual.importes ? 'Ve importes en pesos' : 'Solo cantidades'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="px-3.5 py-2.5 text-xs leading-snug text-slate-400 bg-slate-50 border-t border-slate-200">
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

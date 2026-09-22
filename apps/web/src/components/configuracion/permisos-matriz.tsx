'use client'

import { useMemo, useState } from 'react'
import { ChevronRight, Eye, EyeOff, Lock, Pencil, Wallet, type LucideIcon } from 'lucide-react'
import {
  MODULOS_ASIGNABLES,
  NIVELES,
  parsePermisos,
  seccionesDeModulo,
  serializePermisos,
  type Matriz,
  type Modulo,
  type Nivel,
  type SeccionDef,
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

/** Estado agregado de un módulo, a partir de sus secciones. */
function resumenModulo(secciones: SeccionDef[], matriz: Matriz) {
  const conAcceso = secciones.filter((s) => matriz[s.value]!.nivel !== 'none')
  const puedenImportes = secciones.filter((s) => s.importes)
  const conImportes = puedenImportes.filter(
    (s) => matriz[s.value]!.nivel !== 'none' && matriz[s.value]!.importes
  )
  const editables = secciones.filter((s) => !s.soloLectura)
  return {
    total: secciones.length,
    activas: conAcceso.length,
    todas: conAcceso.length === secciones.length,
    ninguna: conAcceso.length === 0,
    enEdicion: conAcceso.filter((s) => matriz[s.value]!.nivel === 'edit').length,
    editables: editables.length,
    importes: conImportes.length,
    puedenImportes: puedenImportes.length,
  }
}

type Resumen = ReturnType<typeof resumenModulo>

function resumenTexto(r: Resumen): string {
  if (r.ninguna) return 'Sin acceso'
  if (r.todas) {
    if (r.editables > 0 && r.enEdicion === r.editables) return `Las ${r.total} secciones, con edición`
    return `Las ${r.total} secciones`
  }
  return `${r.activas} de ${r.total} secciones`
}

/**
 * Editor de la matriz de permisos.
 *
 * Una fila por sección (pestaña o página), agrupadas por módulo. El encabezado
 * del módulo resume qué tiene habilitado y aplica un nivel a todas sus secciones
 * de una vez; el detalle se despliega para afinar pestaña por pestaña.
 */
export function PermisosMatriz({ permisos, onChange, disabled = false }: PermisosMatrizProps) {
  const matriz = useMemo(() => parsePermisos(permisos), [permisos])
  const [abiertos, setAbiertos] = useState<Set<Modulo>>(new Set())

  const toggleAbierto = (modulo: Modulo) => {
    setAbiertos((prev) => {
      const next = new Set(prev)
      if (next.has(modulo)) next.delete(modulo)
      else next.add(modulo)
      return next
    })
  }

  const aplicar = (cambio: (m: Matriz) => void) => {
    const siguiente: Matriz = {}
    for (const [k, v] of Object.entries(matriz)) siguiente[k] = { ...v }
    cambio(siguiente)
    onChange(serializePermisos(siguiente))
  }

  const setNivelSeccion = (def: SeccionDef, nivel: Nivel) =>
    aplicar((m) => {
      m[def.value] = { nivel, importes: nivel === 'none' ? false : m[def.value]!.importes }
    })

  const toggleImportesSeccion = (def: SeccionDef) =>
    aplicar((m) => {
      m[def.value] = { ...m[def.value]!, importes: !m[def.value]!.importes }
    })

  /** Aplica un nivel a todas las secciones del módulo. */
  const setNivelModulo = (modulo: Modulo, nivel: Nivel) =>
    aplicar((m) => {
      for (const def of seccionesDeModulo(modulo)) {
        m[def.value] = {
          nivel: def.soloLectura && nivel === 'edit' ? 'view' : nivel,
          importes: nivel === 'none' ? false : m[def.value]!.importes,
        }
      }
    })

  /** Enciende o apaga los importes de todas las secciones del módulo. */
  const setImportesModulo = (modulo: Modulo, valor: boolean) =>
    aplicar((m) => {
      for (const def of seccionesDeModulo(modulo)) {
        if (def.importes) m[def.value] = { ...m[def.value]!, importes: valor }
      }
    })

  const aplicarATodos = (nivel: Nivel, importes: boolean) =>
    aplicar((m) => {
      for (const mod of MODULOS_ASIGNABLES) {
        for (const def of seccionesDeModulo(mod.value)) {
          m[def.value] = {
            nivel: def.soloLectura && nivel === 'edit' ? 'view' : nivel,
            importes: nivel === 'none' ? false : importes && !!def.importes,
          }
        }
      }
    })

  const grupos = MODULOS_ASIGNABLES.map((mod) => {
    const secciones = seccionesDeModulo(mod.value)
    return { mod, secciones, r: resumenModulo(secciones, matriz) }
  })
  const totalActivas = grupos.reduce((acc, g) => acc + g.r.activas, 0)
  const totalSecciones = grupos.reduce((acc, g) => acc + g.r.total, 0)

  return (
    <div className={cn('rounded-xl border border-slate-200 overflow-hidden', disabled && 'opacity-50')}>
      {/* flex-wrap: en pantallas angostas los botones bajan a una segunda línea,
          si no el encabezado imponía un ancho mínimo de ~350px al diálogo. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3.5 py-2.5 bg-slate-50 border-b border-slate-200">
        <div className="flex min-w-0 items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">Permisos</span>
          <span className="truncate text-xs text-slate-400">
            {totalActivas} de {totalSecciones} secciones
          </span>
        </div>
        {!disabled && (
          <div className="flex shrink-0 items-center gap-1.5">
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
        {grupos.map(({ mod, secciones, r }) => {
          const abierto = abiertos.has(mod.value)
          // Un módulo de una sola sección no tiene nada que desplegar: se edita
          // directamente en el encabezado.
          const unica = secciones.length === 1 ? secciones[0]! : null

          // Nivel del encabezado: null cuando las secciones no coinciden entre
          // sí, para que no parezca que todas están en el mismo estado.
          const nivelCabecera: Nivel | null = unica
            ? matriz[unica.value]!.nivel
            : r.ninguna
              ? 'none'
              : !r.todas
                ? null
                : r.editables > 0 && r.enEdicion === r.editables
                  ? 'edit'
                  : r.enEdicion === 0
                    ? 'view'
                    : null

          return (
            <div key={mod.value}>
              <div className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-1.5">
                  {unica ? (
                    <span className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleAbierto(mod.value)}
                      className="mt-0.5 shrink-0 rounded text-slate-400 transition-colors hover:text-slate-700"
                      aria-expanded={abierto}
                      aria-label={abierto ? `Contraer ${mod.label}` : `Desplegar ${mod.label}`}
                    >
                      <ChevronRight className={cn('h-4 w-4 transition-transform', abierto && 'rotate-90')} />
                    </button>
                  )}
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => !unica && toggleAbierto(mod.value)}
                      className={cn(
                        'block text-left text-sm font-medium text-slate-800',
                        !unica && 'hover:text-slate-950'
                      )}
                    >
                      {mod.label}
                    </button>
                    <p className="mt-0.5 text-xs leading-snug text-slate-400">
                      {unica ? mod.hint : resumenTexto(r)}
                    </p>
                  </div>
                </div>

                <div className="flex w-full shrink-0 flex-col items-end gap-1.5 sm:w-auto">
                  <Segmentado
                    nivelActual={nivelCabecera}
                    soloLectura={secciones.every((s) => s.soloLectura)}
                    disabled={disabled}
                    onSet={(nivel) => (unica ? setNivelSeccion(unica, nivel) : setNivelModulo(mod.value, nivel))}
                  />

                  {unica
                    ? unica.importes &&
                      matriz[unica.value]!.nivel !== 'none' && (
                        <ChipImportes
                          activo={matriz[unica.value]!.importes}
                          disabled={disabled}
                          onClick={() => toggleImportesSeccion(unica)}
                        />
                      )
                    : r.puedenImportes > 0 &&
                      r.activas > 0 && (
                        <ChipImportes
                          activo={r.importes === r.puedenImportes}
                          parcial={r.importes > 0 && r.importes < r.puedenImportes}
                          disabled={disabled}
                          onClick={() => setImportesModulo(mod.value, r.importes < r.puedenImportes)}
                        />
                      )}
                </div>
              </div>

              {!unica && abierto && (
                <div className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/50">
                  {secciones.map((def) => {
                    const actual = matriz[def.value]!
                    return (
                      <div
                        key={def.value}
                        className="flex flex-col gap-2 py-2.5 pl-9 pr-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                      >
                        <p className="min-w-0 flex-1 text-sm text-slate-600">{def.label}</p>
                        <div className="flex w-full shrink-0 flex-col items-end gap-1.5 sm:w-auto">
                          <Segmentado
                            nivelActual={actual.nivel}
                            soloLectura={!!def.soloLectura}
                            disabled={disabled}
                            onSet={(nivel) => setNivelSeccion(def, nivel)}
                          />
                          {def.importes && actual.nivel !== 'none' && (
                            <ChipImportes
                              activo={actual.importes}
                              disabled={disabled}
                              onClick={() => toggleImportesSeccion(def)}
                            />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
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

/** Control segmentado de nivel. `nivelActual` en null = las secciones difieren. */
function Segmentado({
  nivelActual,
  soloLectura,
  disabled,
  onSet,
}: {
  nivelActual: Nivel | null
  soloLectura: boolean
  disabled?: boolean
  onSet: (nivel: Nivel) => void
}) {
  return (
    <div className="grid w-full grid-cols-3 gap-0.5 rounded-lg bg-slate-100 p-0.5 sm:w-[18rem]">
      {NIVELES.map((n) => {
        if (soloLectura && n.value === 'edit') {
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
        const activo = nivelActual === n.value
        return (
          <button
            key={n.value}
            type="button"
            disabled={disabled}
            onClick={() => onSet(n.value)}
            title={n.hint}
            className={cn(
              'flex items-center justify-center gap-1 whitespace-nowrap rounded-md px-1 py-1.5 text-xs font-medium transition-colors',
              activo ? ACTIVO_NIVEL[n.value] : 'text-slate-500 hover:bg-white/60 hover:text-slate-700',
              disabled && 'cursor-not-allowed'
            )}
          >
            <Icono className="h-3 w-3 shrink-0" />
            {n.label}
          </button>
        )
      })}
    </div>
  )
}

function ChipImportes({
  activo,
  parcial = false,
  disabled,
  onClick,
}: {
  activo: boolean
  parcial?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const etiqueta = parcial ? 'Importes en algunas' : activo ? 'Ve importes en pesos' : 'Solo cantidades'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={
        parcial
          ? 'Algunas secciones ven importes y otras no'
          : activo
            ? 'Ve los montos en pesos'
            : 'El servidor borra los montos: ve solo cantidades'
      }
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        parcial
          ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
          : activo
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
        disabled && 'cursor-not-allowed'
      )}
    >
      <Wallet className="h-3 w-3 shrink-0" />
      {etiqueta}
    </button>
  )
}

/** Resumen compacto de la matriz, para la tabla de usuarios. */
export function PermisosResumen({ permisos }: { permisos: string[] }) {
  const matriz = parsePermisos(permisos)
  const grupos = MODULOS_ASIGNABLES.map((mod) => ({
    mod,
    r: resumenModulo(seccionesDeModulo(mod.value), matriz),
  })).filter((g) => g.r.activas > 0)

  if (grupos.length === 0) {
    return <span className="text-[10px] text-slate-400">Sin secciones habilitadas</span>
  }

  return (
    <div className="flex flex-wrap justify-center gap-1">
      {grupos.map(({ mod, r }) => (
        <span
          key={mod.value}
          title={
            r.todas
              ? `${mod.label}: todas las secciones`
              : `${mod.label}: ${r.activas} de ${r.total} secciones`
          }
          className={cn(
            'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium',
            r.enEdicion > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'
          )}
        >
          {mod.label}
          {!r.todas && (
            <span className="opacity-60">
              {r.activas}/{r.total}
            </span>
          )}
          {r.enEdicion > 0 && <Pencil className="h-2.5 w-2.5" />}
          {r.puedenImportes > 0 && r.importes === 0 && <EyeOff className="h-2.5 w-2.5" />}
        </span>
      ))}
    </div>
  )
}

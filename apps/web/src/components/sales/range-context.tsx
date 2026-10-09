'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Range = { from: string; to: string }
type RangeState = [Range, (r: Range) => void]

/**
 * Rango de fechas compartido por todas las pestañas de Ventas: el filtro que se
 * elige en una pestaña sigue puesto al pasar a otra. Se guarda en sessionStorage
 * para sobrevivir a una recarga, pero no entre sesiones (al día siguiente
 * vuelve el default, que es relativo a hoy).
 */
const SalesRangeContext = createContext<RangeState | null>(null)
/** El rango se elige en una barra fija de la página, no en cada pestaña. */
const RangoFijoContext = createContext(false)

const STORAGE_KEY = 'ventas:rango'

function leerGuardado(): Range | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const r = JSON.parse(raw)
    return typeof r?.from === 'string' && typeof r?.to === 'string' ? r : null
  } catch {
    return null
  }
}

export function SalesRangeProvider({ initial, fijo = false, children }: { initial: () => Range; fijo?: boolean; children: ReactNode }) {
  const [range, setRangeState] = useState<Range>(() => leerGuardado() ?? initial())
  const setRange = useCallback((r: Range) => {
    setRangeState(r)
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(r))
    } catch {
      // sin storage (modo privado): el rango igual se comparte en memoria
    }
  }, [])
  return (
    <RangoFijoContext.Provider value={fijo}>
      <SalesRangeContext.Provider value={[range, setRange]}>{children}</SalesRangeContext.Provider>
    </RangoFijoContext.Provider>
  )
}

/**
 * Rango de la pestaña. Dentro de `SalesRangeProvider` usa el compartido; fuera
 * (p. ej. un componente reutilizado en otra página) cae a un estado local.
 */
export function useSalesRange(fallback: () => Range): RangeState {
  const ctx = useContext(SalesRangeContext)
  const local = useState<Range>(fallback)
  return ctx ?? local
}

/** ¿El rango está en la barra fija de la página? Las pestañas no lo repiten. */
export function useRangoFijo() {
  return useContext(RangoFijoContext)
}

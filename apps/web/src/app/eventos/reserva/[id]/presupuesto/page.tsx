'use client'

import { Suspense, use } from 'react'
import { PantallaPresupuesto } from '@/components/eventos/presupuesto'

/** Presupuesto imprimible de una reserva. `?v=` abre una versión guardada. */
export default function PresupuestoReserva({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  // useSearchParams (la versión elegida) pide un Suspense.
  return (
    <Suspense fallback={null}>
      <PantallaPresupuesto destino={{ reservaId: id }} volver={`/eventos/reserva/${id}`} />
    </Suspense>
  )
}

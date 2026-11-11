'use client'

import { Suspense, use } from 'react'
import { PantallaPresupuesto } from '@/components/eventos/presupuesto'

/** Presupuesto imprimible de un evento (agencias, eventos privados). `?v=` abre una versión guardada. */
export default function PresupuestoEvento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <Suspense fallback={null}>
      <PantallaPresupuesto destino={{ eventoId: id }} volver={`/eventos/evento/${id}`} />
    </Suspense>
  )
}

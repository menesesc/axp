'use client'

import Link from 'next/link'
import { Paintbrush } from 'lucide-react'
import { RAIZ, Titulo, itemDeRuta, ruta } from '../shell'
import { Card } from '../ui'

const DISENADAS = [
  { nombre: 'Inicio', href: '/dashboard' },
  { nombre: 'Comprobantes', href: '/documentos' },
  { nombre: 'Pagos', href: '/pagos' },
  { nombre: 'Ventas', href: '/ventas' },
  { nombre: 'Compras sugeridas', href: '/compras' },
  { nombre: 'Recetas', href: '/recetas' },
  { nombre: 'Resumen ejecutivo', href: '/informes' },
  { nombre: 'Análisis de precios', href: '/informes/precios' },
]

/** Pantalla de las secciones que todavía no están diseñadas en el prototipo. */
export function PantallaGenerica({ href }: { href: string }) {
  const actual = itemDeRuta(RAIZ + href)
  if (!actual) {
    return (
      <Card>
        <p className="text-sm text-[var(--sec)]">
          Esta pantalla no existe en el prototipo.{' '}
          <Link href={RAIZ as never} className="text-[var(--azul-2)] hover:underline">
            Volver al dashboard
          </Link>
        </p>
      </Card>
    )
  }
  const Icono = actual.modulo.icono
  const nombre = actual.sub?.nombre ?? actual.modulo.nombre
  return (
    <>
      <Titulo titulo={nombre} bajada={`${actual.modulo.nombre}. Misma estructura que hoy, con el estilo nuevo.`} />
      <div className="grid gap-4 sm:grid-cols-3 mb-5">
        {[0, 1, 2].map((n) => (
          <Card key={n}>
            <div className="h-3 w-24 rounded-full bg-slate-900/[0.07]" />
            <div className="mt-4 h-7 w-32 rounded-lg bg-slate-900/[0.07]" />
            <div className="mt-4 h-2 w-full rounded-full bg-slate-900/[0.07]" />
          </Card>
        ))}
      </div>
      <Card>
        <div className="flex flex-col items-center py-12 text-center">
          <span className="pt-icono h-12 w-12">
            <Icono className="h-6 w-6" />
          </span>
          <h2 className="pt-display mt-5 text-xl font-semibold">{nombre} todavía no está en el prototipo</h2>
          <p className="mt-2 max-w-md text-sm text-[var(--sec)]">
            Usaría las mismas tarjetas, tablas y pestañas que las pantallas diseñadas. Mirá estas para ver cómo quedaría:
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {DISENADAS.map((d) => (
              <Link key={d.href} href={ruta(d.href)} className="pt-boton pt-boton-sec">
                <Paintbrush className="h-4 w-4" /> {d.nombre}
              </Link>
            ))}
          </div>
        </div>
      </Card>
    </>
  )
}

import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque } from 'next/font/google'
import { Landing } from '@/components/landing/landing'

// Tipografía de títulos de la familia Southbit (southbit.dev).
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
})

const descripcion =
  'AXP carga solas las facturas de tus proveedores, te avisa cuando un precio sube y te muestra cuánto ganás con cada plato. Ventas, stock por depósito, pedidos y pagos en un solo lugar.'

export const metadata: Metadata = {
  title: 'AXP | Controlá compras, ventas y stock sin cargar nada a mano',
  description: descripcion,
  openGraph: {
    title: 'AXP | Controlá compras, ventas y stock sin cargar nada a mano',
    description: descripcion,
    url: 'https://axp.com.ar',
    siteName: 'AXP',
    type: 'website',
    locale: 'es_AR',
  },
}

export const viewport: Viewport = {
  themeColor: '#05070c',
}

export default function Page() {
  return <Landing fuenteDisplay={display.variable} />
}

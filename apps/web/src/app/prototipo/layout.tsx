import { notFound } from 'next/navigation'
import { Bricolage_Grotesque } from 'next/font/google'
import { Shell } from '@/components/prototipo/shell'

// Prototipo de rediseño de la app con datos de ejemplo. Solo existe en
// desarrollo local: en producción la ruta da 404 (y el middleware solo la
// deja pasar sin sesión con NODE_ENV=development).
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata = { title: 'AXP | Prototipo de rediseño', robots: { index: false } }

export default function PrototipoLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound()
  return <Shell fuente={display.variable}>{children}</Shell>
}

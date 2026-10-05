import { Nunito_Sans } from 'next/font/google'

/**
 * El recetario usa su propia tipografía.
 *
 * El resto de AXP va con Inter, que es correcta para tablas y números. El
 * recetario se lee distinto —títulos grandes, pasos a un metro de distancia—
 * y pide algo más humanista y redondeado, como hace Cookidoo. Nunito Sans
 * tiene la altura de x alta y los remates blandos de esa familia, y aguanta
 * bien el cuerpo grande del modo cocina.
 *
 * Va acotada a esta sección a propósito: cambiar la fuente de toda la app
 * sería otra discusión.
 */
const recetario = Nunito_Sans({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  display: 'swap',
  // Next no tiene métricas de fallback para esta familia y avisa en cada
  // build. El ajuste automático anti-salto no aplica; damos el fallback a mano.
  adjustFontFallback: false,
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
})

export default function RecetasLayout({ children }: { children: React.ReactNode }) {
  return <div className={recetario.className}>{children}</div>
}

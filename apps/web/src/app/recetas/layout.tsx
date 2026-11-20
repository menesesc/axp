import { recetario } from '@/fonts'

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
export default function RecetasLayout({ children }: { children: React.ReactNode }) {
  return <div className={recetario.className}>{children}</div>
}

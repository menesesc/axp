import localFont from 'next/font/local'

/*
 * Las tipografías van en el repo, no se bajan de Google en cada build.
 *
 * Con next/font/google el build descarga las fuentes de fonts.googleapis.com,
 * y el día que Google responde distinto (pasó con Bricolage Grotesque) el
 * deploy falla entero por una tipografía. Son los archivos latinos variables
 * que sirve Google, así que se ven igual que antes.
 */

/** Texto de toda la app: correcta para tablas y números. */
export const inter = localFont({
  src: './inter.woff2',
  weight: '100 900',
  variable: '--font-sans',
  display: 'swap',
})

/** Títulos de la app y de la landing. */
export const display = localFont({
  src: './bricolage-grotesque.woff2',
  weight: '500 700',
  variable: '--font-display',
  display: 'swap',
})

/** El recetario (ver recetas/layout.tsx). */
export const recetario = localFont({
  src: './nunito-sans.woff2',
  weight: '400 800',
  display: 'swap',
  // Sin métricas de fallback para esta familia: el ajuste anti-salto no
  // aplica y el fallback va a mano.
  adjustFontFallback: false,
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
})

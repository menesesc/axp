import './globals.css';
import '@/styles/axp.css';
import type { Metadata } from 'next';
import { display, inter } from '@/fonts';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  metadataBase: new URL('https://axp.com.ar'),
  title: 'AXP',
  description: 'Compras, ventas, stock y pagos de tu negocio en un solo lugar, con las facturas cargadas solas.',
  applicationName: 'AXP',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={`${inter.className} ${inter.variable} ${display.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

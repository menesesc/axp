import type { Metadata } from 'next';
import { LandingPage } from '../../landing/LandingPage';

export const metadata: Metadata = {
  title: 'AXP | OCR de facturas y control de costos para pymes',
  description:
    'Automatiza carga de facturas con OCR, confidenceScore, deteccion de aumentos y ordenes de pago para gastronomia y pymes en Argentina.',
  openGraph: {
    title: 'AXP | OCR de facturas y control de costos',
    description:
      'Controla facturas de proveedores, detecta variaciones de precio y ordena pagos con trazabilidad.',
    url: 'https://www.axp.com.ar',
    siteName: 'AXP',
    type: 'website',
    locale: 'es_AR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AXP | OCR de facturas y control de costos',
    description:
      'OCR + confidenceScore + alertas de aumentos para compras y pagos mas ordenados.',
  },
};

const softwareApplicationSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'AXP',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: 'https://www.axp.com.ar',
  description:
    'SaaS para automatizar carga de facturas, detectar aumentos y gestionar ordenes de pago en pymes de Argentina.',
  offers: {
    '@type': 'Offer',
    price: 'Consultar',
    priceCurrency: 'ARS',
  },
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }}
      />
      <LandingPage />
    </>
  );
}

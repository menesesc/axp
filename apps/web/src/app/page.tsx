import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, TrendingUp, CreditCard, ScanLine } from 'lucide-react';

export const metadata: Metadata = {
  title: 'AXP | Gestion inteligente de facturas y pagos',
  description:
    'Automatiza carga de facturas con OCR, detecta aumentos de precio y gestiona ordenes de pago para pymes en Argentina.',
  openGraph: {
    title: 'AXP | Gestion inteligente de facturas y pagos',
    description:
      'Controla facturas de proveedores, detecta variaciones de precio y ordena pagos con trazabilidad.',
    url: 'https://www.axp.com.ar',
    siteName: 'AXP',
    type: 'website',
    locale: 'es_AR',
  },
};

const features = [
  {
    icon: ScanLine,
    title: 'OCR inteligente',
    description: 'Carga facturas en segundos. Extraemos datos automaticamente con score de confianza.',
  },
  {
    icon: TrendingUp,
    title: 'Alertas de aumentos',
    description: 'Detectamos variaciones de precio entre facturas para que nunca pagues de mas.',
  },
  {
    icon: FileText,
    title: 'Gestion de documentos',
    description: 'Organiza facturas por proveedor, estado y fecha con busqueda avanzada.',
  },
  {
    icon: CreditCard,
    title: 'Ordenes de pago',
    description: 'Crea ordenes, programa cheques y eCheqs, y lleva trazabilidad completa.',
  },
];

export default function Page() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <span className="text-lg font-semibold tracking-tight text-slate-900">AXP</span>
          <Link
            href="/login"
            className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            Ingresar
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-medium text-blue-700 mb-6">
            Proximamente
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Gestion inteligente de facturas y pagos
          </h1>
          <p className="mt-4 text-base text-slate-600 max-w-lg mx-auto">
            AXP automatiza la carga de facturas con OCR, detecta aumentos de precio y organiza
            tus pagos a proveedores. Pensado para pymes y gastronomia en Argentina.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto mt-12 w-full">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-slate-200 p-5 text-left"
            >
              <feature.icon className="h-5 w-5 text-blue-600 mb-3" />
              <h3 className="text-sm font-semibold text-slate-900">{feature.title}</h3>
              <p className="mt-1 text-sm text-slate-500 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-12">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Acceder al sistema
          </Link>
        </div>
      </main>

      <footer className="border-t border-slate-200 px-6 py-6">
        <div className="max-w-4xl mx-auto flex flex-col gap-2 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>AXP - Gestion inteligente de facturas y pagos.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacidad" className="hover:text-slate-600 transition-colors">
              Politica de privacidad
            </Link>
            <p>&copy; {new Date().getFullYear()} AXP</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

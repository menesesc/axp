'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { track } from '../../../landing/utils/analytics';

interface FormState {
  nombre: string;
  empresa: string;
  email: string;
  whatsapp: string;
  volumen: string;
}

const initialState: FormState = {
  nombre: '',
  empresa: '',
  email: '',
  whatsapp: '',
  volumen: '',
};

export default function DemoPage() {
  const [form, setForm] = useState<FormState>(initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email), [form.email]);
  const isValid = form.nombre.trim() && form.empresa.trim() && emailValid;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!isValid) {
      setError('Completa nombre, empresa y un email valido.');
      return;
    }

    try {
      setIsSubmitting(true);
      track('lead_submit_attempt', { source: 'demo_page' });

      const response = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        throw new Error('No se pudo enviar el formulario');
      }

      setSubmitted(true);
      setForm(initialState);
      track('lead_submit_success', { source: 'demo_page' });
    } catch (submitError) {
      console.error(submitError);
      setError('No se pudo enviar ahora. Intenta nuevamente en unos minutos.');
      track('lead_submit_error', { source: 'demo_page' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#dbeafe,_#ffffff_45%)] py-12">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
        <Button asChild variant="ghost" className="mb-6">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver al inicio
          </Link>
        </Button>

        <Card className="border-slate-200 shadow-md">
          <CardHeader>
            <CardTitle className="text-2xl text-slate-900">Pedir demo</CardTitle>
            <p className="text-sm text-slate-600">
              Te contactamos para mostrarte como AXP se adapta a tu operacion.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="nombre" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Nombre *
                </label>
                <Input
                  id="nombre"
                  value={form.nombre}
                  onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label htmlFor="empresa" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Empresa *
                </label>
                <Input
                  id="empresa"
                  value={form.empresa}
                  onChange={(e) => setForm((prev) => ({ ...prev, empresa: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Email *
                </label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label htmlFor="whatsapp" className="mb-1.5 block text-sm font-medium text-slate-700">
                  WhatsApp (opcional)
                </label>
                <Input
                  id="whatsapp"
                  value={form.whatsapp}
                  onChange={(e) => setForm((prev) => ({ ...prev, whatsapp: e.target.value }))}
                />
              </div>

              <div>
                <label htmlFor="volumen" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Volumen aproximado de documentos/mes (opcional)
                </label>
                <Input
                  id="volumen"
                  value={form.volumen}
                  onChange={(e) => setForm((prev) => ({ ...prev, volumen: e.target.value }))}
                />
              </div>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              {submitted ? <p className="text-sm font-medium text-emerald-600">Enviado. Te contactaremos pronto.</p> : null}

              <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Enviando...' : 'Enviar'}
                <Send className="ml-2 h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, PlayCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '../components/Container';
import { landingCopy } from '../content/copy';
import { track } from '../utils/analytics';

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-slate-200/70 bg-[radial-gradient(circle_at_top_left,_#dbeafe_0,_transparent_40%),radial-gradient(circle_at_top_right,_#e0f2fe_0,_transparent_35%),linear-gradient(#f8fafc,_#ffffff)] py-20 sm:py-24">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-sky-700">
              <Sparkles className="h-3.5 w-3.5" />
              {landingCopy.badge}
            </span>
            <div className="mt-6 max-w-2xl">
              <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                {landingCopy.heroTitle}
              </h1>
              <p className="mt-5 text-lg text-slate-600">{landingCopy.heroSubtitle}</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" variant="primary" onClick={() => track('cta_demo_click', { location: 'hero' })}>
                  <Link href="/demo">
                    Pedir demo
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" onClick={() => track('cta_how_it_works_click', { location: 'hero' })}>
                  <Link href="#como-funciona">
                    <PlayCircle className="mr-2 h-4 w-4" />
                    Ver como funciona
                  </Link>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>OCR en segundos</span>
                <span>Alertas de aumentos</span>
                <span>Pagos ordenados</span>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -right-10 -top-8 h-40 w-40 rounded-full bg-sky-200/60 blur-2xl" aria-hidden="true" />
            <div className="absolute -left-10 bottom-0 h-48 w-48 rounded-full bg-blue-200/50 blur-2xl" aria-hidden="true" />
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
              <Image
                src="/landing/hero-hands-laptop.jpg"
                alt="Equipo administrativo revisando facturas en notebook"
                width={1600}
                height={1067}
                className="h-full w-full object-cover"
                priority
              />
              <div className="absolute bottom-4 left-4 right-4 rounded-xl bg-white/90 p-3 text-xs text-slate-600 shadow-lg backdrop-blur">
                AXP procesa facturas en minutos y destaca cambios de precio automaticamente.
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

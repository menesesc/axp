import type { Route } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Container } from './components/Container';
import { Hero } from './sections/Hero';
import { Problem } from './sections/Problem';
import { Solution } from './sections/Solution';
import { HowItWorks } from './sections/HowItWorks';
import { Impact } from './sections/Impact';
import { Pricing } from './sections/Pricing';
import { FAQ } from './sections/FAQ';
import { FinalCTA } from './sections/FinalCTA';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
            AXP
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href={"/dashboard" as Route}>Ingresar</Link>
            </Button>
            <Button asChild variant="primary" size="sm">
              <Link href="/demo">Pedir demo</Link>
            </Button>
          </div>
        </Container>
      </header>

      <main>
        <Hero />
        <Problem />
        <Solution />
        <HowItWorks />
        <Impact />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>

      <footer className="border-t border-slate-200 py-8">
        <Container className="flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>AXP - Gestion inteligente de facturas y pagos.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacidad" className="hover:text-slate-700 underline-offset-2 hover:underline">
              Política de privacidad
            </Link>
            <p>© {new Date().getFullYear()} AXP</p>
          </div>
        </Container>
      </footer>
    </div>
  );
}

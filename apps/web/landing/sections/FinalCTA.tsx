'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '../components/Container';
import { landingCopy } from '../content/copy';
import { track } from '../utils/analytics';

export function FinalCTA() {
  return (
    <section className="border-t border-slate-200 py-16 sm:py-20">
      <Container>
        <div className="rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500 p-8 text-white sm:p-12">
          <h2 className="text-2xl font-semibold sm:text-3xl">{landingCopy.finalTitle}</h2>
          <p className="mt-3 max-w-2xl text-sm text-blue-50 sm:text-base">{landingCopy.finalSubtitle}</p>
          <div className="mt-6">
            <Button asChild size="lg" variant="secondary" onClick={() => track('cta_demo_click', { location: 'final' })}>
              <Link href="/demo">
                Ir al formulario
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}

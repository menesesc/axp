import { FileUp, ScanLine, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';
import { Container } from '../components/Container';
import { SectionTitle } from '../components/SectionTitle';
import { landingCopy } from '../content/copy';

const icons: LucideIcon[] = [FileUp, ScanLine, TrendingUp, Wallet];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="py-16 sm:py-20">
      <Container>
        <SectionTitle title={landingCopy.howItWorksTitle} />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {landingCopy.steps.map((step, index) => {
            const Icon = icons[index % icons.length] ?? FileUp;
            return (
              <div key={step} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-slate-900">Paso {index + 1}</p>
                <p className="mt-2 text-sm text-slate-600">{step}</p>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

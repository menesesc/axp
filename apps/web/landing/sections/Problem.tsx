import { AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Container } from '../components/Container';
import { SectionTitle } from '../components/SectionTitle';
import { landingCopy } from '../content/copy';

export function Problem() {
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <SectionTitle title={landingCopy.problemTitle} />
        <Card className="border-slate-200">
          <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
            {landingCopy.problemBullets.map((bullet) => (
              <div key={bullet} className="flex items-start gap-3 rounded-lg border border-slate-200/70 bg-slate-50 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <p className="text-sm font-medium text-slate-700">{bullet}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </Container>
    </section>
  );
}

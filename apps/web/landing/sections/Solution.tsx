import { CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Container } from '../components/Container';
import { SectionTitle } from '../components/SectionTitle';
import { landingCopy } from '../content/copy';

export function Solution() {
  return (
    <section className="bg-slate-50 py-16 sm:py-20">
      <Container>
        <SectionTitle title={landingCopy.solutionTitle} />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {landingCopy.solutions.map((item) => (
            <Card key={item.title} className="border-slate-200 bg-white">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  {item.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600">{item.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}

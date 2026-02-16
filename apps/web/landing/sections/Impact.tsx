import { Card, CardContent } from '@/components/ui/card';
import { Container } from '../components/Container';
import { SectionTitle } from '../components/SectionTitle';
import { landingCopy } from '../content/copy';

export function Impact() {
  return (
    <section className="bg-slate-900 py-16 sm:py-20">
      <Container>
        <SectionTitle title={landingCopy.impactTitle} className="[&>h2]:text-white [&>p]:text-slate-300" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {landingCopy.impact.map((item) => (
            <Card key={item.label} className="border-slate-700 bg-slate-800">
              <CardContent className="p-5">
                <p className="text-3xl font-semibold text-white">{item.value}</p>
                <p className="mt-2 text-sm text-slate-300">{item.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}

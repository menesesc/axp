import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Container } from '../components/Container';
import { SectionTitle } from '../components/SectionTitle';
import { landingCopy, pricingPlans } from '../content/copy';

export function Pricing() {
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <SectionTitle title={landingCopy.pricingTitle} subtitle={landingCopy.pricingSubtitle} />
        <div className="grid gap-4 lg:grid-cols-3">
          {pricingPlans.map((plan) => (
            <Card
              key={plan.name}
              className={plan.highlighted ? 'border-blue-300 shadow-md ring-1 ring-blue-200' : 'border-slate-200'}
            >
              <CardHeader>
                <CardTitle className="text-xl text-slate-900">{plan.name}</CardTitle>
                <p className="text-sm text-slate-600">{plan.docs}</p>
                <p className="pt-2 text-base font-semibold text-blue-700">{plan.price}</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-slate-600">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-6 w-full" variant={plan.highlighted ? 'primary' : 'outline'}>
                  <Link href="/demo">Consultar</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}

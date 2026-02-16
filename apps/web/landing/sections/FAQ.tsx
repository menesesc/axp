import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Container } from '../components/Container';
import { SectionTitle } from '../components/SectionTitle';
import { faqs, landingCopy } from '../content/copy';

export function FAQ() {
  return (
    <section className="bg-slate-50 py-16 sm:py-20">
      <Container>
        <SectionTitle title={landingCopy.faqTitle} />
        <div className="grid gap-4 md:grid-cols-2">
          {faqs.map((faq) => (
            <Card key={faq.q} className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-slate-900">{faq.q}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600">{faq.a}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}

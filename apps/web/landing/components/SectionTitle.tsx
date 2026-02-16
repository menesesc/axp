import { cn } from '@/lib/utils';

interface SectionTitleProps {
  title: string;
  subtitle?: string;
  className?: string;
}

export function SectionTitle({ title, subtitle, className }: SectionTitleProps) {
  return (
    <div className={cn('mb-8 max-w-2xl', className)}>
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
      {subtitle ? <p className="mt-3 text-base text-slate-600">{subtitle}</p> : null}
    </div>
  );
}

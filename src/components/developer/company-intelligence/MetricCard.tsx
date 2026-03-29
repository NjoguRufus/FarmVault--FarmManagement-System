import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  className?: string;
};

export function MetricCard({ label, value, hint, icon: Icon, className }: Props) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/60 bg-gradient-to-b from-card/90 to-card/40 p-4 shadow-sm',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden /> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground leading-snug">{hint}</p> : null}
    </div>
  );
}

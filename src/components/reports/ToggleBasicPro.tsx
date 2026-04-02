import React from 'react';
import { cn } from '@/lib/utils';

export type ReportsDashboardMode = 'pro' | 'basic';

export function ToggleBasicPro({
  mode,
  onChange,
  className,
}: {
  mode: ReportsDashboardMode;
  onChange: (m: ReportsDashboardMode) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex rounded-xl border border-white/25 bg-card/40 p-1 shadow-[var(--shadow-card)] backdrop-blur-md',
        className,
      )}
      role="tablist"
      aria-label="Dashboard detail level"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'pro'}
        className={cn(
          'min-w-[5.5rem] rounded-lg px-4 py-2 text-sm font-semibold transition-all',
          mode === 'pro'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
        onClick={() => onChange('pro')}
      >
        PRO
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'basic'}
        className={cn(
          'min-w-[5.5rem] rounded-lg px-4 py-2 text-sm font-semibold transition-all',
          mode === 'basic'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
        onClick={() => onChange('basic')}
      >
        BASIC
      </button>
    </div>
  );
}

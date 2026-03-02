import React from 'react';
import { cn } from '@/lib/utils';
import { type BillingMode, getBillingModeLabel } from '@/config/plans';

interface BillingModeSelectorProps {
  mode: BillingMode;
  onChange: (mode: BillingMode) => void;
  className?: string;
}

const MODES: BillingMode[] = ['monthly', 'season', 'annual'];

export function BillingModeSelector({ mode, onChange, className }: BillingModeSelectorProps) {
  return (
    <div
      className={cn(
        'inline-flex w-full max-w-xl items-center justify-center gap-2 flex-wrap sm:flex-nowrap',
        className,
      )}
    >
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          className={cn(
            'flex-1 min-w-[110px] sm:min-w-[140px] px-4 py-2 text-xs sm:text-sm rounded-full border transition-all',
            mode === m
              ? 'bg-fv-gold-soft text-foreground border-fv-gold shadow-sm'
              : 'bg-background text-muted-foreground border-border hover:bg-muted/60',
          )}
          onClick={() => onChange(m)}
        >
          {getBillingModeLabel(m)}
        </button>
      ))}
    </div>
  );
}


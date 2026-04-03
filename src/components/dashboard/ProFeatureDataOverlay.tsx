import React from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Centered padlock + copy over blurred Pro-gated data (title stays sharp above).
 */
export function ProFeatureDataOverlay({
  onUpgrade,
  className,
}: {
  onUpgrade?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 rounded-[inherit] bg-background/45 px-2 py-2 backdrop-blur-[4px]',
        className,
      )}
    >
      <div
        className="pointer-events-none flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/25"
        aria-hidden
      >
        <Lock className="h-4 w-4" strokeWidth={2} />
      </div>
      <p className="pointer-events-none text-center text-[10px] font-semibold leading-tight text-foreground sm:text-xs">
        These are Pro features
      </p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="pointer-events-auto h-7 px-3 text-[10px] font-medium sm:text-xs"
        onClick={onUpgrade}
      >
        Upgrade to Pro
      </Button>
    </div>
  );
}

import React from 'react';
import { cn } from '@/lib/utils';

const stickClass =
  'inline-block h-[0.88em] w-[1.5px] shrink-0 rounded-full bg-foreground/90 align-middle';

function VerticalSticks({ n }: { n: number }) {
  return (
    <span className="inline-flex translate-y-[0.04em] items-end gap-[2px] select-none" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={stickClass} />
      ))}
    </span>
  );
}

/** One group of five: four vertical strokes with a horizontal bar through the middle (gate / fence tally). */
function TallyFive({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative inline-flex h-[1.1em] min-w-[1.35em] items-center justify-center px-px align-middle',
        className,
      )}
      aria-hidden
    >
      <VerticalSticks n={4} />
      <span className="pointer-events-none absolute left-0 right-0 top-1/2 h-[1.5px] -translate-y-1/2 rounded-full bg-foreground/90" />
    </span>
  );
}

export type TallyMarksDisplayProps = {
  count: number;
  /** Show "· N buckets" after the tally */
  showBucketLabel?: boolean;
  className?: string;
};

/**
 * Renders farm-style tally marks: every 5 is four | with a horizontal slash across, not a diagonal.
 */
export function TallyMarksDisplay({ count, showBucketLabel = true, className }: TallyMarksDisplayProps) {
  if (count <= 0) {
    return showBucketLabel ? (
      <span className={cn('text-[11px] text-muted-foreground tabular-nums', className)}>0 buckets</span>
    ) : null;
  }
  const groups = Math.floor(count / 5);
  const rem = count % 5;

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 align-middle', className)}>
      {Array.from({ length: groups }, (_, i) => (
        <TallyFive key={`t5-${i}`} />
      ))}
      {rem > 0 && <VerticalSticks n={rem} />}
      {showBucketLabel && (
        <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
          · {count} bucket{count !== 1 ? 's' : ''}
        </span>
      )}
    </span>
  );
}

import { cn } from '@/lib/utils';

export function HighlightsChips({
  highlights,
  max = 3,
  className,
}: {
  highlights: string[];
  max?: number;
  className?: string;
}) {
  const list = (highlights ?? []).slice(0, max);
  if (list.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {list.map((h, i) => (
        <span
          key={i}
          className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
        >
          {h}
        </span>
      ))}
    </div>
  );
}

import { cn } from '@/lib/utils';

export function TagsChips({ tags, className }: { tags: string[]; className?: string }) {
  const list = tags ?? [];
  if (list.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {list.map((t, i) => (
        <span
          key={i}
          className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

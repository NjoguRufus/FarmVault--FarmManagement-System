import React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  title: string;
  description?: string;
  className?: string;
};

export function EmptyStateBlock({ title, description, className }: Props) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
        <Inbox className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-muted-foreground leading-relaxed">{description}</p> : null}
    </div>
  );
}

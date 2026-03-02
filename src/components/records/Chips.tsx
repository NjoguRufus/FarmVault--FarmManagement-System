import React from 'react';
import { cn } from '@/lib/utils';

interface ChipsProps {
  items: string[];
  className?: string;
  variant?: 'default' | 'highlight';
}

export function Chips({ items, className, variant = 'default' }: ChipsProps) {
  if (!items?.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {items.map((item, i) => (
        <span
          key={`${item}-${i}`}
          className={cn(
            'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
            variant === 'highlight'
              ? 'bg-primary/15 text-primary border border-primary/30'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TimelineItem } from '@/utils/cropStages';

export interface SeasonProgressTimelineProps {
  items: TimelineItem[];
  onStageClick?: (index: number) => void;
}

export function SeasonProgressTimeline({ items, onStageClick }: SeasonProgressTimelineProps) {
  if (!items.length) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 px-4 py-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        Season progress
      </p>
      <div className="flex flex-wrap gap-2 sm:gap-1 sm:flex-nowrap sm:items-center">
        {items.map((item, index) => (
          <React.Fragment key={item.stage.key}>
            <div
              role={onStageClick ? 'button' : undefined}
              tabIndex={onStageClick ? 0 : undefined}
              onClick={onStageClick ? () => onStageClick(index) : undefined}
              onKeyDown={
                onStageClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onStageClick(index);
                      }
                    }
                  : undefined
              }
              className={cn(
                onStageClick && 'cursor-pointer hover:opacity-90',
                'flex items-center gap-2 rounded-lg px-3 py-2 min-w-0 sm:flex-1 sm:min-w-0 sm:justify-center',
                item.status === 'completed' &&
                  'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400/90',
                item.status === 'current' &&
                  'bg-primary/15 text-primary ring-1 ring-primary/30',
                item.status === 'upcoming' && 'bg-muted/50 text-muted-foreground'
              )}
            >
              {item.status === 'completed' ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : (
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    item.status === 'current' && 'bg-primary',
                    item.status === 'upcoming' && 'bg-muted-foreground/50'
                  )}
                />
              )}
              <span className="text-xs font-medium truncate">{item.stage.label}</span>
              {item.status === 'current' && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {Math.round(item.progress * 100)}%
                </span>
              )}
            </div>
            {index < items.length - 1 && (
              <div
                className={cn(
                  'hidden sm:block w-4 h-0.5 shrink-0 rounded',
                  item.status === 'completed' ? 'bg-emerald-500/40' : 'bg-border'
                )}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

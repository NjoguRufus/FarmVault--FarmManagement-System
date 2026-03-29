import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  cards?: number;
};

export function LoadingSkeletonBlock({ className, cards = 8 }: Props) {
  return (
    <div className={cn('space-y-6', className)}>
      <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
        <div className="flex flex-wrap gap-2 pt-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-full max-w-lg rounded-lg" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

import React from 'react';
import { TrendingUp, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TodayRevenueProfitCardProps {
  hasActiveHarvest: boolean;
  revenue: number;
  profitLoss: number;
  isEmpty: boolean;
}

export function TodayRevenueProfitCard({
  hasActiveHarvest,
  revenue,
  profitLoss,
  isEmpty,
}: TodayRevenueProfitCardProps) {
  if (!hasActiveHarvest) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-border/50 bg-muted/30 p-4 transition-all">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Today&apos;s revenue & profit
        </span>
        <p className="text-sm text-muted-foreground mt-3 italic">
          No active harvest for this project.
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-4 transition-all after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-gradient-to-r after:from-primary/60 after:via-primary/20 after:to-transparent">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Today&apos;s revenue & profit
      </span>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            Revenue
          </span>
          <span className="font-semibold text-foreground">
            {isEmpty ? '—' : `KES ${revenue.toLocaleString()}`}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Wallet className="h-3.5 w-3.5" />
            Profit / Loss
          </span>
          <span
            className={cn(
              'font-semibold',
              profitLoss >= 0 ? 'text-fv-success' : 'text-destructive'
            )}
          >
            {isEmpty ? '—' : `KES ${profitLoss.toLocaleString()}`}
          </span>
        </div>
      </div>
      <p className="text-[10px] sm:text-xs text-muted-foreground mt-2">
        For selected period
      </p>
    </div>
  );
}

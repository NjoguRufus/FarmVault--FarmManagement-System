import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProFeatureDataOverlay } from '@/components/dashboard/ProFeatureDataOverlay';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'primary' | 'gold' | 'warning' | 'success' | 'destructive' | 'info';
  valueVariant?: 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'info';
  compact?: boolean;
  responsive?: boolean;
  /** When true, title stays clear; value area is blurred with Pro overlay (set by FeatureGate). */
  proLocked?: boolean;
  onProUpgrade?: () => void;
}

export function StatCard({
  title,
  value,
  change,
  changeLabel,
  icon,
  variant = 'default',
  valueVariant = 'default',
  compact = false,
  responsive = true,
  proLocked = false,
  onProUpgrade,
}: StatCardProps) {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;

  const iconBgClasses = {
    primary: 'bg-primary/15 text-primary',
    gold: 'bg-fv-gold-soft/60 text-fv-olive',
    warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    success: 'bg-fv-success/15 text-fv-success',
    destructive: 'bg-destructive/15 text-destructive',
    info: 'bg-fv-info/15 text-fv-info',
    default: 'bg-muted/60 text-muted-foreground',
  };

  const cardTintClasses = {
    default: '',
    primary: '',
    gold: '',
    warning: '',
    success: 'bg-fv-success/5 border-fv-success/30',
    destructive: 'bg-destructive/5 border-destructive/35',
    info: 'bg-fv-info/5 border-fv-info/30',
  };

  const valueColorClasses = {
    default: '',
    primary: 'text-primary',
    success: 'text-fv-success',
    warning: 'text-fv-warning',
    destructive: 'text-destructive',
    info: 'text-fv-info',
  };

  const cardBase =
    'relative mb-0 overflow-hidden rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm transition-all';

  const padding = responsive ? 'p-3 sm:p-4' : 'p-3';

  const accent =
    'after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-gradient-to-r after:from-primary/60 after:via-primary/20 after:to-transparent';

  if (compact) {
    return (
      <div className={cn(cardBase, padding, accent, cardTintClasses[variant])}>
        <div className="mb-1 flex items-center justify-between">
          <span
            className={cn(
              'text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs',
            )}
          >
            {title}
          </span>
          {icon && (
            <div
              className={cn(
                'flex shrink-0 items-center justify-center rounded-lg',
                responsive ? 'h-7 w-7 sm:h-8 sm:w-8' : 'h-7 w-7',
                iconBgClasses[variant],
              )}
            >
              <div className={responsive ? 'scale-75 sm:scale-90' : 'scale-75'}>{icon}</div>
            </div>
          )}
        </div>
        <div className={cn('relative mt-1', proLocked && 'min-h-[4.5rem]')}>
          {proLocked ? (
            <>
              <div className="pointer-events-none select-none blur-md opacity-35">
                <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                  <span
                    className={cn(
                      'font-heading font-bold tracking-tight',
                      responsive ? 'text-lg sm:text-xl' : 'text-lg',
                      valueColorClasses[valueVariant],
                    )}
                  >
                    {value}
                  </span>
                  {change !== undefined && (
                    <span
                      className={cn(
                        'fv-stat-change inline-flex items-center gap-0.5 text-[10px] sm:text-xs',
                        isPositive && 'fv-stat-change--positive',
                        isNegative && 'fv-stat-change--negative',
                      )}
                    >
                      {isPositive && <TrendingUp className="h-2.5 w-2.5" />}
                      {isNegative && <TrendingDown className="h-2.5 w-2.5" />}
                      {isPositive ? '+' : ''}
                      {change}%
                    </span>
                  )}
                </div>
                {changeLabel && (
                  <span className="mt-1 block text-[10px] text-muted-foreground sm:text-xs">{changeLabel}</span>
                )}
              </div>
              <ProFeatureDataOverlay onUpgrade={onProUpgrade} />
            </>
          ) : (
            <>
              <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                <span
                  className={cn(
                    'font-heading font-bold tracking-tight',
                    responsive ? 'text-lg sm:text-xl' : 'text-lg',
                    valueColorClasses[valueVariant],
                  )}
                >
                  {value}
                </span>
                {change !== undefined && (
                  <span
                    className={cn(
                      'fv-stat-change inline-flex items-center gap-0.5 text-[10px] sm:text-xs',
                      isPositive && 'fv-stat-change--positive',
                      isNegative && 'fv-stat-change--negative',
                    )}
                  >
                    {isPositive && <TrendingUp className="h-2.5 w-2.5" />}
                    {isNegative && <TrendingDown className="h-2.5 w-2.5" />}
                    {isPositive ? '+' : ''}
                    {change}%
                  </span>
                )}
              </div>
              {changeLabel && (
                <span className="mt-1 block text-[10px] text-muted-foreground sm:text-xs">{changeLabel}</span>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(cardBase, padding, accent, cardTintClasses[variant])}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        {icon && (
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
              iconBgClasses[variant],
            )}
          >
            {icon}
          </div>
        )}
      </div>
      <div className={cn('relative', proLocked && 'min-h-[5rem]')}>
        {proLocked ? (
          <>
            <div className="pointer-events-none select-none blur-md opacity-35">
              <div className="flex items-baseline gap-2">
                <span className={cn('font-heading text-xl font-bold tracking-tight', valueColorClasses[valueVariant])}>{value}</span>
                {change !== undefined && (
                  <span
                    className={cn(
                      'fv-stat-change inline-flex items-center gap-0.5 text-xs',
                      isPositive && 'fv-stat-change--positive',
                      isNegative && 'fv-stat-change--negative',
                    )}
                  >
                    {isPositive && <TrendingUp className="h-3 w-3" />}
                    {isNegative && <TrendingDown className="h-3 w-3" />}
                    {isPositive ? '+' : ''}
                    {change}%
                  </span>
                )}
              </div>
              {changeLabel && <span className="mt-1 block text-xs text-muted-foreground">{changeLabel}</span>}
            </div>
            <ProFeatureDataOverlay onUpgrade={onProUpgrade} />
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className={cn('font-heading text-xl font-bold tracking-tight', valueColorClasses[valueVariant])}>{value}</span>
              {change !== undefined && (
                <span
                  className={cn(
                    'fv-stat-change inline-flex items-center gap-0.5 text-xs',
                    isPositive && 'fv-stat-change--positive',
                    isNegative && 'fv-stat-change--negative',
                  )}
                >
                  {isPositive && <TrendingUp className="h-3 w-3" />}
                  {isNegative && <TrendingDown className="h-3 w-3" />}
                  {isPositive ? '+' : ''}
                  {change}%
                </span>
              )}
            </div>
            {changeLabel && <span className="mt-1 block text-xs text-muted-foreground">{changeLabel}</span>}
          </>
        )}
      </div>
    </div>
  );
}

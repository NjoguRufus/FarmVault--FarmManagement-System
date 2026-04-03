/**
 * FeatureGate component.
 * Wraps content and shows a lock overlay for Basic users trying to access Pro features.
 * Pro pages remain visible in navigation but content is locked.
 */

import React from 'react';
import { Lock, Sparkles, ArrowRight } from 'lucide-react';
import { useEffectivePlanAccess } from '@/hooks/useEffectivePlanAccess';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import type { SubscriptionFeatureKey } from '@/config/subscriptionFeatureMatrix';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { openUpgradeModal } from '@/lib/upgradeModalEvents';

// Prevent multiple "Upgrade to Pro" cards stacking up on the same page.
// Keyed by route (or an optional override).
const upgradeCardShownGroups = new Set<string>();

export interface FeatureGateProps {
  /** The feature key to check access for */
  feature: SubscriptionFeatureKey;
  /** Optional custom title for the lock overlay */
  title?: string;
  /** Optional custom description */
  description?: string;
  /** Children to render (locked if no access) */
  children: React.ReactNode;
  /** If true, completely hide content instead of blurring */
  hideContent?: boolean;
  /** Custom className for the wrapper */
  className?: string;
  /** Callback when upgrade is clicked */
  onUpgradeClick?: () => void;
  /**
   * Optional group key for suppressing duplicate upgrade cards.
   * Defaults to the current route path, so only one upgrade card is shown per page.
   */
  upgradeCardGroupKey?: string;
}

export function FeatureGate({
  feature,
  title,
  description,
  children,
  hideContent = false,
  className,
  onUpgradeClick,
  upgradeCardGroupKey,
}: FeatureGateProps) {
  const { plan, isTrial, status, isLoading, isDeveloper } = useEffectivePlanAccess();
  const { canAccess } = useFeatureAccess(feature);

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('fv-card animate-pulse', className)}>
        <div className="h-32 bg-muted/50 rounded-lg" />
      </div>
    );
  }

  // Developers always have access
  if (isDeveloper) {
    return <>{children}</>;
  }

  // If allowed, render children normally
  if (canAccess) {
    return <>{children}</>;
  }

  const displayTitle = title ?? 'This feature is available on Pro';
  const displayDescription =
    description ??
    'Upgrade to Pro to unlock advanced tools and insights.';

  const handleUpgrade = () => {
    if (onUpgradeClick) {
      onUpgradeClick();
    } else {
      // Default: open upgrade prompt (billing modal) without hiding locked pages/features.
      openUpgradeModal({ checkoutPlan: 'pro' });
    }
  };

  const groupKey =
    upgradeCardGroupKey ?? (typeof window !== 'undefined' ? window.location.pathname : 'ssr');

  // Show full upgrade card only once per group, to avoid multiple stacked cards.
  // Subsequent locked gates show blurred/hidden content instead of another upgrade card.
  let shouldShowUpgradeCard = true;
  if (upgradeCardShownGroups.has(groupKey)) {
    shouldShowUpgradeCard = false;
  } else {
    upgradeCardShownGroups.add(groupKey);
  }

  // If we already rendered the upgrade card for this group, don't render another full card.
  if (!shouldShowUpgradeCard) {
    return (
      <div className={cn('relative', className)}>
        {!hideContent ? (
          <div
            className="pointer-events-none select-none opacity-30 blur-sm"
            aria-hidden="true"
          >
            {children}
          </div>
        ) : (
          <div className="min-h-[200px]" aria-hidden="true" />
        )}
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      {/* Inline upgrade card (no absolute/fixed overlay) */}
      <div className="col-span-full w-full min-h-[200px] flex items-center justify-center py-8">
        <div className="fv-card max-w-md w-full text-center space-y-4 bg-background/95 backdrop-blur-md border-primary/20 shadow-lg">
          {/* Lock icon */}
          <div className="flex justify-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="h-6 w-6 text-primary" />
            </div>
          </div>

          {/* Title and description */}
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-foreground flex items-center justify-center gap-2">
              {displayTitle}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                <Sparkles className="h-3 w-3" />
                PRO
              </span>
            </h3>
            <p className="text-sm text-muted-foreground">{displayDescription}</p>
          </div>

          {/* Current plan info */}
          <p className="text-xs text-muted-foreground">
            You&apos;re currently on{' '}
            <span className="font-medium text-foreground capitalize">
              {status === 'trial' ? 'Free Trial' : plan}
            </span>
            {isTrial && ' (trial)'}
          </p>

          {/* Upgrade button */}
          <Button onClick={handleUpgrade} className="w-full gap-2" size="default">
            Upgrade to Pro
            <ArrowRight className="h-4 w-4" />
          </Button>

          {/* Subtle note */}
          <p className="text-[11px] text-muted-foreground">Unlock all features with a Pro subscription</p>
        </div>
      </div>
    </div>
  );
}

/**
 * ProBadge component - shows a small "PRO" badge for features.
 */
export function ProBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20',
        className
      )}
    >
      <Sparkles className="h-3 w-3" />
      PRO
    </span>
  );
}

/**
 * FeatureLockedButton - A button that shows locked state for Basic users.
 */
export interface FeatureLockedButtonProps {
  feature: SubscriptionFeatureKey;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

export function FeatureLockedButton({
  feature,
  children,
  onClick,
  className,
  disabled,
}: FeatureLockedButtonProps) {
  const { isDeveloper, isLoading } = useEffectivePlanAccess();
  const { canAccess } = useFeatureAccess(feature);
  const allowed = isDeveloper || canAccess;

  if (isLoading) {
    return (
      <Button className={className} disabled>
        {children}
      </Button>
    );
  }

  if (!allowed) {
    return (
      <Button
        className={cn('gap-2 cursor-not-allowed', className)}
        variant="outline"
        disabled
        title="This feature requires Pro"
      >
        <Lock className="h-3.5 w-3.5" />
        {children}
        <ProBadge />
      </Button>
    );
  }

  return (
    <Button className={className} onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}

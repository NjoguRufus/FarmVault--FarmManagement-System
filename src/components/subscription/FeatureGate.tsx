/**
 * FeatureGate component.
 * Wraps content and shows a lock overlay for Basic users trying to access Pro features.
 * Pro pages remain visible in navigation but content is locked.
 */

import React, { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Lock, Sparkles, ArrowRight } from 'lucide-react';
import { useEffectivePlanAccess } from '@/hooks/useEffectivePlanAccess';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import type { SubscriptionFeatureKey } from '@/config/subscriptionFeatureMatrix';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { openUpgradeModal } from '@/lib/upgradeModalEvents';

// Prevent multiple "Upgrade to Pro" cards stacking on one screen at once.
// Keyed by route path (or upgradeCardGroupKey). Must reset when the route changes
// and when the claiming instance unmounts, or the upgrade UI disappears on revisit / strict mode.
const upgradeCardShownGroups = new Set<string>();
let lastPathnameForUpgradeDedupe: string | null = null;

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
   * Defaults to the current route `pathname`, so only one "Upgrade to Pro" card
   * shows per screen (prevents 2+ cards).
   */
  upgradeCardGroupKey?: string;
  /**
   * When false, locked state renders a height placeholder only (no upgrade card).
   * Use with a page-level banner (e.g. dashboard).
   */
  showUpgradeCard?: boolean;
  /**
   * `full` — large glass upgrade card (deduped once per route).
   * `inline` — compact padlock + text only (replaces widget).
   * `blur-data` — keep widget chrome; blur data; inject `proLocked` / `onProUpgrade` on children (StatCard, charts).
   */
  upgradePresentation?: 'full' | 'inline' | 'blur-data';
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
  showUpgradeCard = true,
  upgradePresentation = 'full',
}: FeatureGateProps) {
  const { pathname } = useLocation();
  const groupKey = upgradeCardGroupKey ?? pathname;

  // New route → clear so the first locked gate on this page can show the upgrade card again.
  if (upgradePresentation === 'full' && lastPathnameForUpgradeDedupe !== pathname) {
    upgradeCardShownGroups.clear();
    lastPathnameForUpgradeDedupe = pathname;
  }

  // Tracks whether *this* FeatureGate instance claimed the upgrade slot.
  // Important: without this, on rerender the global Set already contains groupKey,
  // and the upgrade card would incorrectly switch to the blurred-only state.
  const hasClaimedUpgradeSlotRef = useRef(false);
  useLayoutEffect(() => {
    if (upgradePresentation !== 'full') return;
    return () => {
      if (hasClaimedUpgradeSlotRef.current) {
        upgradeCardShownGroups.delete(groupKey);
        hasClaimedUpgradeSlotRef.current = false;
      }
    };
  }, [groupKey, upgradePresentation]);

  const { plan, isTrial, status, isLoading, isDeveloper } = useEffectivePlanAccess();
  const { canAccess } = useFeatureAccess(feature);

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('fv-card animate-pulse min-h-[160px]', className)}>
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

  if (!showUpgradeCard) {
    return (
      <div className={cn('relative', className)}>
        <div className="w-full min-h-[160px] rounded-xl border border-border/50 bg-card/60" aria-hidden="true" />
      </div>
    );
  }

  const handleUpgrade = () => {
    if (onUpgradeClick) {
      onUpgradeClick();
    } else {
      openUpgradeModal({ checkoutPlan: 'pro' });
    }
  };

  if (upgradePresentation === 'blur-data') {
    return (
      <div className={cn(className)}>
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child;
          return React.cloneElement(
            child as React.ReactElement<{ proLocked?: boolean; onProUpgrade?: () => void }>,
            { proLocked: true, onProUpgrade: handleUpgrade },
          );
        })}
      </div>
    );
  }

  const displayTitle = title ?? 'This feature is available on Pro';
  const displayDescription =
    description ??
    'Upgrade to Pro to unlock advanced tools and insights.';

  if (upgradePresentation === 'inline') {
    const inlineSubtitle = description ?? 'Upgrade to Pro to unlock.';
    return (
      <div className={cn('relative', className)}>
        <div
          className={cn(
            'col-span-full flex min-h-[160px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-border/50 bg-card/50 px-3 py-4 text-center shadow-sm backdrop-blur-sm',
            'md:min-h-[180px] md:gap-2.5 md:py-5',
          )}
          role="region"
          aria-label="Pro feature"
        >
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary ring-1 ring-primary/15"
            aria-hidden
          >
            <Lock className="h-5 w-5" strokeWidth={2} />
          </div>
          <p className="max-w-[16rem] text-xs font-semibold leading-snug text-foreground sm:text-sm">
            {displayTitle}
          </p>
          <p className="max-w-[18rem] text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
            {inlineSubtitle}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-1 h-8 border-primary/25 bg-primary/5 text-xs font-medium text-primary hover:bg-primary/10"
            onClick={handleUpgrade}
          >
            Upgrade to unlock
          </Button>
        </div>
      </div>
    );
  }

  // Show full upgrade card only once per group among simultaneously mounted instances.
  // If this instance already claimed the slot, keep showing it on rerenders.
  const globalHasClaim = upgradeCardShownGroups.has(groupKey);
  const shouldShowUpgradeCard = hasClaimedUpgradeSlotRef.current || !globalHasClaim;

  if (!globalHasClaim && shouldShowUpgradeCard) {
    upgradeCardShownGroups.add(groupKey);
    hasClaimedUpgradeSlotRef.current = true;
  }

  // If another instance already claimed the upgrade slot, render blurred-only placeholder.
  if (!shouldShowUpgradeCard) {
    return (
      <div className={cn('relative', className)}>
        {/* Duplicate locked widgets should not render another upgrade card.
            Keep layout stable and avoid blurring the surrounding dashboard background. */}
        <div className="w-full min-h-[160px] rounded-xl border border-border/50 bg-card/60" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      {/* Inline upgrade card (no absolute/fixed overlay) */}
      <div className="col-span-full w-full min-h-[160px] flex items-center justify-center py-8">
        <div className="fv-app-lock-glass-card max-w-md w-full p-6 text-center space-y-4">
          <div className="mx-auto flex w-fit items-center justify-center">
            <div className="fv-app-lock-icon-bubble flex h-[72px] w-[72px] items-center justify-center">
              <Lock className="relative z-[1] h-9 w-9 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]" aria-hidden />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-semibold tracking-[-0.02em] text-white flex items-center justify-center gap-2">
              {displayTitle}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 text-white/90 border border-white/15">
                <Sparkles className="h-3 w-3" />
                PRO
              </span>
            </h3>
            <p className="text-sm leading-[1.5] text-white/75">{displayDescription}</p>
          </div>

          <p className="text-xs text-white/70">
            You&apos;re currently on{' '}
            <span className="font-medium text-white capitalize">
              {status === 'trial' ? 'Free Trial' : plan}
            </span>
            {isTrial && ' (trial)'}
          </p>

          <Button
            onClick={handleUpgrade}
            className="fv-app-lock-primary-btn w-full text-sm"
            size="default"
          >
            Upgrade to Pro
            <ArrowRight className="relative z-[1] h-4 w-4" />
          </Button>

          <p className="text-[11px] text-white/60">Unlock all features with a Pro subscription</p>
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

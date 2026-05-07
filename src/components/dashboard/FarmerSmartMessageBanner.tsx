import React from 'react';
import { X, Sun, Moon, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFarmerSmartInbox } from '@/hooks/useFarmerSmartInbox';
import { SmartCompanionCenter } from '@/components/companion/SmartCompanionCenter';

type Props = {
  companyId: string | null;
  clerkUserId: string | null;
};

const SLOT_STYLE = {
  morning: {
    icon: Sun,
    label: 'Morning companion',
    accent: 'text-amber-600 dark:text-amber-400',
    ring: 'border-amber-300/40 dark:border-amber-700/30',
    bg: 'from-amber-950/10 dark:from-amber-950/30',
  },
  evening: {
    icon: Moon,
    label: 'Evening reflection',
    accent: 'text-violet-600 dark:text-violet-400',
    ring: 'border-violet-300/40 dark:border-violet-700/30',
    bg: 'from-violet-950/10 dark:from-violet-950/30',
  },
  weekly: {
    icon: BarChart3,
    label: 'Weekly summary',
    accent: 'text-emerald-600 dark:text-emerald-400',
    ring: 'border-emerald-700/25 dark:border-emerald-700/25',
    bg: 'from-emerald-950/20 dark:from-emerald-950/40',
  },
} as const;

export function FarmerSmartMessageBanner({ companyId, clerkUserId }: Props) {
  const { latestVisible, dismiss, dismissing } = useFarmerSmartInbox(companyId, clerkUserId);

  if (!latestVisible) return null;

  const slot = latestVisible.slot ?? 'morning';
  const style = SLOT_STYLE[slot] ?? SLOT_STYLE.morning;
  const Icon = style.icon;

  return (
    <div
      className={cn(
        'relative rounded-xl border bg-gradient-to-r via-card to-card px-4 py-3 pr-12 shadow-sm',
        style.ring,
        style.bg,
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', style.accent)} />
        <div className="min-w-0 flex-1">
          <p className={cn('text-xs font-medium uppercase tracking-wide', style.accent)}>
            {style.label}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground">
            {latestVisible.body}
          </p>
          <SmartCompanionCenter
            companyId={companyId}
            clerkUserId={clerkUserId}
            trigger={
              <button
                type="button"
                className={cn('mt-1.5 text-xs underline-offset-2 hover:underline', style.accent)}
              >
                View all messages
              </button>
            }
          />
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 h-8 w-8 text-muted-foreground hover:text-foreground"
        disabled={dismissing}
        onClick={() => dismiss(latestVisible.id)}
        aria-label="Dismiss message"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

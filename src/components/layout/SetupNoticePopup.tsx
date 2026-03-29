import React, { useEffect, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const AUTO_DISMISS_MS = 5000;

const toneClass: Record<'emerald' | 'rose' | 'amber', string> = {
  emerald:
    'border-emerald-200/90 bg-gradient-to-br from-emerald-50 via-emerald-50/98 to-teal-50/95 text-emerald-950 shadow-emerald-900/10 dark:border-emerald-900/45 dark:from-emerald-950/50 dark:via-emerald-950/35 dark:to-teal-950/25 dark:text-emerald-50',
  rose:
    'border-rose-200/90 bg-gradient-to-br from-rose-50 via-rose-50/98 to-orange-50/90 text-rose-950 shadow-rose-900/10 dark:border-rose-900/45 dark:from-rose-950/45 dark:via-rose-950/30 dark:to-orange-950/20 dark:text-rose-50',
  amber:
    'border-amber-200/85 bg-gradient-to-br from-amber-50 via-amber-50/98 to-amber-100/85 text-amber-950 shadow-amber-900/10 dark:border-amber-900/45 dark:from-amber-950/45 dark:via-amber-950/30 dark:to-amber-900/25 dark:text-amber-50',
};

const iconClass: Record<'emerald' | 'rose' | 'amber', string> = {
  emerald: 'text-emerald-600 dark:text-emerald-400',
  rose: 'text-rose-600 dark:text-rose-400',
  amber: 'text-amber-600 dark:text-amber-400',
};

export type SetupNoticePopupProps = {
  open: boolean;
  onDismiss: () => void;
  tone: keyof typeof toneClass;
  title: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  children: React.ReactNode;
};

/**
 * Floating notice (not a full-width fixed bar). Auto-hides after {@link AUTO_DISMISS_MS}; user can dismiss early.
 */
export function SetupNoticePopup({ open, onDismiss, tone, title, icon: Icon, children }: SetupNoticePopupProps) {
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      onDismiss();
    }, AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [open, onDismiss]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-start justify-center px-3 pt-[4.75rem] sm:pt-20">
      <div
        className={cn(
          'pointer-events-auto w-full max-w-lg rounded-xl border shadow-lg backdrop-blur-[2px] animate-in fade-in-0 slide-in-from-top-3 duration-300',
          toneClass[tone],
        )}
        role="status"
        aria-live="polite"
        aria-label={title}
      >
        <div className="flex items-start gap-3 p-4 sm:p-4">
          <Icon className={cn('mt-0.5 h-5 w-5 shrink-0 sm:mt-0', iconClass[tone])} aria-hidden />
          <div className="min-w-0 flex-1 text-sm leading-snug pr-1">{children}</div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8 shrink-0 -mr-1',
              tone === 'emerald' &&
                'text-emerald-800 hover:bg-emerald-100/80 dark:text-emerald-200 dark:hover:bg-emerald-900/40',
              tone === 'rose' &&
                'text-rose-800 hover:bg-rose-100/80 dark:text-rose-200 dark:hover:bg-rose-900/40',
              tone === 'amber' &&
                'text-amber-800 hover:bg-amber-100/80 dark:text-amber-200 dark:hover:bg-amber-900/40',
            )}
            onClick={onDismiss}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

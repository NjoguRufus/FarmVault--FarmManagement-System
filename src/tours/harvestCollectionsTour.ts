/**
 * Harvest Collections guided tour — step definitions and filtering.
 * Role-aware, workflow-first starter tour. Informational only; no forced actions.
 */

import type { Step } from 'react-joyride';

export type HarvestTourContext = {
  hasProject: boolean;
  isFrenchBeansProject: boolean;
  hasSelectedCollection: boolean;
  hasCollections: boolean;
  canCreateCollection: boolean;
  canManageIntake: boolean;
  canPayPickers: boolean;
  canViewBuyerSection: boolean;
  canCloseHarvest: boolean;
  canViewFinancials: boolean;
  quickMode: boolean;
  collectionStatus: 'open' | 'closed' | null;
  isOfflineOrHasPendingSync: boolean;
  /** Tab triggers actually rendered (intake/pay/buyer). */
  visibleTabs: ('intake' | 'pay' | 'buyer')[];
};

export const HARVEST_TOUR_STORAGE_KEYS = {
  completed: 'farmvault:tour:harvest-collections:starter:v1:completed',
  dismissed: 'farmvault:tour:harvest-collections:starter:v1:dismissed',
} as const;

const NAVBAR_HEIGHT = 64;

export type HarvestTourStepId =
  | 'harvest-title'
  | 'harvest-new-collection'
  | 'harvest-collection-cards'
  | 'harvest-back'
  | 'harvest-stats'
  | 'harvest-total-kg'
  | 'harvest-total-picker-due'
  | 'harvest-buyer-sale-card'
  | 'harvest-quick-mode'
  | 'harvest-tab-intake'
  | 'harvest-tab-pay'
  | 'harvest-tab-buyer'
  | 'harvest-add-picker'
  | 'harvest-picker-cards'
  | 'harvest-wallet-btn'
  | 'harvest-sync-offline';

export interface HarvestTourStepDef extends Step {
  id: HarvestTourStepId;
  /** When false, step is excluded regardless of target. */
  when?: (ctx: HarvestTourContext) => boolean;
}

const STARTER_STEP_DEFS: HarvestTourStepDef[] = [
  {
    id: 'harvest-title',
    target: '[data-tour="harvest-collections-title"]',
    content:
      'Harvest Collections helps you manage one harvest day from picker weigh-in to payouts and buyer settlement.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    id: 'harvest-new-collection',
    target: '[data-tour="harvest-new-collection"]',
    content: 'Start a new harvest day here by creating a collection with a date and picker rate.',
    placement: 'bottom',
    when: (ctx) => ctx.canCreateCollection && !ctx.hasSelectedCollection,
  },
  {
    id: 'harvest-collection-cards',
    target: '[data-tour="harvest-collection-cards"]',
    content:
      'Each collection card represents one harvest session. Open a card to continue intake, payouts, or buyer settlement.',
    placement: 'top',
    when: (ctx) => !ctx.hasSelectedCollection && ctx.hasCollections,
  },
  {
    id: 'harvest-back',
    target: '[data-tour="harvest-back"]',
    content: 'Use Back to return to the list of collections or to Harvest Sales.',
    placement: 'bottom',
    when: (ctx) => ctx.hasSelectedCollection,
  },
  {
    id: 'harvest-stats',
    target: '[data-tour="harvest-stats"]',
    content:
      'These totals update from intake and payments. Total picker due is based on total harvest and the picker rate.',
    placement: 'bottom',
    when: (ctx) => ctx.hasSelectedCollection,
  },
  {
    id: 'harvest-quick-mode',
    target: '[data-tour="harvest-quick-mode"]',
    content:
      'Quick Mode is made for fast field work. Use it when many picker entries or payouts are being recorded quickly.',
    placement: 'bottom',
    when: (ctx) => ctx.hasSelectedCollection,
  },
  {
    id: 'harvest-tab-intake',
    target: '[data-tour="harvest-tab-intake"]',
    content:
      'Use Intake to record picker weights. Every saved entry updates collection totals immediately.',
    placement: 'bottom',
    when: (ctx) => ctx.hasSelectedCollection && ctx.visibleTabs.includes('intake'),
  },
  {
    id: 'harvest-add-picker',
    target: '[data-tour="harvest-add-picker"]',
    content:
      'Add pickers to this collection here. Each picker gets a number and name, then you can record their weigh-in entries.',
    placement: 'bottom',
    when: (ctx) => ctx.hasSelectedCollection && ctx.visibleTabs.includes('intake') && ctx.canManageIntake,
  },
  {
    id: 'harvest-picker-cards',
    target: '[data-tour="harvest-picker-cards"]',
    content:
      'Tap a picker card to add weight entries or view their ledger. Paid pickers show a PAID badge but stay clickable to view details.',
    placement: 'top',
    when: (ctx) => ctx.hasSelectedCollection && ctx.visibleTabs.includes('intake'),
  },
  {
    id: 'harvest-tab-pay',
    target: '[data-tour="harvest-tab-pay"]',
    content:
      'Use Pay to settle picker balances. Partial payments reduce the remaining balance instead of closing it fully.',
    placement: 'bottom',
    when: (ctx) => ctx.hasSelectedCollection && ctx.visibleTabs.includes('pay'),
  },
  {
    id: 'harvest-tab-buyer',
    target: '[data-tour="harvest-tab-buyer"]',
    content:
      'Use Buyer to set the buyer price and finalize the harvest after picker payouts are complete.',
    placement: 'bottom',
    when: (ctx) => ctx.hasSelectedCollection && ctx.visibleTabs.includes('buyer'),
  },
  {
    id: 'harvest-wallet-btn',
    target: '[data-tour="harvest-wallet-btn"]',
    content:
      'The Wallet tracks harvest cash received and payouts. It is different from picker payment totals.',
    placement: 'bottom',
    when: (ctx) => Boolean(ctx.canViewFinancials && ctx.isFrenchBeansProject && ctx.hasSelectedCollection),
  },
  {
    id: 'harvest-sync-offline',
    target: '[data-tour="harvest-sync-offline"]',
    content: 'If data was saved while offline, sync it here when the device reconnects.',
    placement: 'bottom',
    when: (ctx) => ctx.isOfflineOrHasPendingSync,
  },
];

/**
 * Build starter tour steps for the given context.
 * Does not check DOM; use filterTourStepsByAvailability to drop missing targets.
 */
export function getHarvestCollectionsStarterSteps(ctx: HarvestTourContext): Step[] {
  const steps = STARTER_STEP_DEFS.filter((s) => s.when === undefined || s.when(ctx));
  return steps.map(({ when: _w, id: _id, ...step }) => ({ ...step }));
}

/**
 * Returns step definitions with targets that exist in the DOM.
 * Call when starting the tour or when advancing to avoid TARGET_NOT_FOUND.
 */
export function filterTourStepsByAvailability(steps: Step[]): Step[] {
  if (typeof document === 'undefined') return [];
  return steps.filter((step) => {
    const t = step.target;
    if (typeof t === 'string') return Boolean(document.querySelector(t));
    if (t != null && typeof (t as Element).nodeType === 'number') return Boolean(t);
    return false;
  });
}

export function hasCompletedHarvestTour(userId?: string | null): boolean {
  if (typeof window === 'undefined') return false;
  const key = `${HARVEST_TOUR_STORAGE_KEYS.completed}:${userId ?? 'anonymous'}`;
  return window.localStorage.getItem(key) === 'true';
}

export function setCompletedHarvestTour(userId?: string | null): void {
  if (typeof window === 'undefined') return;
  const key = `${HARVEST_TOUR_STORAGE_KEYS.completed}:${userId ?? 'anonymous'}`;
  window.localStorage.setItem(key, 'true');
}

export function hasDismissedHarvestTour(userId?: string | null): boolean {
  if (typeof window === 'undefined') return false;
  const key = `${HARVEST_TOUR_STORAGE_KEYS.dismissed}:${userId ?? 'anonymous'}`;
  return window.localStorage.getItem(key) === 'true';
}

export function setDismissedHarvestTour(userId?: string | null): void {
  if (typeof window === 'undefined') return;
  const key = `${HARVEST_TOUR_STORAGE_KEYS.dismissed}:${userId ?? 'anonymous'}`;
  window.localStorage.setItem(key, 'true');
}

export const HARVEST_TOUR_JOYRIDE_CONFIG = {
  scrollOffset: NAVBAR_HEIGHT,
  spotlightPadding: 8,
  styles: {
    options: {
      zIndex: 10000,
      primaryColor: 'hsl(var(--primary))',
      backgroundColor: 'hsl(var(--card))',
      textColor: 'hsl(var(--foreground))',
      overlayColor: 'rgba(0, 0, 0, 0.58)',
      arrowColor: 'hsl(var(--card))',
    },
    tooltipContainer: {
      borderRadius: '12px',
      textAlign: 'left' as const,
    },
    buttonBack: {
      color: 'hsl(var(--muted-foreground))',
    },
    buttonNext: {
      borderRadius: '8px',
    },
    spotlight: {
      borderRadius: '10px',
    },
  },
  locale: {
    back: 'Back',
    close: 'Done',
    last: 'Done',
    next: 'Next',
    skip: 'Skip',
  },
};

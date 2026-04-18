/**
 * Routes that use MainLayout (company app shell) — used to scope the post-onboarding modal queue.
 */
const MAIN_APP_PATH_PREFIXES = [
  '/dashboard',
  '/app',
  '/projects',
  '/expenses',
  '/operations',
  '/inventory',
  '/harvest',
  '/suppliers',
  '/challenges',
  '/employees',
  '/reports',
  '/billing',
  '/settings',
  '/support',
  '/feedback',
  '/records',
  '/crop-stages',
  '/company',
] as const;

function matchesMainAppPath(pathname: string): boolean {
  return MAIN_APP_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export type OnboardingAppShell = 'main' | 'staff' | 'developer';

/**
 * Map URL to app shell for modal sequencing. Returns null when no post-onboarding queue runs.
 */
export function inferOnboardingShell(pathname: string): OnboardingAppShell | null {
  if (pathname.startsWith('/staff')) return 'staff';
  if (pathname.startsWith('/developer') || pathname.startsWith('/admin')) return 'developer';
  if (matchesMainAppPath(pathname)) return 'main';
  return null;
}

export type OnboardingModalId = 'whats_new' | 'app_lock' | 'product_tour' | 'notifications';

/** Highest priority first — only one modal from this queue may show at a time. */
export const ONBOARDING_MODAL_PRIORITY: OnboardingModalId[] = [
  'whats_new',
  'app_lock',
  'product_tour',
  'notifications',
];

export type GetNextOnboardingModalInput = {
  shell: OnboardingAppShell | null;
  authReady: boolean;
  userId: string | undefined;
  /**
   * True when company/workspace onboarding is incomplete (includes missing company/role or
   * `companies.onboarding_completed === false`). Mirrors RequireOnboarding / AuthContext.setupIncomplete.
   */
  setupIncomplete: boolean;
  isDeveloper: boolean;
  userRole: string | undefined;
  subscriptionLoading: boolean;
  appLockLoading: boolean;
  showAppLockFirstRun: boolean;
  whatsNewDone: boolean;
  tourDone: boolean;
  notificationsDone: boolean;
};

/**
 * First modal that should show, in priority order, or null when the queue is empty or gated off.
 */
export function getNextOnboardingModal(args: GetNextOnboardingModalInput): OnboardingModalId | null {
  const {
    shell,
    authReady,
    userId,
    setupIncomplete,
    isDeveloper,
    userRole,
    subscriptionLoading,
    appLockLoading,
    showAppLockFirstRun,
    whatsNewDone,
    tourDone,
    notificationsDone,
  } = args;

  if (!shell || !userId || !authReady) return null;

  const devBypassOnboarding = isDeveloper || userRole === 'developer';
  if (setupIncomplete && !devBypassOnboarding) return null;

  if (shell === 'main') {
    if (!whatsNewDone) {
      if (subscriptionLoading) return null;
      return 'whats_new';
    }
  }

  if (appLockLoading) return null;
  if (showAppLockFirstRun) return 'app_lock';

  if (shell === 'main' || shell === 'staff') {
    if (!tourDone) return 'product_tour';
  }

  if (!notificationsDone) return 'notifications';

  return null;
}

/** Spec alias for `getNextOnboardingModal`. */
export const getNextModal = getNextOnboardingModal;

/** Spec alias for `ONBOARDING_MODAL_PRIORITY`. */
export const modalPriority = ONBOARDING_MODAL_PRIORITY;

/** Must match `src/tour/TourProvider.tsx` */
const DASHBOARD_TOUR_DONE_PREFIX = 'farmvault:tour:dashboard-completed:v1';

/** Must match `src/tour/StaffTourProvider.tsx` */
const STAFF_TOUR_DONE_PREFIX = 'farmvault:tour:staff-completed:v1';

export function hasCompletedDashboardTour(userId?: string | null): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(`${DASHBOARD_TOUR_DONE_PREFIX}:${userId ?? 'anonymous'}`) === 'true';
}

export function hasCompletedStaffOnboardingTour(userId?: string | null): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(`${STAFF_TOUR_DONE_PREFIX}:${userId ?? 'anonymous'}`) === 'true';
}

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Joyride, { ACTIONS, EVENTS, STATUS, type CallBackProps, type Step } from 'react-joyride';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboardingModalPriorityOptional } from '@/contexts/OnboardingModalPriorityContext';
import { useEmployeeAccess } from '@/hooks/useEmployeeAccess';
import { usePermissions } from '@/hooks/usePermissions';
import { useIsMobile } from '@/hooks/use-mobile';

type StaffTourStep = Step & {
  id: string;
};

type StaffTourContextValue = {
  startTour: () => void;
  isRunning: boolean;
};

const StaffTourContext = createContext<StaffTourContextValue | undefined>(undefined);

const STAFF_TOUR_STORAGE_KEY = 'farmvault:tour:staff-completed:v1';

function hasMountedTarget(target: Step['target']): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (typeof target === 'string') return Boolean(document.querySelector(target));
  if (target && typeof (target as Element).nodeType === 'number') return Boolean(target);
  return false;
}

function getMountedSteps(stepList: StaffTourStep[]): StaffTourStep[] {
  return stepList.filter((step) => hasMountedTarget(step.target));
}

function hasCompletedStaffTour(userId?: string | null) {
  if (typeof window === 'undefined') return false;
  const key = `${STAFF_TOUR_STORAGE_KEY}:${userId ?? 'anonymous'}`;
  return window.localStorage.getItem(key) === 'true';
}

function setCompletedStaffTour(userId?: string | null) {
  if (typeof window === 'undefined') return;
  const key = `${STAFF_TOUR_STORAGE_KEY}:${userId ?? 'anonymous'}`;
  window.localStorage.setItem(key, 'true');
}

function buildBaseStaffSteps(opts: {
  canHarvest: boolean;
  canInventory: boolean;
  canExpenses: boolean;
  canOperations: boolean;
  isMobile: boolean;
}): StaffTourStep[] {
  const steps: StaffTourStep[] = [];

  steps.push({
    id: 'staff-dashboard-header',
    target: '[data-tour="staff-dashboard-header"]',
    content: 'This is your staff dashboard. It shows the key areas you can work in.',
    placement: 'bottom',
    disableBeacon: true,
  });

  if (opts.canHarvest) {
    steps.push({
      id: 'staff-card-harvest',
      target: '[data-tour="staff-card-harvest"]',
      content: 'Open Harvest Collections to record field weigh-ins and picker entries.',
      placement: 'bottom',
    });
  }
  if (opts.canInventory) {
    steps.push({
      id: 'staff-card-inventory',
      target: '[data-tour="staff-card-inventory"]',
      content: 'Inventory shows the stock areas you are allowed to manage.',
      placement: 'bottom',
    });
  }
  if (opts.canExpenses) {
    steps.push({
      id: 'staff-card-expenses',
      target: '[data-tour="staff-card-expenses"]',
      content: 'Use Expenses to view or approve costs that fall under your role.',
      placement: 'bottom',
    });
  }
  if (opts.canOperations) {
    steps.push({
      id: 'staff-card-operations',
      target: '[data-tour="staff-card-operations"]',
      content: 'Operations keeps track of work cards and assigned field work.',
      placement: 'bottom',
    });
  }

  // Nav items (sidebar + bottom nav)
  if (opts.canHarvest) {
    steps.push({
      id: 'staff-nav-harvest',
      target: '[data-tour="staff-nav-harvest"]',
      content: 'Use this navigation item to jump into Harvest Collections.',
      placement: opts.isMobile ? 'top' : 'right',
    });
  }
  if (opts.canInventory) {
    steps.push({
      id: 'staff-nav-inventory',
      target: '[data-tour="staff-nav-inventory"]',
      content: 'Inventory navigation takes you to stock and item details.',
      placement: opts.isMobile ? 'top' : 'right',
    });
  }
  if (opts.canExpenses) {
    steps.push({
      id: 'staff-nav-expenses',
      target: '[data-tour="staff-nav-expenses"]',
      content: 'Open Expenses to review or capture expense entries.',
      placement: opts.isMobile ? 'top' : 'right',
    });
  }
  if (opts.canOperations) {
    steps.push({
      id: 'staff-nav-operations',
      target: '[data-tour="staff-nav-operations"]',
      content: 'This link takes you to your Operations workspace.',
      placement: opts.isMobile ? 'top' : 'right',
    });
  }

  // Module page headers / primary actions (when user starts tour from module pages)
  if (opts.canHarvest) {
    steps.push({
      id: 'staff-harvest-header',
      target: '[data-tour="staff-harvest-header"]',
      content: 'This is the Harvest Collections workspace for recording picker intake and payments.',
      placement: 'bottom',
    });
  }
  if (opts.canInventory) {
    steps.push({
      id: 'staff-inventory-header',
      target: '[data-tour="staff-inventory-header"]',
      content: 'Inventory shows the items and inputs you are allowed to see or restock.',
      placement: 'bottom',
    });
    steps.push({
      id: 'staff-inventory-add',
      target: '[data-tour="inventory-add-item"]',
      content: 'Use this action to add a new inventory item when you have permission.',
      placement: 'bottom',
    });
  }
  if (opts.canExpenses) {
    steps.push({
      id: 'staff-expenses-header',
      target: '[data-tour="staff-expenses-header"]',
      content: 'Expenses lets you review and track costs tied to your work.',
      placement: 'bottom',
    });
    steps.push({
      id: 'staff-expenses-add',
      target: '[data-tour="staff-expenses-add"]',
      content: 'Use this button to add a new expense when authorised.',
      placement: 'bottom',
    });
  }
  if (opts.canOperations) {
    steps.push({
      id: 'staff-operations-header',
      target: '[data-tour="staff-operations-header"]',
      content: 'Operations captures daily work logs and planned work cards.',
      placement: 'bottom',
    });
    steps.push({
      id: 'staff-operations-plan-work',
      target: '[data-tour="operations-plan-work-button"]',
      content: 'Use “Plan Work” to schedule labour and inputs for upcoming days.',
      placement: 'bottom',
    });
  }

  return steps;
}

export function StaffTourProvider({ children }: { children: React.ReactNode }) {
  const { user, authReady, isAuthenticated } = useAuth();
  const modalGate = useOnboardingModalPriorityOptional();
  const autoRunKeyRef = useRef<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { effectivePermissionKeys } = useEmployeeAccess();
  const { can } = usePermissions();

  const [isRunning, setIsRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [pendingStart, setPendingStart] = useState(false);
  const [activeSteps, setActiveSteps] = useState<StaffTourStep[]>([]);

  const startTourRaw = useCallback(() => {
    setIsRunning(false);
    setActiveSteps([]);
    setStepIndex(0);
    setPendingStart(true);

    if (!location.pathname.startsWith('/staff')) {
      navigate('/staff');
    }
  }, [location.pathname, navigate]);

  const startTour = useCallback(() => {
    if (modalGate?.activeModal != null) return;
    if (modalGate?.blockingNonTourModal) return;
    startTourRaw();
  }, [modalGate?.activeModal, modalGate?.blockingNonTourModal, startTourRaw]);

  const stopTour = useCallback(() => {
    setIsRunning(false);
    setPendingStart(false);
    setActiveSteps([]);
    setStepIndex(0);
  }, []);

  const canHarvest =
    effectivePermissionKeys.has('harvest.view') ||
    effectivePermissionKeys.has('harvest_collections.view');
  const canInventory = effectivePermissionKeys.has('inventory.view') || can('inventory', 'view');
  const canExpenses =
    effectivePermissionKeys.has('expenses.view') ||
    effectivePermissionKeys.has('expenses.approve') ||
    can('expenses', 'view');
  const canOperations = effectivePermissionKeys.has('operations.view') || can('operations', 'view');

  const baseSteps = useMemo(
    () =>
      buildBaseStaffSteps({
        canHarvest,
        canInventory,
        canExpenses,
        canOperations,
        isMobile,
      }),
    [canHarvest, canInventory, canExpenses, canOperations, isMobile],
  );

  const joyrideSteps = useMemo<Step[]>(
    () => activeSteps.map(({ id: _id, ...step }) => step),
    [activeSteps],
  );

  useEffect(() => {
    if (!pendingStart) return;

    if (!location.pathname.startsWith('/staff')) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 25;
    const retryDelayMs = 140;

    const tryStart = () => {
      if (cancelled) return;

      const mounted = getMountedSteps(baseSteps);
      if (mounted.length > 0) {
        setActiveSteps(mounted);
        setStepIndex(0);
        setPendingStart(false);
        setIsRunning(true);

        if (import.meta.env.DEV && user) {
          // eslint-disable-next-line no-console
          console.log('[StaffTour] starting tour', {
            uid: user.id,
            totalSteps: mounted.length,
            stepIds: mounted.map((s) => s.id),
          });
        }
        return;
      }

      attempts += 1;
      if (attempts >= maxAttempts) {
        setPendingStart(false);
        setIsRunning(false);
        setActiveSteps([]);
        return;
      }

      window.setTimeout(tryStart, retryDelayMs);
    };

    const timer = window.setTimeout(tryStart, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pendingStart, baseSteps, location.pathname, user]);

  useEffect(() => {
    if (!isRunning || pendingStart) return;

    const mounted = getMountedSteps(baseSteps);
    if (mounted.length === 0) {
      stopTour();
      return;
    }

    setActiveSteps(mounted);
    setStepIndex((prev) => Math.min(prev, mounted.length - 1));
  }, [isRunning, pendingStart, baseSteps, stopTour]);

  const handleJoyrideCallback = useCallback(
    (data: CallBackProps) => {
      const { action, index = 0, status, type } = data;

      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        setCompletedStaffTour(user?.id);
        modalGate?.completeOnboardingModal('product_tour');
        stopTour();
        return;
      }

      if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
        const mounted = getMountedSteps(baseSteps);
        if (mounted.length === 0) {
          stopTour();
          return;
        }

        setActiveSteps(mounted);
        const delta = action === ACTIONS.PREV ? -1 : 1;
        const nextIndex = index + delta;

        if (nextIndex < 0) {
          setStepIndex(0);
          return;
        }

        if (nextIndex >= mounted.length) {
          setCompletedStaffTour(user?.id);
          modalGate?.completeOnboardingModal('product_tour');
          stopTour();
          return;
        }

        setStepIndex(nextIndex);
      }
    },
    [baseSteps, modalGate, stopTour, user?.id],
  );

  useEffect(() => {
    if (!user?.id) {
      autoRunKeyRef.current = null;
      return;
    }

    if (!authReady || !isAuthenticated) {
      return;
    }

    if (hasCompletedStaffTour(user.id)) return;

    if (modalGate == null) {
      return;
    }

    if (modalGate.activeShell !== 'staff') return;
    if (modalGate.resolvedModal !== 'product_tour') return;

    if (!location.pathname.startsWith('/staff')) return;

    const autoRunKey = `${user.id}:staff-tour`;
    if (autoRunKeyRef.current === autoRunKey) {
      return;
    }

    autoRunKeyRef.current = autoRunKey;
    startTourRaw();
  }, [
    authReady,
    isAuthenticated,
    location.pathname,
    modalGate,
    startTourRaw,
    user?.id,
  ]);

  const contextValue = useMemo(
    () => ({
      startTour,
      isRunning,
    }),
    [isRunning, startTour],
  );

  if (import.meta.env.DEV && user && activeSteps.length > 0) {
    // eslint-disable-next-line no-console
    console.log('[StaffTour] active steps snapshot', {
      uid: user.id,
      stepIndex,
      total: activeSteps.length,
      ids: activeSteps.map((s) => s.id),
    });
  }

  return (
    <StaffTourContext.Provider value={contextValue}>
      {children}
      <Joyride
        steps={joyrideSteps}
        run={isRunning && !pendingStart && joyrideSteps.length > 0 && stepIndex < joyrideSteps.length}
        stepIndex={stepIndex}
        callback={handleJoyrideCallback}
        continuous
        showProgress
        showSkipButton
        disableOverlayClose
        scrollToFirstStep
        disableScrollParentFix={false}
        scrollOffset={64}
        spotlightPadding={8}
        floaterProps={{
          offset: 64,
          disableAnimation: false,
        }}
        locale={{
          back: 'Back',
          close: 'Done',
          last: 'Done',
          next: 'Next',
          skip: 'Skip',
        }}
        styles={{
          options: {
            zIndex: 11000,
            primaryColor: 'hsl(var(--primary))',
            backgroundColor: 'hsl(var(--card))',
            textColor: 'hsl(var(--foreground))',
            overlayColor: 'rgba(0, 0, 0, 0.58)',
            arrowColor: 'hsl(var(--card))',
          },
          tooltipContainer: {
            borderRadius: '12px',
            textAlign: 'left',
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
        }}
      />
    </StaffTourContext.Provider>
  );
}

export function useStaffTour(): StaffTourContextValue {
  const ctx = useContext(StaffTourContext);
  if (!ctx) {
    throw new Error('useStaffTour must be used within a StaffTourProvider');
  }
  return ctx;
}


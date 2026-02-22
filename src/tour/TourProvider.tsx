import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Joyride, {
  ACTIONS,
  EVENTS,
  STATUS,
  CallBackProps,
  Step,
} from "react-joyride";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";

type DashboardTourStep = Step & {
  id: string;
  route: "/dashboard";
  placement?: Step["placement"];
};

type TourContextValue = {
  startTour: () => void;
  isRunning: boolean;
};

const TourContext = createContext<TourContextValue | undefined>(undefined);

const TOUR_COMPLETED_STORAGE_PREFIX = "farmvault:tour:dashboard-completed:v1";

const baseDashboardSteps: DashboardTourStep[] = [
  {
    id: "dashboard-title",
    route: "/dashboard",
    target: '[data-tour="dashboard-title"]',
    content: "This is your FarmVault dashboard. It gives a quick view of farm performance.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    id: "project-selector",
    route: "/dashboard",
    target: '[data-tour="dashboard-project-selector"]',
    content: "Use this selector to switch between projects or view all projects together.",
    placement: "bottom",
  },
  {
    id: "new-operations-button",
    route: "/dashboard",
    target: '[data-tour="new-operation-button"]',
    content: "Quick Access opens shortcuts for recording work, expenses, inventory, and harvest actions.",
    placement: "bottom",
  },
  {
    id: "expenses-summary-card",
    route: "/dashboard",
    target: '[data-tour="expenses-summary-card"]',
    content: "This card tracks your total expenses so you can control spend across projects.",
  },
  {
    id: "profit-loss-card",
    route: "/dashboard",
    target: '[data-tour="profit-loss-card"]',
    content: "Monitor profit and loss here to understand your current financial position.",
  },
  {
    id: "inventory-overview",
    route: "/dashboard",
    target: '[data-tour="inventory-overview"]',
    content: "Inventory Overview helps you track available stock and category-level value.",
  },
  {
    id: "recent-transactions",
    route: "/dashboard",
    target: '[data-tour="recent-transactions"]',
    content: "Recent Transactions lists your latest sales and expenses for quick auditing.",
  },
];

const mobileBottomNavStep: DashboardTourStep = {
  id: "mobile-bottom-navigation",
  route: "/dashboard",
  target: '[data-tour="bottom-navigation"]',
  content: "On mobile, use Bottom Navigation for fast movement between key pages.",
  placement: "top",
};

const desktopTourRestartStep: DashboardTourStep = {
  id: "dashboard-restart-tour",
  route: "/dashboard",
  target: '[data-tour="dashboard-take-tour"]',
  content: "You can restart this guided tour anytime from this button.",
  placement: "left",
};

function hasMountedTarget(target: Step["target"]): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  if (typeof target === "string") {
    return Boolean(document.querySelector(target));
  }

  if (target && typeof (target as Element).nodeType === "number") {
    return Boolean(target);
  }

  return false;
}

function getMountedSteps(stepList: DashboardTourStep[]): DashboardTourStep[] {
  return stepList.filter((step) => hasMountedTarget(step.target));
}

function getStorageKey(userId?: string | null) {
  return `${TOUR_COMPLETED_STORAGE_PREFIX}:${userId ?? "anonymous"}`;
}

function hasCompletedTour(userId?: string | null) {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(getStorageKey(userId)) === "true";
}

function setCompletedTour(userId?: string | null) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getStorageKey(userId), "true");
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, authReady } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  const [isRunning, setIsRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [pendingStart, setPendingStart] = useState(false);
  const [activeSteps, setActiveSteps] = useState<DashboardTourStep[]>([]);

  const autoRunKeyRef = useRef<string | null>(null);

  const steps = useMemo<DashboardTourStep[]>(
    () => [...baseDashboardSteps, isMobile ? mobileBottomNavStep : desktopTourRestartStep],
    [isMobile],
  );

  const joyrideSteps = useMemo<Step[]>(
    () => activeSteps.map(({ route: _route, id: _id, ...step }) => step),
    [activeSteps],
  );

  const stopTour = useCallback(() => {
    setIsRunning(false);
    setPendingStart(false);
    setActiveSteps([]);
    setStepIndex(0);
  }, []);

  const startTour = useCallback(() => {
    const firstRoute = steps[0]?.route ?? "/dashboard";
    setIsRunning(false);
    setActiveSteps([]);
    setStepIndex(0);
    setPendingStart(true);

    if (location.pathname !== firstRoute) {
      navigate(firstRoute);
    }
  }, [location.pathname, navigate, steps]);

  useEffect(() => {
    if (!pendingStart) return;

    const firstRoute = steps[0]?.route ?? "/dashboard";
    if (location.pathname !== firstRoute) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 30;
    const retryDelayMs = 150;

    const tryStart = () => {
      if (cancelled) return;

      const mountedSteps = getMountedSteps(steps);
      if (mountedSteps.length > 0) {
        setActiveSteps(mountedSteps);
        setStepIndex(0);
        setPendingStart(false);
        setIsRunning(true);
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
  }, [location.pathname, pendingStart, steps]);

  useEffect(() => {
    if (!isRunning || pendingStart) return;

    const mountedSteps = getMountedSteps(steps);
    if (mountedSteps.length === 0) {
      stopTour();
      return;
    }

    setActiveSteps(mountedSteps);
    setStepIndex((prev) => Math.min(prev, mountedSteps.length - 1));
  }, [isRunning, pendingStart, steps, stopTour]);

  useEffect(() => {
    if (!user?.id) {
      autoRunKeyRef.current = null;
      stopTour();
      return;
    }

    if (!authReady || !isAuthenticated) {
      return;
    }

    const autoRunKey = `${user.id}:dashboard-tour`;
    if (autoRunKeyRef.current === autoRunKey) {
      return;
    }
    autoRunKeyRef.current = autoRunKey;

    if (!hasCompletedTour(user.id)) {
      startTour();
    }
  }, [authReady, isAuthenticated, startTour, stopTour, user?.id]);

  const handleJoyrideCallback = useCallback(
    (data: CallBackProps) => {
      const { action, index = 0, status, type } = data;

      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        setCompletedTour(user?.id);
        stopTour();
        return;
      }

      if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
        const mountedSteps = getMountedSteps(steps);
        if (mountedSteps.length === 0) {
          stopTour();
          return;
        }

        setActiveSteps(mountedSteps);
        const delta = action === ACTIONS.PREV ? -1 : 1;
        const nextIndex = index + delta;

        if (nextIndex < 0) {
          setStepIndex(0);
          return;
        }

        if (nextIndex >= mountedSteps.length) {
          setCompletedTour(user?.id);
          stopTour();
          return;
        }

        setStepIndex(nextIndex);
      }
    },
    [steps, stopTour, user?.id],
  );

  const contextValue = useMemo(
    () => ({
      startTour,
      isRunning,
    }),
    [isRunning, startTour],
  );

  return (
    <TourContext.Provider value={contextValue}>
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
        locale={{
          back: "Back",
          close: "Done",
          last: "Done",
          next: "Next",
          skip: "Skip",
        }}
        styles={{
          options: {
            zIndex: 1200,
            primaryColor: "hsl(var(--primary))",
            backgroundColor: "hsl(var(--card))",
            textColor: "hsl(var(--foreground))",
            overlayColor: "rgba(0, 0, 0, 0.58)",
            arrowColor: "hsl(var(--card))",
          },
          tooltipContainer: {
            borderRadius: "12px",
            textAlign: "left",
          },
          buttonBack: {
            color: "hsl(var(--muted-foreground))",
          },
          buttonNext: {
            borderRadius: "8px",
          },
          spotlight: {
            borderRadius: "10px",
          },
        }}
      />
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error("useTour must be used within TourProvider");
  }
  return context;
}

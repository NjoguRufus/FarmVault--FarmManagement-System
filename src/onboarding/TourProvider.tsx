import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Joyride, { ACTIONS, CallBackProps, EVENTS, STATUS } from "@/onboarding/JoyrideShim";
import { useLocation, useNavigate } from "react-router-dom";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { db } from "@/lib/firebase";
import { AppTourStep, getTourSteps, TourRole } from "@/onboarding/tours";

type TourCompletionState = Record<TourRole, boolean>;

type TourContextValue = {
  startTour: () => void;
  isRunning: boolean;
};

const TourContext = createContext<TourContextValue | undefined>(undefined);

const EMPTY_COMPLETION: TourCompletionState = {
  admin: false,
  manager: false,
  broker: false,
};

const getLocalStorageKey = (uid: string, role: TourRole) => `tourCompleted.${role}.${uid}`;

const readLocalCompletion = (uid: string): TourCompletionState => {
  if (typeof window === "undefined") {
    return EMPTY_COMPLETION;
  }

  return {
    admin: localStorage.getItem(getLocalStorageKey(uid, "admin")) === "true",
    manager: localStorage.getItem(getLocalStorageKey(uid, "manager")) === "true",
    broker: localStorage.getItem(getLocalStorageKey(uid, "broker")) === "true",
  };
};

const writeLocalCompletion = (uid: string, role: TourRole) => {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(getLocalStorageKey(uid, role), "true");
};

const mapUserToTourRole = (user: any): TourRole | null => {
  if (!user) return null;

  if (user.role === "company-admin" || user.role === "company_admin") {
    return "admin";
  }

  if (
    user.role === "manager" ||
    user.employeeRole === "operations-manager" ||
    user.employeeRole === "manager"
  ) {
    return "manager";
  }

  if (
    user.role === "broker" ||
    user.employeeRole === "sales-broker" ||
    user.employeeRole === "broker"
  ) {
    return "broker";
  }

  return null;
};

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [completion, setCompletion] = useState<TourCompletionState>(EMPTY_COMPLETION);
  const [completionLoaded, setCompletionLoaded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<AppTourStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [isRouteChanging, setIsRouteChanging] = useState(false);
  const [activeRole, setActiveRole] = useState<TourRole | null>(null);

  const autoRunKeyRef = useRef<string | null>(null);
  const pendingRouteRef = useRef<string | null>(null);

  const currentRole = useMemo(() => mapUserToTourRole(user), [user]);

  const finishTour = useCallback(
    async (completed: boolean) => {
      const roleToPersist = activeRole;
      const userId = user?.id;

      setIsRunning(false);
      setSteps([]);
      setStepIndex(0);
      setIsRouteChanging(false);
      pendingRouteRef.current = null;

      if (!completed || !roleToPersist || !userId) {
        return;
      }

      setCompletion((prev) => ({ ...prev, [roleToPersist]: true }));
      writeLocalCompletion(userId, roleToPersist);

      try {
        await setDoc(
          doc(db, "users", userId),
          {
            tourCompleted: {
              [roleToPersist]: true,
            },
          },
          { merge: true },
        );
      } catch {
        // Fallback is already written locally.
      }

      toast.success("Tour completed");
    },
    [activeRole, user?.id],
  );

  const startTourForRole = useCallback(
    (role: TourRole) => {
      const isMobileViewport =
        typeof window !== "undefined" ? window.innerWidth < 768 : isMobile;
      const device = isMobileViewport ? "mobile" : "desktop";
      const roleSteps = getTourSteps(role, device);

      if (!roleSteps.length) {
        return;
      }

      setActiveRole(role);
      setSteps(roleSteps);
      setStepIndex(0);
      setIsRunning(true);
      setIsRouteChanging(location.pathname !== roleSteps[0].route);
      pendingRouteRef.current = null;
    },
    [isMobile, location.pathname],
  );

  const startTour = useCallback(() => {
    if (!currentRole) return;
    startTourForRole(currentRole);
  }, [currentRole, startTourForRole]);

  useEffect(() => {
    if (!user?.id) {
      setCompletion(EMPTY_COMPLETION);
      setCompletionLoaded(true);
      autoRunKeyRef.current = null;
      setIsRunning(false);
      setSteps([]);
      setStepIndex(0);
      return;
    }

    let cancelled = false;

    const loadCompletion = async () => {
      setCompletionLoaded(false);
      const local = readLocalCompletion(user.id);

      try {
        const snap = await getDoc(doc(db, "users", user.id));
        if (!cancelled && snap.exists()) {
          const remote = (snap.data() as any)?.tourCompleted ?? {};
          const merged: TourCompletionState = {
            admin: Boolean(remote.admin) || local.admin,
            manager: Boolean(remote.manager) || local.manager,
            broker: Boolean(remote.broker) || local.broker,
          };
          setCompletion(merged);
        } else if (!cancelled) {
          setCompletion(local);
        }
      } catch {
        if (!cancelled) {
          setCompletion(local);
        }
      } finally {
        if (!cancelled) {
          setCompletionLoaded(true);
        }
      }
    };

    loadCompletion();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !currentRole || !completionLoaded) {
      return;
    }

    const key = `${user.id}:${currentRole}`;
    if (autoRunKeyRef.current === key) {
      return;
    }
    autoRunKeyRef.current = key;

    if (!completion[currentRole]) {
      startTourForRole(currentRole);
    }
  }, [user?.id, currentRole, completionLoaded, completion, startTourForRole]);

  useEffect(() => {
    if (!isRunning || steps.length === 0) {
      return;
    }

    const step = steps[stepIndex];
    if (!step) {
      return;
    }

    if (location.pathname !== step.route) {
      setIsRouteChanging(true);
      if (pendingRouteRef.current !== step.route) {
        pendingRouteRef.current = step.route;
        navigate(step.route, { replace: true });
      }
      return;
    }

    pendingRouteRef.current = null;
    if (isRouteChanging) {
      const timer = window.setTimeout(() => {
        setIsRouteChanging(false);
      }, step.routeLoadDelayMs ?? 350);

      return () => window.clearTimeout(timer);
    }
  }, [isRunning, steps, stepIndex, location.pathname, navigate, isRouteChanging]);

  const onJoyrideCallback = useCallback(
    (data: CallBackProps) => {
      const { action, index, status, type } = data;

      if (status === STATUS.FINISHED) {
        void finishTour(true);
        return;
      }

      if (status === STATUS.SKIPPED) {
        void finishTour(false);
        return;
      }

      if (type === EVENTS.TARGET_NOT_FOUND) {
        const delta = action === ACTIONS.PREV ? -1 : 1;
        setStepIndex((prev) => {
          const next = prev + delta;
          if (next < 0) return 0;
          if (next >= steps.length) {
            void finishTour(true);
            return prev;
          }
          return next;
        });
        return;
      }

      if (type === EVENTS.STEP_AFTER) {
        const delta = action === ACTIONS.PREV ? -1 : 1;
        const next = index + delta;
        if (next < 0) {
          setStepIndex(0);
          return;
        }
        if (next >= steps.length) {
          void finishTour(true);
          return;
        }
        setStepIndex(next);
      }
    },
    [finishTour, steps.length],
  );

  const contextValue = useMemo(
    () => ({
      startTour,
      isRunning,
    }),
    [startTour, isRunning],
  );

  return (
    <TourContext.Provider value={contextValue}>
      {children}
      <Joyride
        steps={steps}
        run={isRunning && !isRouteChanging}
        stepIndex={stepIndex}
        callback={onJoyrideCallback}
        continuous
        showProgress
        showSkipButton
        scrollToFirstStep
        disableOverlayClose
        locale={{
          back: "Back",
          close: "Done",
          last: "Done",
          next: "Next",
          skip: "Skip",
          nextLabelWithProgress: "Next (Step {step} of {steps})",
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
          tooltipTitle: {
            fontSize: "15px",
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

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLock } from '@/hooks/useAppLock';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { NewFeatureModal } from '@/components/modals/NewFeatureModal';
import { AppLockPrompt } from '@/components/auth/AppLockPrompt';
import { NotificationSetupModal } from '@/components/notifications/NotificationSetupModal';
import {
  markAppLockAnnouncementSeen,
  hasSeenAppLockAnnouncement,
} from '@/lib/featureFlags/featureAnnouncements';
import {
  inferOnboardingShell,
  hasCompletedDashboardTour,
  hasCompletedStaffOnboardingTour,
  getNextOnboardingModal,
  ONBOARDING_MODAL_PRIORITY,
  type OnboardingAppShell,
  type OnboardingModalId,
} from '@/lib/onboardingModalPriority';

export type { OnboardingAppShell, OnboardingModalId };
export { ONBOARDING_MODAL_PRIORITY };

const NOTIFICATIONS_REVEAL_MS = 3000;

export type OnboardingModalPriorityContextValue = {
  activeShell: OnboardingAppShell | null;
  /** Latched modal id (usually null); see `resolvedModal` for what is actually shown. */
  activeModal: OnboardingModalId | null;
  /** Single source of truth: `activeModal || getNextModal()`. */
  resolvedModal: OnboardingModalId | null;
  /** True when a dialog (non-tour) is blocking the queue. */
  blockingNonTourModal: boolean;
  /** Persist step completion and advance the queue. */
  completeOnboardingModal: (id: OnboardingModalId) => void;
  /** Clear transient UI state and re-resolve the next modal. */
  setActiveModal: (id: OnboardingModalId | null) => void;
};

const OnboardingModalPriorityContext = createContext<OnboardingModalPriorityContextValue | null>(
  null,
);

function OnboardingModalQueueHost({
  resolvedModal,
  completeOnboardingModal,
  setActiveModal,
}: {
  resolvedModal: OnboardingModalId | null;
  completeOnboardingModal: (id: OnboardingModalId) => void;
  setActiveModal: (id: OnboardingModalId | null) => void;
}) {
  const navigate = useNavigate();
  const subscriptionStatus = useSubscriptionStatus();
  const { markPromptSeen, enableNotifications, shouldShowPrompt } = useNotificationPreferences();

  const isProEligible =
    subscriptionStatus.plan === 'pro' &&
    (subscriptionStatus.status === 'active' ||
      subscriptionStatus.status === 'grace' ||
      subscriptionStatus.isOverrideActive);

  const [notificationsReveal, setNotificationsReveal] = useState(false);

  useEffect(() => {
    if (resolvedModal !== 'notifications') {
      setNotificationsReveal(false);
      return;
    }
    const t = window.setTimeout(() => setNotificationsReveal(true), NOTIFICATIONS_REVEAL_MS);
    return () => window.clearTimeout(t);
  }, [resolvedModal]);

  const handleWhatsNewOpenChange = (open: boolean) => {
    if (!open) {
      completeOnboardingModal('whats_new');
    }
  };

  const handleWhatsNewPrimary = () => {
    if (isProEligible) {
      navigate('/settings', { state: { focusAppLock: true, feature: 'app-lock' } });
    } else {
      navigate('/billing?feature=app-lock');
    }
    completeOnboardingModal('whats_new');
  };

  return (
    <>
      <NewFeatureModal
        open={resolvedModal === 'whats_new'}
        onOpenChange={handleWhatsNewOpenChange}
        isProEligible={isProEligible}
        onPrimary={handleWhatsNewPrimary}
      />

      {resolvedModal === 'app_lock' ? (
        <AppLockPrompt
          onComplete={() => {
            completeOnboardingModal('app_lock');
          }}
          onSkip={() => {
            completeOnboardingModal('app_lock');
          }}
        />
      ) : null}

      <NotificationSetupModal
        open={resolvedModal === 'notifications' && notificationsReveal && shouldShowPrompt}
        onOpenChange={(open) => {
          if (!open) {
            markPromptSeen();
            setActiveModal(null);
          }
        }}
        onEnable={async (sound) => {
          await enableNotifications(sound);
          setActiveModal(null);
        }}
        onSkip={() => {
          markPromptSeen();
          setActiveModal(null);
        }}
      />
    </>
  );
}

export function OnboardingModalPriorityProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, authReady, setupIncomplete, isDeveloper } = useAuth();
  const subscriptionStatus = useSubscriptionStatus();
  const { isLoading: appLockLoading, showPrompt: showAppLockFirstRun, refresh: refreshAppLock } =
    useAppLock();
  const { shouldShowPrompt } = useNotificationPreferences();

  const [revision, setRevision] = useState(0);
  const [activeModal, setActiveModalState] = useState<OnboardingModalId | null>(null);

  const bump = useCallback(() => setRevision((r) => r + 1), []);

  /** Clearing to `null` bumps the queue so the next modal can resolve after flags update. */
  const setActiveModal = useCallback(
    (id: OnboardingModalId | null) => {
      setActiveModalState(id);
      if (id === null) {
        bump();
      }
    },
    [bump],
  );

  const shell = useMemo(() => inferOnboardingShell(location.pathname), [location.pathname]);

  const whatsNewDone = hasSeenAppLockAnnouncement();

  const tourDone = useMemo(() => {
    if (shell === 'main') return hasCompletedDashboardTour(user?.id);
    if (shell === 'staff') return hasCompletedStaffOnboardingTour(user?.id);
    return true;
  }, [shell, user?.id, revision]);

  const notificationsDone = !shouldShowPrompt;

  const nextModal = useMemo(() => {
    void revision;
    return getNextOnboardingModal({
      shell,
      authReady,
      userId: user?.id,
      setupIncomplete,
      isDeveloper,
      userRole: user?.role,
      subscriptionLoading: subscriptionStatus.isLoading,
      appLockLoading,
      showAppLockFirstRun,
      whatsNewDone,
      tourDone,
      notificationsDone,
    });
  }, [
    revision,
    shell,
    authReady,
    user?.id,
    setupIncomplete,
    isDeveloper,
    user?.role,
    subscriptionStatus.isLoading,
    appLockLoading,
    showAppLockFirstRun,
    whatsNewDone,
    tourDone,
    notificationsDone,
  ]);

  const resolvedModal = activeModal || nextModal;

  const completeOnboardingModal = useCallback(
    (id: OnboardingModalId) => {
      setActiveModalState(null);
      if (id === 'whats_new') markAppLockAnnouncementSeen();
      bump();
      if (id === 'app_lock') void refreshAppLock();
    },
    [bump, refreshAppLock],
  );

  const blockingNonTourModal =
    resolvedModal !== null && resolvedModal !== 'product_tour';

  const value = useMemo<OnboardingModalPriorityContextValue>(
    () => ({
      activeShell: shell,
      activeModal,
      resolvedModal,
      blockingNonTourModal,
      completeOnboardingModal,
      setActiveModal,
    }),
    [shell, activeModal, resolvedModal, blockingNonTourModal, completeOnboardingModal, setActiveModal],
  );

  return (
    <OnboardingModalPriorityContext.Provider value={value}>
      {children}
      <OnboardingModalQueueHost
        resolvedModal={resolvedModal}
        completeOnboardingModal={completeOnboardingModal}
        setActiveModal={setActiveModal}
      />
    </OnboardingModalPriorityContext.Provider>
  );
}

export function useOnboardingModalPriority(): OnboardingModalPriorityContextValue {
  const ctx = useContext(OnboardingModalPriorityContext);
  if (!ctx) {
    throw new Error('useOnboardingModalPriority must be used within OnboardingModalPriorityProvider');
  }
  return ctx;
}

export function useOnboardingModalPriorityOptional(): OnboardingModalPriorityContextValue | null {
  return useContext(OnboardingModalPriorityContext);
}

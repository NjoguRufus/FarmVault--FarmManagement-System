import React, { useCallback, useMemo, useState } from 'react';
import { Sprout } from 'lucide-react';
import {
  clearPostOnboardingFirstProjectWelcomeFlag,
  clearPostOnboardingProTrialWelcomeFlag,
  hasPostOnboardingFirstProjectWelcomeFlag,
  hasPostOnboardingProTrialWelcomeFlag,
  readPostOnboardingProTrialCompanyName,
} from '@/lib/postOnboardingProjectWelcome';
import { SetupNoticePopup } from '@/components/layout/SetupNoticePopup';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';

/**
 * One-time welcome after Pro trial activation and/or first project save from onboarding.
 */
export function PostOnboardingProjectWelcomeBanner() {
  const { daysRemaining, isTrial } = useSubscriptionStatus();
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      hasPostOnboardingProTrialWelcomeFlag() || hasPostOnboardingFirstProjectWelcomeFlag()
    );
  });

  const trialFirst = useMemo(
    () => typeof window !== 'undefined' && hasPostOnboardingProTrialWelcomeFlag(),
    [],
  );
  const companyLabel = useMemo(() => readPostOnboardingProTrialCompanyName(), []);

  const dismiss = useCallback(() => {
    clearPostOnboardingProTrialWelcomeFlag();
    clearPostOnboardingFirstProjectWelcomeFlag();
    setVisible(false);
  }, []);

  if (!visible) return null;

  if (trialFirst) {
    const days =
      isTrial && typeof daysRemaining === 'number' && daysRemaining >= 0
        ? daysRemaining
        : null;
    return (
      <SetupNoticePopup open tone="emerald" title="Pro trial active" icon={Sprout} onDismiss={dismiss}>
        <p className="font-semibold">
          {companyLabel
            ? `Welcome, ${companyLabel} — registered`
            : 'Welcome — your workspace is registered'}
        </p>
        <p className="mt-1 text-emerald-900/95 dark:text-emerald-100/90">
          Your workspace is on an active Pro trial with full access to Pro analytics and features.
          {days !== null ? (
            <>
              {' '}
              <span className="font-medium">
                {days} day{days === 1 ? '' : 's'} remaining.
              </span>
            </>
          ) : null}
        </p>
      </SetupNoticePopup>
    );
  }

  return (
    <SetupNoticePopup open tone="emerald" title="Project saved" icon={Sprout} onDismiss={dismiss}>
      <p className="font-semibold">Your first project is saved</p>
      <p className="mt-1 text-emerald-900/95 dark:text-emerald-100/90">
        You can keep building in FarmVault with your active Pro trial. Use the header countdown to see how many days
        are left.
      </p>
    </SetupNoticePopup>
  );
}

import React, { useCallback, useState } from 'react';
import { Sprout } from 'lucide-react';
import {
  clearPostOnboardingFirstProjectWelcomeFlag,
  hasPostOnboardingFirstProjectWelcomeFlag,
} from '@/lib/postOnboardingProjectWelcome';
import { SetupNoticePopup } from '@/components/layout/SetupNoticePopup';

/**
 * Shown once after saving the first project from onboarding (before dismiss).
 * Floating popup — auto-dismiss ~5s or manual close; does not use a full-width fixed bar.
 */
export function PostOnboardingProjectWelcomeBanner() {
  const [visible, setVisible] = useState(() =>
    typeof window !== 'undefined' && hasPostOnboardingFirstProjectWelcomeFlag(),
  );

  const dismiss = useCallback(() => {
    clearPostOnboardingFirstProjectWelcomeFlag();
    setVisible(false);
  }, []);

  return (
    <SetupNoticePopup open={visible} onDismiss={dismiss} tone="emerald" title="Your farm is being prepared" icon={Sprout}>
      <p className="font-semibold">Your farm is being prepared</p>
      <p className="mt-1 text-emerald-900/95 dark:text-emerald-100/90">
        Your first project is saved and ready. You can start using FarmVault as we finalize your setup. Our team will
        review your farm shortly. In the meantime, feel free to continue exploring the system.
      </p>
      <p className="mt-1.5 text-xs text-emerald-800/80 dark:text-emerald-200/75">
        Some features may be unlocked after approval.
      </p>
    </SetupNoticePopup>
  );
}

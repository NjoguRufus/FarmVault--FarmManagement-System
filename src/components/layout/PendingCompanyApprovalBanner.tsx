import React, { useCallback, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { hasPostOnboardingFirstProjectWelcomeFlag } from '@/lib/postOnboardingProjectWelcome';
import { SetupNoticePopup } from '@/components/layout/SetupNoticePopup';
import { useCompanyWorkspaceApprovalStatus } from '@/hooks/useCompanyWorkspaceApprovalStatus';

/**
 * Soft notice while core.companies.status is pending (admin has not finished approval yet).
 * Uses get_my_company_workspace_status — not the subscription gate row shape.
 */
export function PendingCompanyApprovalBanner() {
  const { user } = useAuth();
  const isDeveloper = user?.role === 'developer';
  const [dismissed, setDismissed] = useState(false);
  const { isWorkspacePending, isLoading } = useCompanyWorkspaceApprovalStatus();

  const dismiss = useCallback(() => setDismissed(true), []);

  if (isDeveloper || !user?.companyId || dismissed) return null;
  if (hasPostOnboardingFirstProjectWelcomeFlag()) return null;
  if (isLoading || !isWorkspacePending) return null;

  return (
    <SetupNoticePopup open tone="rose" title="Workspace pending approval" icon={Sparkles} onDismiss={dismiss}>
      <p className="font-semibold">Your farm is being prepared</p>
      <p className="mt-1 text-rose-900/95 dark:text-rose-100/90">
        You can start using FarmVault as we finalize your setup. Our team will review your farm shortly. In the meantime,
        feel free to continue exploring the system.
      </p>
      <p className="mt-1.5 text-xs text-rose-800/80 dark:text-rose-200/75">Some features may be unlocked after approval.</p>
    </SetupNoticePopup>
  );
}

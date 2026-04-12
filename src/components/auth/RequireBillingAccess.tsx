import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';
import { resolveStaffShellEntryOrHome } from '@/lib/access/effectiveAccess';
import AccessRestrictedPage from '@/pages/AccessRestrictedPage';

/**
 * Billing (subscriptions, STK, receipts) is restricted to company administrators
 * and platform developers — not staff who only have generic settings.view.
 */
export function RequireBillingAccess({ children }: { children: React.ReactElement }) {
  const { authReady, user, effectiveAccess } = useAuth();
  const { isDeveloper, isCompanyAdmin } = usePermissions();

  if (!authReady) {
    return <AuthLoadingScreen />;
  }

  if (isDeveloper || isCompanyAdmin) {
    return children;
  }

  if (user?.role === 'employee') {
    return <Navigate to={resolveStaffShellEntryOrHome(effectiveAccess.landingPage)} replace />;
  }

  return <AccessRestrictedPage />;
}

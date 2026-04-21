import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { BottomNav } from './BottomNav';
import { TopNavbar } from './TopNavbar';
import { PaymentReminderBanner } from './PaymentReminderBanner';
import { PostOnboardingProjectWelcomeBanner } from './PostOnboardingProjectWelcomeBanner';
import { OfflineSyncBanner } from '@/components/status/OfflineSyncBanner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { EMERGENCY_ALLOWED_PREFIXES } from '@/config/emergencyAccess';
import { useAdminAlertsRealtime } from '@/hooks/useAdminAlertsRealtime';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';
import { PostTrialPlanModal } from '@/components/subscription/PostTrialPlanModal';
import { useCompanySubscriptionRealtime } from '@/hooks/useCompanySubscriptionRealtime';
import { useFarmerInboxBellSync } from '@/hooks/useFarmerInboxBellSync';
import { logger } from "@/lib/logger";
import { useAmbassadorAccess } from '@/contexts/AmbassadorAccessContext';
import { brokerMayAccessNavPath } from '@/lib/brokerNav';
import { usePlan } from '@/contexts/PlanContext';

export function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, isEmergencySession, effectiveAccess } = useAuth();
  const { workspaceMode } = useAmbassadorAccess();
  const { trialExpiredNeedsPlan, isLoading: subscriptionLoading } = useSubscriptionStatus();
  const plan = usePlan();
  const isDeveloper = user?.role === 'developer';
  useCompanySubscriptionRealtime(user?.companyId, Boolean(user?.companyId && !isDeveloper));
  useFarmerInboxBellSync(user ?? null, user?.companyId ?? null, user?.id ?? null);
  const isCompanyAdmin =
    user?.role === 'company-admin' || (user as { role?: string } | null)?.role === 'company_admin';
  const location = useLocation();
  const navigate = useNavigate();
  const hasRedirectedRef = useRef<string | null>(null);

  // Real-time admin alerts subscription (only active for admins/developers)
  useAdminAlertsRealtime();

  // Emergency access: only allow operational routes; redirect rest to dashboard
  const emergencyRedirectTarget = useMemo(() => {
    if (!isEmergencySession) return null;
    const path = location.pathname;
    const allowed = EMERGENCY_ALLOWED_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(prefix + '/'),
    );
    return allowed ? null : '/dashboard';
  }, [isEmergencySession, location.pathname]);

  const brokerShellBailout = useMemo(() => {
    if (!user || !effectiveAccess.isBroker) return null;
    const path = `${location.pathname}${location.search || ''}`;
    if (brokerMayAccessNavPath(path)) return null;
    return '/broker';
  }, [user, effectiveAccess.isBroker, location.pathname, location.search]);

  // Enforce role-based access to main app sections.
  const redirectTarget = useMemo(() => {
    if (emergencyRedirectTarget) return emergencyRedirectTarget;
    if (brokerShellBailout) return brokerShellBailout;
    if (!user) return null;
    const path = location.pathname;

    if (
      user.profileUserType === 'both' &&
      user.companyId &&
      workspaceMode === 'ambassador' &&
      !path.startsWith('/ambassador')
    ) {
      return '/ambassador/console/dashboard';
    }

    const isCompanyAdmin =
      user.role === 'company-admin' || (user as any).role === 'company_admin';
    const isDeveloper = user.role === 'developer';
    const isStaffUser = user.role === 'employee' && !isCompanyAdmin && !isDeveloper;
    // Ambassador-only users have role='employee' (no company context) but must NOT be
    // sent to the staff shell. profileUserType is set from core.profiles before authReady=true.
    const isAmbassadorUser =
      user.profileUserType === 'ambassador' ||
      (user.profileUserType === 'both' && !user.companyId);

    if (isStaffUser && !isAmbassadorUser && !effectiveAccess.isBroker && !path.startsWith('/staff')) {
      const staffTarget = effectiveAccess.landingPage;
      const isStaffLanding =
        staffTarget === '/staff/staff-dashboard' ||
        staffTarget === '/staff' ||
        staffTarget.startsWith('/staff/');
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        logger.log('[Shell] staff user → /staff redirect', {
          uid: user.id,
          role: user.role,
          employeeRole: (user as any).employeeRole,
          from: path,
          to: staffTarget,
        });
      }
      if (!isStaffLanding) {
        return '/';
      }
      return staffTarget;
    }

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      logger.log('[Shell] using admin shell', {
        uid: user.id,
        role: user.role,
        employeeRole: (user as any).employeeRole,
        path,
      });
    }

    return null;
  }, [
    user,
    location.pathname,
    emergencyRedirectTarget,
    brokerShellBailout,
    effectiveAccess.landingPage,
    effectiveAccess.isBroker,
    workspaceMode,
  ]);

  // Use useEffect to handle navigation instead of conditional rendering
  // This prevents infinite loops by only redirecting when the target actually changes
  useEffect(() => {
    // Only redirect if we have a target, it's different from current path, and we haven't redirected yet
    if (redirectTarget && redirectTarget !== location.pathname) {
      const redirectKey = `${location.pathname}->${redirectTarget}`;
      // Only redirect if we haven't already redirected from this path to this target
      if (hasRedirectedRef.current !== redirectKey) {
        hasRedirectedRef.current = redirectKey;
        navigate(redirectTarget, { replace: true });
      }
    } else if (!redirectTarget) {
      // Reset the ref when we're on a valid path (no redirect needed)
      hasRedirectedRef.current = null;
    }
  }, [redirectTarget, location.pathname, navigate]);

  if (import.meta.env.DEV) {
    const width = typeof window !== 'undefined' ? window.innerWidth : undefined;
    const isDesktop = typeof width === 'number' ? width >= 1024 : undefined;
    // eslint-disable-next-line no-console
    logger.log('[Responsive] main layout breakpoint', {
      width,
      isDesktop,
      path: location.pathname,
    });
  }

  // Hard gate: never render plan-dependent UI until the plan is confirmed from Supabase.
  // This prevents BASIC/PRO flicker on refresh for paying customers.
  if (!isEmergencySession && plan.error) {
    return (
      <AuthLoadingScreen
        message={`Unable to load your subscription status. Please check your internet connection and refresh. (${plan.error})`}
      />
    );
  }
  if (!isEmergencySession && subscriptionLoading) {
    return <AuthLoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-background">
      {isEmergencySession && (
        <div
          className="bg-amber-600 text-white text-center py-2 px-4 text-sm font-medium"
          role="status"
          aria-live="polite"
        >
          Emergency Access Mode Active — limited to dashboard, projects, harvest collections, and expenses.
        </div>
      )}
      <AppSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <TopNavbar 
        sidebarCollapsed={sidebarCollapsed} 
        onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <PostOnboardingProjectWelcomeBanner />
      <OfflineSyncBanner />

      <PaymentReminderBanner />
      
      <main
        className={cn(
          'pt-16 min-h-screen transition-all duration-300',
          // On mobile: bottom padding so content never hides behind bottom nav (110px)
          'pb-[110px] lg:pb-0',
          // On large screens: add padding based on sidebar state to accommodate sidebar width
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-60'
        )}
      >
        <div className="p-6">
          <Outlet />
        </div>
      </main>

      <BottomNav />
      {!subscriptionLoading && trialExpiredNeedsPlan && isCompanyAdmin && <PostTrialPlanModal open />}
    </div>
  );
}

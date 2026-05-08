import React, { useState, useEffect } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { SignInRedirect } from '@/components/auth/SignInRedirect';
import { useAuth } from '@/contexts/AuthContext';
import { StaffProvider } from '@/contexts/StaffContext';
import { StaffSidebar } from './StaffSidebar';
import { StaffNavbar } from './StaffNavbar';
import { StaffBottomNav } from './StaffBottomNav';
import { FloatingActionButton } from './FloatingActionButton';
import { cn } from '@/lib/utils';
import { StaffTourProvider } from '@/tour/StaffTourProvider';
import { useCompanySubscriptionRealtime } from '@/hooks/useCompanySubscriptionRealtime';
import { logger } from "@/lib/logger";
import { APP_ENTRY_PATH } from '@/lib/routing/appEntryPaths';
import { OfflineSyncBanner } from '@/components/status/OfflineSyncBanner';

export function StaffLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, effectiveAccess } = useAuth();
  useCompanySubscriptionRealtime(user?.companyId, Boolean(user?.companyId));
  const location = useLocation();

  if (!user) {
    return <SignInRedirect />;
  }

  // Company admins and developers should not use staff shell.
  if (user.role === 'company-admin' || (user as any).role === 'company_admin' || user.role === 'developer') {
    return <Navigate to={APP_ENTRY_PATH} replace />;
  }

  // Ambassador-only users must never land in the staff shell.
  // They get user.role='employee' because normalizeRole(null) defaults to 'employee' when
  // there is no company membership context — but profileUserType is the authoritative signal.
  const isAmbassadorUser =
    user.profileUserType === 'ambassador' ||
    (user.profileUserType === 'both' && !user.companyId);
  if (isAmbassadorUser) {
    return <Navigate to="/ambassador/console/dashboard" replace />;
  }

  const companyId = user.companyId != null ? String(user.companyId).trim() : '';
  if (!companyId) {
    return <Navigate to="/" replace />;
  }

  if (effectiveAccess.isBroker) {
    return <Navigate to="/broker" replace />;
  }

  if (import.meta.env.DEV) {
    const width = typeof window !== 'undefined' ? window.innerWidth : undefined;
    const isDesktop = typeof width === 'number' ? width >= 1024 : undefined;
    // eslint-disable-next-line no-console
    logger.debug('[StaffShell] route using staff layout', {
      uid: user.id,
      role: user.role,
      employeeRole: (user as any).employeeRole,
      path: location.pathname,
    });
    // eslint-disable-next-line no-console
    logger.debug('[Responsive] staff layout breakpoint', {
      width,
      isDesktop,
      path: location.pathname,
    });
  }

  return (
    <StaffProvider>
      <StaffTourProvider>
        <div className="min-h-screen bg-background">
          <StaffSidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
          <StaffNavbar
            sidebarCollapsed={sidebarCollapsed}
            onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
          <OfflineSyncBanner />
          <main
            className={cn(
              'pt-16 min-h-screen transition-all duration-300',
              'pb-[110px] lg:pb-0',
              sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-60',
            )}
          >
            <div className="p-6">
              <Outlet />
            </div>
          </main>
          <StaffBottomNav />
          <FloatingActionButton />
        </div>
      </StaffTourProvider>
    </StaffProvider>
  );
}


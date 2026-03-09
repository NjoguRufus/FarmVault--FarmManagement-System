import React, { useState, useEffect } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { StaffProvider } from '@/contexts/StaffContext';
import { StaffSidebar } from './StaffSidebar';
import { StaffNavbar } from './StaffNavbar';
import { StaffBottomNav } from './StaffBottomNav';
import { cn } from '@/lib/utils';
import { StaffTourProvider } from '@/tour/StaffTourProvider';

export function StaffLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }

  // Company admins and developers should not use staff shell.
  if (user.role === 'company-admin' || (user as any).role === 'company_admin' || user.role === 'developer') {
    return <Navigate to="/dashboard" replace />;
  }

  if (import.meta.env.DEV) {
    const width = typeof window !== 'undefined' ? window.innerWidth : undefined;
    const isDesktop = typeof width === 'number' ? width >= 1024 : undefined;
    // eslint-disable-next-line no-console
    console.log('[StaffShell] route using staff layout', {
      uid: user.id,
      role: user.role,
      employeeRole: (user as any).employeeRole,
      path: location.pathname,
    });
    // eslint-disable-next-line no-console
    console.log('[Responsive] staff layout breakpoint', {
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
        </div>
      </StaffTourProvider>
    </StaffProvider>
  );
}


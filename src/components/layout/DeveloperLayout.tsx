import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { BottomNav } from './BottomNav';
import { TopNavbar } from './TopNavbar';
import { OfflineSyncBanner } from '@/components/status/OfflineSyncBanner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminAlertsRealtime } from '@/hooks/useAdminAlertsRealtime';
import { useFarmerInboxBellSync } from '@/hooks/useFarmerInboxBellSync';
import { logger } from "@/lib/logger";

export function DeveloperLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, isDeveloper } = useAuth();
  useAdminAlertsRealtime();
  useFarmerInboxBellSync(user ?? null, user?.companyId ?? null, user?.id ?? null);
  const location = useLocation();
  const navigate = useNavigate();
  const hasRedirectedRef = useRef<string | null>(null);

  // Hard guard: if a non-developer somehow reaches this shell, bounce them back to their landing page.
  // Use `isDeveloper` (RPC + allowlist) — not only `user.role`, which can be a tenant role during hydration
  // or for linked developer accounts — so approving a company never kicks the operator to /home → onboarding.
  const redirectTarget = useMemo(() => {
    if (!user) return '/sign-in';
    if (isDeveloper || user.role === 'developer') return null;
    return '/home';
  }, [user, isDeveloper]);

  useEffect(() => {
    if (!redirectTarget) {
      hasRedirectedRef.current = null;
      return;
    }
    const key = `${location.pathname}->${redirectTarget}`;
    if (location.pathname !== redirectTarget && hasRedirectedRef.current !== key) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[DeveloperLayout] redirecting non-developer out of developer shell', {
          path: location.pathname,
          redirectTarget,
          isDeveloper,
          role: user?.role,
        });
      }
      hasRedirectedRef.current = key;
      navigate(redirectTarget, { replace: true });
    }
  }, [redirectTarget, location.pathname, navigate, isDeveloper, user?.role]);

  if (import.meta.env.DEV) {
    const width = typeof window !== 'undefined' ? window.innerWidth : undefined;
    const isDesktop = typeof width === 'number' ? width >= 1024 : undefined;
    // eslint-disable-next-line no-console
    logger.debug('[DeveloperLayout] shell', {
      width,
      isDesktop,
      path: location.pathname,
      isDeveloper,
      role: user?.role,
      redirectTarget,
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <TopNavbar
        sidebarCollapsed={sidebarCollapsed}
        onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <OfflineSyncBanner />

      <main
        className={cn(
          'pt-16 min-h-screen transition-all duration-300',
          'pb-24 lg:pb-6',
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-60',
        )}
      >
        <div className="px-3 py-3 sm:px-6 sm:py-4 space-y-3 sm:space-y-4 max-lg:max-w-[100vw] overflow-x-hidden">
          <header className="flex flex-col gap-1.5 border-b border-border/50 pb-2.5 sm:pb-3">
            <div className="flex items-center gap-2 text-[10px] font-medium text-primary/80 uppercase tracking-[0.16em] sm:text-xs sm:tracking-[0.18em]">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px]">
                Dev
              </span>
              <span className="truncate">FarmVault Developer Console</span>
            </div>
          </header>
          <Outlet />
        </div>
      </main>

      <BottomNav />
    </div>
  );
}


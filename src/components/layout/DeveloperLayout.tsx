import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { TopNavbar } from './TopNavbar';
import { OfflineSyncBanner } from '@/components/status/OfflineSyncBanner';
import { AIChatButton } from '@/components/ai/AIChatButton';
import { NotificationSetupPrompt } from '@/components/notifications/NotificationSetupPrompt';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

export function DeveloperLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const hasRedirectedRef = useRef<string | null>(null);

  // Hard guard: if a non-developer somehow reaches this shell, bounce them back to their landing page.
  const redirectTarget = useMemo(() => {
    if (!user) return '/sign-in';
    if (user.role === 'developer') return null;
    return '/dashboard';
  }, [user]);

  useEffect(() => {
    if (!redirectTarget) {
      hasRedirectedRef.current = null;
      return;
    }
    const key = `${location.pathname}->${redirectTarget}`;
    if (location.pathname !== redirectTarget && hasRedirectedRef.current !== key) {
      hasRedirectedRef.current = key;
      navigate(redirectTarget, { replace: true });
    }
  }, [redirectTarget, location.pathname, navigate]);

  if (import.meta.env.DEV) {
    const width = typeof window !== 'undefined' ? window.innerWidth : undefined;
    const isDesktop = typeof width === 'number' ? width >= 1024 : undefined;
    // eslint-disable-next-line no-console
    console.log('[DeveloperLayout] breakpoint', {
      width,
      isDesktop,
      path: location.pathname,
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
          'pb-6',
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-60',
        )}
      >
        <div className="p-6 space-y-4">
          <header className="flex flex-col gap-2 border-b border-border/50 pb-3">
            <div className="flex items-center gap-2 text-xs font-medium text-primary/80 uppercase tracking-[0.18em]">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px]">
                Dev
              </span>
              <span>FarmVault Developer Console</span>
            </div>
          </header>
          <Outlet />
        </div>
      </main>

      <AIChatButton />
      <NotificationSetupPrompt />
    </div>
  );
}


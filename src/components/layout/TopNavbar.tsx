import React, { useState, useEffect } from 'react';
import { Bell, Search, ChevronDown, Settings, LogOut, Menu, HelpCircle, CheckCheck, AlertTriangle, Crown, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { useTour } from '@/tour/TourProvider';
import { ConnectivityStatusPill } from '@/components/status/ConnectivityStatusPill';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/UserAvatar';
import { formatDistanceToNow } from 'date-fns';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useCompanyWorkspaceApprovalStatus } from '@/hooks/useCompanyWorkspaceApprovalStatus';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import { Button } from '@/components/ui/button';
import { isProjectClosed } from '@/lib/projectClosed';

interface TopNavbarProps {
  sidebarCollapsed: boolean;
  onSidebarToggle?: () => void;
}

export function TopNavbar({ sidebarCollapsed, onSidebarToggle }: TopNavbarProps) {
  const { user, logout } = useAuth();
  const { startTour } = useTour();
  const navigate = useNavigate();
  const { projects, activeProject, setActiveProject } = useProject();
  const { notifications, markAsRead, markAllRead, unreadCount } = useNotifications();
  const {
    isTrial,
    isExpired,
    daysRemaining,
    status,
    trialExpiredNeedsPlan,
    isActivePaid,
    plan: subPlan,
    isOverrideActive,
  } = useSubscriptionStatus();
  const {
    isWorkspacePending,
    isWorkspaceActive,
    isLoading: workspaceStatusLoading,
  } = useCompanyWorkspaceApprovalStatus();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV || !user?.companyId) return;
    // eslint-disable-next-line no-console
    console.log('[TopNavbar] subscription badge state', {
      companyId: user.companyId,
      isActivePaid,
      isTrial,
      status,
      subPlan,
    });
  }, [user?.companyId, isActivePaid, isTrial, status, subPlan]);

  const isCompanyAdmin =
    user?.role === 'company-admin' || (user as { role?: string } | null)?.role === 'company_admin';
  const hidePaymentUpgradeModal = trialExpiredNeedsPlan && isCompanyAdmin;

  const isDeveloperNav = user?.role === 'developer';
  const workspacePending =
    !isDeveloperNav && Boolean(user?.companyId) && isWorkspacePending;
  const workspaceApproved =
    !isDeveloperNav && Boolean(user?.companyId) && isWorkspaceActive;
  /** Pending → red accent on trial days; approved → green; loading/unknown → amber. */
  const trialWorkspaceAccent: 'rose' | 'emerald' | 'amber' = workspacePending
    ? 'rose'
    : workspaceApproved
      ? 'emerald'
      : 'amber';

  const companyProjects = user ? projects.filter(p => p.companyId === user.companyId) : [];
  const selectableCompanyProjects = companyProjects.filter((p) => !isProjectClosed(p));

  useEffect(() => {
    if (import.meta.env.DEV && user) {
      // eslint-disable-next-line no-console
      console.log('[Navbar Avatar]', {
        name: user?.name,
        email: user?.email,
        imageUrl: user?.avatar ?? null,
      });
    }
  }, [user?.name, user?.email, user?.avatar]);

  const empRole = (user as any)?.employeeRole;
  const isDriver = Boolean(
    user &&
    (user.role === 'driver' || (user.role === 'employee' && (empRole === 'logistics-driver' || empRole === 'driver')))
  );

  const getCropEmoji = (cropType: string) => {
    const emojis: Record<string, string> = {
      tomatoes: '🍅',
      'french-beans': '🫛',
      capsicum: '🌶️',
      maize: '🌽',
      watermelons: '🍉',
      rice: '🌾',
    };
    return emojis[cropType] || '🌱';
  };

  return (
    <header
      id="main-navbar"
      className={cn(
        'fixed top-0 right-0 z-40 h-16 bg-card border-b border-border transition-all duration-300',
        // On mobile, navbar spans full width.
        // On large screens, shift to align with sidebar width.
        'left-0',
        sidebarCollapsed ? 'lg:left-16' : 'lg:left-60'
      )}
    >
      <div className="flex h-full items-center justify-between px-4 sm:px-6">
        {/* Left: Logo + Project Selector */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Mobile Logo */}
          <img
            src="/Logo/FarmVault_Logo dark mode.png"
            alt="FarmVault logo"
            className="h-8 w-auto rounded-md object-contain bg-sidebar-primary/10 p-1 md:hidden"
          />
          {isDriver ? (
            <div className="flex items-center gap-1.5 sm:gap-2 rounded-lg border border-border bg-muted/50 px-2 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm text-muted-foreground">
              <span className="font-medium">Driver</span>
            </div>
          ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              data-tour="project-selector"
              className="flex items-center gap-1.5 sm:gap-2 rounded-lg border border-border bg-background px-2 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm hover:bg-muted transition-colors"
            >
              {activeProject ? (
                <>
                  <span className="text-base sm:text-lg">{getCropEmoji(activeProject.cropType)}</span>
                  <span className="font-medium hidden sm:inline">{activeProject.name}</span>
                  <span className="font-medium sm:hidden max-w-[80px] truncate">{activeProject.name}</span>
                  <span className="hidden sm:inline text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
                    {activeProject.status}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground text-xs sm:text-sm">Select Project</span>
              )}
              <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel className="flex items-center justify-between gap-2 pr-2 font-normal">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Switch Project
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs font-medium shrink-0"
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveProject(null);
                  }}
                >
                  All
                </Button>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {selectableCompanyProjects.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">No projects in your company.</p>
              ) : (
                selectableCompanyProjects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => setActiveProject(project)}
                    className={cn(
                      'flex items-center gap-3 cursor-pointer',
                      activeProject?.id === project.id && 'bg-muted'
                    )}
                  >
                    <span className="text-lg">{getCropEmoji(project.cropType)}</span>
                    <div className="flex flex-col">
                      <span className="font-medium">{project.name}</span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {project.cropType.replace('-', ' ')} • {project.location}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>

        {/* Center: Search */}
        <div className="hidden md:flex items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              className="fv-input pl-10 w-64"
            />
          </div>
        </div>

        {/* Right: Actions + Sidebar toggle */}
        <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
          {/* Sidebar toggle (hamburger) aligned with badges on the right */}
          <button
            onClick={onSidebarToggle}
            className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted transition-colors"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5 text-foreground" />
          </button>
          <ConnectivityStatusPill
            className="shrink-0 px-2 py-0.5 text-[10px] sm:px-2.5 sm:py-1 sm:text-[11px]"
            workspaceApprovalTone={
              !user?.companyId || isDeveloperNav
                ? 'unknown'
                : workspaceStatusLoading
                  ? 'loading'
                  : workspacePending
                    ? 'pending'
                    : workspaceApproved
                      ? 'active'
                      : 'unknown'
            }
          />

          {status === 'pending_payment' && (
            <div className="hidden sm:inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 border border-amber-200">
              Payment submitted. Awaiting confirmation.
            </div>
          )}

          {isActivePaid && !isOverrideActive && (
            <>
              <div className="hidden sm:inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                {subPlan === 'pro' ? 'Pro' : subPlan === 'basic' ? 'Basic' : 'Plan'} · Active
              </div>
              <div className="sm:hidden inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" aria-hidden />
                Active
              </div>
            </>
          )}

          {/* Pro trial countdown — rose while workspace pending approval, emerald when approved, amber if status unknown */}
          {isTrial && typeof daysRemaining === 'number' && daysRemaining >= 0 && !trialExpiredNeedsPlan && (
            <div className="hidden md:flex flex-col items-end gap-0.5 max-w-[220px]">
              <button
                type="button"
                onClick={() => setUpgradeOpen(true)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border',
                  trialWorkspaceAccent === 'rose' &&
                    'border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/45 dark:text-rose-100 dark:hover:bg-rose-950/65',
                  trialWorkspaceAccent === 'emerald' &&
                    'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 hover:bg-emerald-500/15 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20',
                  trialWorkspaceAccent === 'amber' &&
                    'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-100 dark:hover:bg-amber-950/50',
                )}
              >
                <Crown
                  className={cn(
                    'h-3 w-3 shrink-0',
                    trialWorkspaceAccent === 'rose' && 'text-rose-700 dark:text-rose-300',
                    trialWorkspaceAccent === 'emerald' && 'text-emerald-700 dark:text-emerald-300',
                    trialWorkspaceAccent === 'amber' && 'text-amber-700 dark:text-amber-300',
                  )}
                />
                Pro trial · {daysRemaining} day{daysRemaining === 1 ? '' : 's'} left
              </button>
              <span
                className={cn(
                  'text-[10px] text-right leading-tight',
                  trialWorkspaceAccent === 'rose' && 'text-rose-800/90 dark:text-rose-200/85',
                  trialWorkspaceAccent === 'emerald' && 'text-emerald-800/90 dark:text-emerald-200/85',
                  trialWorkspaceAccent === 'amber' && 'text-amber-800/90 dark:text-amber-200/85',
                )}
              >
                {daysRemaining === 0
                  ? 'Your Pro trial ends today'
                  : `Your Pro trial ends in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`}
              </span>
            </div>
          )}
          {isTrial && typeof daysRemaining === 'number' && daysRemaining >= 0 && !trialExpiredNeedsPlan && (
            <button
              type="button"
              onClick={() => setUpgradeOpen(true)}
              className={cn(
                'md:hidden inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border',
                trialWorkspaceAccent === 'rose' &&
                  'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/45 dark:text-rose-100',
                trialWorkspaceAccent === 'emerald' &&
                  'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:border-emerald-500/35 dark:text-emerald-200',
                trialWorkspaceAccent === 'amber' &&
                  'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-100',
              )}
            >
              <Crown
                className={cn(
                  'h-3 w-3',
                  trialWorkspaceAccent === 'rose' && 'text-rose-700 dark:text-rose-300',
                  trialWorkspaceAccent === 'emerald' && 'text-emerald-700 dark:text-emerald-300',
                  trialWorkspaceAccent === 'amber' && 'text-amber-700 dark:text-amber-300',
                )}
              />
              {daysRemaining}d Pro trial
            </button>
          )}

          {!isDeveloperNav &&
            Boolean(user?.companyId) &&
            workspacePending &&
            !isTrial &&
            !workspaceStatusLoading && (
              <div
                className="hidden sm:inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-900 dark:border-rose-800 dark:bg-rose-950/45 dark:text-rose-100"
                role="status"
                title="Your workspace is waiting for team approval"
              >
                <span className="flex h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-hidden />
                Approval pending
              </div>
            )}

          {trialExpiredNeedsPlan && (
            <div
              className="hidden sm:inline-flex flex-col items-end gap-0.5 max-w-[240px] rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5"
              role="status"
            >
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-destructive">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Pro trial ended
              </span>
              <span className="text-[10px] text-muted-foreground text-right leading-tight">
                {isCompanyAdmin
                  ? 'Choose Basic or Pro to continue.'
                  : 'Ask your company admin to choose a plan.'}
              </span>
            </div>
          )}

          {isExpired && !trialExpiredNeedsPlan && (
            <button
              type="button"
              onClick={() => setUpgradeOpen(true)}
              className="hidden sm:inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive border border-destructive/40 hover:bg-destructive/15"
            >
              <AlertTriangle className="h-3 w-3" />
              Subscription expired – Upgrade
            </button>
          )}

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger className="relative mr-1 md:mr-0 flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg hover:bg-muted transition-colors">
              <Bell className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-2 py-1.5">
                <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-xs text-primary hover:underline"
                  >
                    <CheckCheck className="h-3.5 w-3.5 inline mr-0.5" />
                    Mark all read
                  </button>
                )}
              </div>
              <DropdownMenuSeparator />
              <div className="overflow-y-auto max-h-[280px]">
                {notifications.length === 0 ? (
                  <p className="px-2 py-4 text-sm text-muted-foreground text-center">No notifications yet.</p>
                ) : (
                  notifications.map((n) => (
                    <DropdownMenuItem
                      key={n.id}
                      className={cn(
                        'flex flex-col items-start gap-0.5 cursor-pointer py-3',
                        !n.read && 'bg-muted/50'
                      )}
                      onClick={() => markAsRead(n.id)}
                    >
                      <span className="font-medium text-sm text-foreground">{n.title}</span>
                      {n.message && (
                        <span className="text-xs text-muted-foreground line-clamp-2">{n.message}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 md:gap-2 rounded-lg px-1.5 md:px-2 py-1.5 hover:bg-muted transition-colors">
              <UserAvatar
                avatarUrl={user?.avatar}
                name={user?.name}
                className="h-7 w-7 md:h-8 md:w-8 shrink-0"
                size="sm"
              />
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium">{user?.name}</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground hidden md:block" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/billing')}>
                <Crown className="mr-2 h-4 w-4" />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/support')}>
                <HelpCircle className="mr-2 h-4 w-4" />
                Support
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {!hidePaymentUpgradeModal && (
        <UpgradeModal
          open={upgradeOpen}
          onOpenChange={setUpgradeOpen}
          isTrial={isTrial}
          isExpired={isExpired && !trialExpiredNeedsPlan}
          daysRemaining={daysRemaining}
        />
      )}
    </header>
  );
}

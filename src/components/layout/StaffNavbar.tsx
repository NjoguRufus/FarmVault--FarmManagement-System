import React, { useEffect } from 'react';
import { Menu, ChevronDown, Crown, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { useStaff } from '@/contexts/StaffContext';
import { useEmployeeAccess } from '@/hooks/useEmployeeAccess';
import { cn } from '@/lib/utils';
import { resolveUserDisplayName } from '@/lib/userDisplayName';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStaffTour } from '@/tour/StaffTourProvider';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useCompanyWorkspaceApprovalStatus } from '@/hooks/useCompanyWorkspaceApprovalStatus';
import { Button } from '@/components/ui/button';
import { cropTypeKeyEmoji } from '@/lib/cropEmoji';
import { isProjectClosed } from '@/lib/projectClosed';
import { FarmVaultUserMenu } from '@/components/auth/FarmVaultUserMenu';
import { SyncStatusIndicator } from '@/components/sync/SyncStatusIndicator';
import { logger } from "@/lib/logger";
import { FarmService } from '@/services/localData/FarmService';

interface StaffNavbarProps {
  sidebarCollapsed: boolean;
  onSidebarToggle?: () => void;
}

export function StaffNavbar({ sidebarCollapsed, onSidebarToggle }: StaffNavbarProps) {
  const { user } = useAuth();
  const {
    projects,
    activeProject,
    activeFarmId,
    setActiveProject,
    setActiveFarmId,
    isSwitchingProject,
  } = useProject();
  const { fullName, roleLabel, companyName: staffCompanyName, companyId } = useStaff();
  const { hasProjectAccess } = useEmployeeAccess();
  const { startTour: startStaffTour } = useStaffTour();
  const {
    isTrial,
    daysRemaining,
    trialExpiredNeedsPlan,
    isActivePaid,
    plan: subPlan,
    isOverrideActive,
    status,
  } = useSubscriptionStatus();

  const {
    isWorkspacePending,
    isWorkspaceActive,
    isLoading: workspaceStatusLoading,
  } = useCompanyWorkspaceApprovalStatus();

  const workspacePending = Boolean(companyId) && isWorkspacePending;
  const workspaceApproved = Boolean(companyId) && isWorkspaceActive;
  const trialWorkspaceAccent: 'rose' | 'emerald' | 'amber' = workspacePending
    ? 'rose'
    : workspaceApproved
      ? 'emerald'
      : 'amber';
  const location = useLocation();
  const [selectorView, setSelectorView] = React.useState<'projects' | 'farms'>('projects');

  useEffect(() => {
    if (!import.meta.env.DEV || !companyId) return;
    // eslint-disable-next-line no-console
    logger.debug('[StaffNavbar] subscription badge state', {
      companyId,
      isActivePaid,
      isTrial,
      status,
      subPlan,
    });
  }, [companyId, isActivePaid, isTrial, status, subPlan]);
  const companyName = staffCompanyName || activeProject?.companyId || 'FarmVault';

  const displayName =
    (fullName?.trim() && fullName) ||
    user?.name ||
    resolveUserDisplayName({ email: user?.email });
  const displayRole = roleLabel ?? 'Staff';

  const companyProjects = companyId ? projects.filter((p) => p.companyId === companyId) : projects;
  const selectableCompanyProjects = companyProjects.filter(
    (p) => !isProjectClosed(p) && hasProjectAccess(p.id),
  );
  const { data: farms = [] } = useQuery({
    queryKey: ['farms', companyId ?? ''],
    queryFn: async () => {
      if (!companyId) return [];
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await FarmService.pullRemote(companyId);
        } catch {
          // ignore
        }
      }
      return FarmService.listFarmsByCompany(companyId);
    },
    enabled: Boolean(companyId),
  });
  const selectorFarms = farms.filter(
    (f) =>
      f.status !== 'closed' &&
      !(f.name.trim().toLowerCase() === 'legacy farm' && f.location.trim().toLowerCase() === 'unspecified'),
  );
  const activeFarmSummary =
    !activeProject && activeFarmId ? selectorFarms.find((f) => f.id === activeFarmId) ?? null : null;

  const path = location.pathname || '';
  let pageTitle = 'Staff Workspace';
  if (path.startsWith('/staff/harvest-collections')) {
    pageTitle = 'Harvest Collections';
  } else if (path.startsWith('/staff/tomato-harvest')) {
    pageTitle = 'Tomato harvest';
  } else if (path.startsWith('/staff/harvest-sessions') || path === '/staff/harvest') {
    pageTitle = 'Harvest';
  } else if (path.startsWith('/staff/inventory')) {
    pageTitle = 'Inventory';
  } else if (path.startsWith('/staff/expenses')) {
    pageTitle = 'Expenses';
  } else if (path.startsWith('/staff/operations')) {
    pageTitle = 'Operations';
  }

  if (import.meta.env.DEV && user) {
    // eslint-disable-next-line no-console
    logger.debug('[StaffNavbar] employee identity loaded', {
      uid: user.id,
      employeeName: displayName,
      employeeRole: displayRole,
      companyName,
      pageTitle,
    });
  }

  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-40 h-16 bg-card border-b border-border transition-all duration-300',
        'left-0',
        sidebarCollapsed ? 'lg:left-16' : 'lg:left-60',
      )}
    >
      <div className="flex h-full items-center justify-between px-4 sm:px-6">
        {/* Left: hamburger + workspace title + (optional) project selector */}
        <div className="flex items-center gap-2 sm:gap-3">
          {onSidebarToggle && (
            <button
              onClick={onSidebarToggle}
              className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted transition-colors"
              aria-label="Toggle sidebar"
            >
              <Menu className="h-5 w-5 text-foreground" />
            </button>
          )}
          <img
            src="/Logo/FarmVault_Logo dark mode.png"
            alt="FarmVault logo"
            className="h-8 w-auto rounded-md object-contain bg-sidebar-primary/10 p-1"
          />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">{pageTitle}</span>
            <span className="text-xs text-muted-foreground truncate">
              Staff Workspace · {companyName}
            </span>
          </div>
          {/* Project selector (same semantics as admin navbar, scoped to staff company) */}
          <DropdownMenu>
            <DropdownMenuTrigger
              data-tour="project-selector"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5 text-xs sm:text-sm hover:bg-muted transition-colors max-w-[42vw] sm:max-w-none"
            >
              {activeProject ? (
                <>
                  <span className="text-base sm:text-lg">{cropTypeKeyEmoji(activeProject.cropType)}</span>
                  <span className="font-medium max-w-[120px] sm:max-w-[140px] truncate">
                    {activeProject.name}
                  </span>
                </>
              ) : activeFarmSummary ? (
                <>
                  <span className="text-base sm:text-lg">🌾</span>
                  <span className="font-medium max-w-[120px] sm:max-w-[140px] truncate">
                    {activeFarmSummary.name}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground text-xs sm:text-sm">All projects</span>
              )}
              <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
              {isSwitchingProject && (
                <span className="hidden md:inline text-[10px] text-muted-foreground animate-pulse">
                  Switching…
                </span>
              )}
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
                    setActiveFarmId(null);
                  }}
                >
                  All
                </Button>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2 py-2">
                <div className="flex rounded-md bg-muted/70 p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectorView('projects')}
                    className={cn(
                      'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                      selectorView === 'projects' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Projects
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectorView('farms')}
                    className={cn(
                      'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                      selectorView === 'farms' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Farms
                  </button>
                </div>
              </div>
              <DropdownMenuSeparator />
              {selectorView === 'projects' ? (
                selectableCompanyProjects.length === 0 ? (
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
                      <span className="text-lg">{cropTypeKeyEmoji(project.cropType)}</span>
                      <div className="flex flex-col">
                        <span className="font-medium">{project.name}</span>
                        <span className="text-xs text-muted-foreground capitalize">
                          {project.cropType.replace('-', ' ')} • {project.location}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))
                )
              ) : (
                selectorFarms.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground">No active farms in your company.</p>
                ) : (
                  selectorFarms.map((farm) => (
                    <DropdownMenuItem
                      key={`farm-${farm.id}`}
                      onClick={() => {
                        setActiveProject(null);
                        setActiveFarmId(farm.id);
                      }}
                      className={cn(
                        'flex items-center gap-3 cursor-pointer',
                        !activeProject && activeFarmId === farm.id && 'bg-muted',
                      )}
                    >
                      <span className="text-lg">🌾</span>
                      <div className="flex flex-col">
                        <span className="font-medium">{farm.name}</span>
                        <span className="text-xs text-muted-foreground">{farm.location}</span>
                      </div>
                    </DropdownMenuItem>
                  ))
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right: status + user menu */}
        <div className="flex items-center gap-2 sm:gap-3">
          {isActivePaid && !isOverrideActive && (
            <div className="hidden sm:inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" aria-hidden />
              {subPlan === 'pro' ? 'Pro Active' : subPlan === 'basic' ? 'Basic Active' : 'Plan Active'}
            </div>
          )}

          {isTrial && typeof daysRemaining === 'number' && daysRemaining >= 0 && !trialExpiredNeedsPlan && (
            <div
              className="hidden sm:flex flex-col items-end gap-0.5 max-w-[200px]"
              title={
                daysRemaining === 0
                  ? 'Your Pro trial ends today'
                  : `Your Pro trial ends in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`
              }
            >
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border',
                  trialWorkspaceAccent === 'rose' &&
                    'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/45 dark:text-rose-100',
                  trialWorkspaceAccent === 'emerald' &&
                    'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-200',
                  trialWorkspaceAccent === 'amber' &&
                    'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-100',
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
                Pro trial · {daysRemaining}d
              </span>
            </div>
          )}
          {trialExpiredNeedsPlan && (
            <div className="hidden sm:flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-[10px] text-destructive max-w-[180px]">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span className="leading-tight">Pro trial ended — ask admin to pick a plan</span>
            </div>
          )}

          <SyncStatusIndicator className="hidden sm:flex" />

          <FarmVaultUserMenu
            accountLabel="My Staff Account"
            afterSignOutUrl="/sign-in"
            settingsPath="/settings"
            supportPath="/staff/support"
            triggerClassName="sm:gap-2"
            showSettings={false}
            showBilling={false}
          />
        </div>
      </div>
    </header>
  );
}


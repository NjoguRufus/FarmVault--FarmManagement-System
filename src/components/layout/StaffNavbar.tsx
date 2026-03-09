import React from 'react';
import { LogOut, Menu, ChevronDown, User as UserIcon, HelpCircle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { useStaff } from '@/contexts/StaffContext';
import { ConnectivityStatusPill } from '@/components/status/ConnectivityStatusPill';
import { UserAvatar } from '@/components/UserAvatar';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStaffTour } from '@/tour/StaffTourProvider';

interface StaffNavbarProps {
  sidebarCollapsed: boolean;
  onSidebarToggle?: () => void;
}

export function StaffNavbar({ sidebarCollapsed, onSidebarToggle }: StaffNavbarProps) {
  const { user, logout } = useAuth();
  const { projects, activeProject, setActiveProject } = useProject();
  const { fullName, roleLabel, companyName: staffCompanyName, avatarUrl, companyId } = useStaff();
  const { startTour: startStaffTour } = useStaffTour();
  const location = useLocation();
  const navigate = useNavigate();
  const companyName = staffCompanyName || activeProject?.companyId || 'FarmVault';

  const displayName = fullName ?? user?.email ?? 'User';
  const displayRole = roleLabel ?? 'Staff';

  const companyProjects = companyId ? projects.filter((p) => p.companyId === companyId) : projects;

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

  const path = location.pathname || '';
  let pageTitle = 'Staff Workspace';
  if (path.startsWith('/staff/harvest-collections')) {
    pageTitle = 'Harvest Collections';
  } else if (path.startsWith('/staff/inventory')) {
    pageTitle = 'Inventory';
  } else if (path.startsWith('/staff/expenses')) {
    pageTitle = 'Expenses';
  } else if (path.startsWith('/staff/operations')) {
    pageTitle = 'Operations';
  }

  if (import.meta.env.DEV && user) {
    // eslint-disable-next-line no-console
    console.log('[StaffNavbar] employee identity loaded', {
      uid: user.id,
      employeeName: displayName,
      employeeRole: displayRole,
      companyName,
      pageTitle,
    });
    // eslint-disable-next-line no-console
    console.log('[StaffProfileMenu] visible menu items', [
      'My Profile',
      'Take a Tour',
      'Support',
      'Logout',
    ]);
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
              className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5 text-xs sm:text-sm hover:bg-muted transition-colors"
            >
              {activeProject ? (
                <>
                  <span className="text-base sm:text-lg">{getCropEmoji(activeProject.cropType)}</span>
                  <span className="font-medium hidden md:inline max-w-[140px] truncate">
                    {activeProject.name}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground text-xs sm:text-sm">Select project</span>
              )}
              <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>Switch Project</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {companyProjects.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">No projects in your company.</p>
              ) : (
                companyProjects.map((project) => (
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
        </div>

        {/* Right: status + user menu */}
        <div className="flex items-center gap-2 sm:gap-3">
          <ConnectivityStatusPill className="shrink-0 px-2 py-0.5 text-[10px] sm:px-2.5 sm:py-1 sm:text-[11px]" />

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors">
              <UserAvatar
                avatarUrl={avatarUrl ?? user?.avatar}
                name={displayName}
                size="sm"
                className="h-8 w-8"
              />
              <div className="hidden sm:flex flex-col items-start">
                <span className="text-sm font-medium">{displayName}</span>
                <span className="text-xs text-muted-foreground">{displayRole}</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Staff Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => navigate('/staff/profile')}
              >
                <UserIcon className="mr-2 h-4 w-4" />
                My Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => startStaffTour()}
              >
                <HelpCircle className="mr-2 h-4 w-4" />
                Take a Tour
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => navigate('/staff/support')}
              >
                <HelpCircle className="mr-2 h-4 w-4" />
                Support
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={logout}
                className="cursor-pointer text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}


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

interface StaffNavbarProps {
  sidebarCollapsed: boolean;
  onSidebarToggle?: () => void;
}

export function StaffNavbar({ sidebarCollapsed, onSidebarToggle }: StaffNavbarProps) {
  const { user, logout } = useAuth();
  const { activeProject } = useProject();
  const { fullName, roleLabel, companyName: staffCompanyName } = useStaff();
  const location = useLocation();
  const navigate = useNavigate();
  const companyName = staffCompanyName || activeProject?.companyId || 'FarmVault';

  const displayName = fullName ?? user?.email ?? 'User';

  const displayRole = roleLabel ?? 'Staff';

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
    console.log('[Nav] staff navbar identity', {
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
        {/* Left: hamburger + workspace title */}
        <div className="flex items-center gap-2 sm:gap-3">
          {onSidebarToggle && (
            <button
              onClick={onSidebarToggle}
              className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted transition-colors"
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
        </div>

        {/* Right: status + user menu */}
        <div className="flex items-center gap-2 sm:gap-3">
          <ConnectivityStatusPill className="shrink-0 px-2 py-0.5 text-[10px] sm:px-2.5 sm:py-1 sm:text-[11px]" />

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors">
              <UserAvatar
                avatarUrl={user?.avatar}
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
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => navigate('/support')}
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


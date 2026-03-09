import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useEmployeeAccess } from '@/hooks/useEmployeeAccess';
import { useIsMobile } from '@/hooks/use-mobile';
import { UserAvatar } from '@/components/UserAvatar';
import { useStaff } from '@/contexts/StaffContext';

interface StaffSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function StaffSidebar({ collapsed, onToggle }: StaffSidebarProps) {
  const location = useLocation();
  const { user, employeeProfile } = useAuth();
  const { can } = usePermissions();
  const { can: canKey, effectivePermissionKeys } = useEmployeeAccess();
  const isMobile = useIsMobile();
  const { fullName, roleLabel } = useStaff();

  const items: Array<{ label: string; path: string }> = [{ label: 'My Dashboard', path: '/staff' }];

  const canHarvestCollections = canKey('harvest_collections.view') || can('harvest', 'view');
  const canInventory = effectivePermissionKeys.has('inventory.view') || can('inventory', 'view');
  const canExpenses =
    effectivePermissionKeys.has('expenses.view') ||
    effectivePermissionKeys.has('expenses.approve') ||
    can('expenses', 'view');
  const canOperations = effectivePermissionKeys.has('operations.view') || can('operations', 'view');

  if (canHarvestCollections) {
    items.push({ label: 'Harvest Collections', path: '/staff/harvest-collections' });
  }
  if (canInventory) {
    items.push({ label: 'Inventory', path: '/staff/inventory' });
  }
  if (canExpenses) {
    items.push({ label: 'Expenses', path: '/staff/expenses' });
  }
  if (canOperations) {
    items.push({ label: 'Operations', path: '/staff/operations' });
  }

  const displayName = fullName ?? user?.email ?? 'User';

  const displayRole = roleLabel ?? 'Staff';

  if (import.meta.env.DEV && user) {
    // eslint-disable-next-line no-console
    console.log('[Nav] visible staff nav items', {
      uid: user.id,
      employeeName: displayName,
      employeeRole: displayRole,
      items: items.map((i) => i.path),
    });
  }

  return (
    <div className="hidden lg:block">
      {!collapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden transition-opacity duration-300"
          onClick={onToggle}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 flex h-screen flex-col transition-all duration-300 fv-sidebar',
          collapsed ? 'w-16 -translate-x-full lg:translate-x-0' : 'w-60 translate-x-0',
        )}
        style={{ boxShadow: 'var(--shadow-sidebar)' }}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center justify-between px-4 border-b border-sidebar-border/30">
          <div className="flex items-center gap-3">
            <img
              src="/Logo/FarmVault_Logo dark mode.png"
              alt="FarmVault logo"
              className="h-8 w-auto rounded-md object-contain bg-sidebar-primary/10 p-1"
            />
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-sidebar-foreground">FarmVault</span>
                <span className="text-xs text-sidebar-muted">Staff</span>
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="min-h-0 flex-1 overflow-y-auto py-4 px-3 scrollbar-thin">
          <ul className="space-y-1">
            {items.map((item) => {
              const normalizedPath = location.pathname.replace(/\/+/g, '/');
              const itemPath = item.path.replace(/\/+/g, '/');
              const isActive =
                normalizedPath === itemPath ||
                (itemPath !== '/' && normalizedPath.startsWith(itemPath + '/'));
              return (
                <li key={item.path}>
                  <Link
                    to={itemPath}
                    onClick={() => isMobile && onToggle()}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-primary'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                    )}
                  >
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User */}
        {!collapsed && user && (
          <div className="shrink-0 border-t border-sidebar-border/30 p-4">
            <div className="flex items-center gap-3">
              <UserAvatar
                avatarUrl={user.avatar}
                name={displayName}
                size="md"
                className="h-9 w-9 shrink-0"
                fallbackClassName="bg-sidebar-accent text-sidebar-foreground"
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-sidebar-foreground">
                  {displayName}
                </span>
                <span className="text-xs text-sidebar-muted">{displayRole}</span>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}


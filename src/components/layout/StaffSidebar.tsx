import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useEmployeeAccess } from '@/hooks/useEmployeeAccess';
import { useIsMobile } from '@/hooks/use-mobile';
import { UserAvatar } from '@/components/UserAvatar';
import { useStaff } from '@/contexts/StaffContext';
import { useEffectivePlanAccess } from '@/hooks/useEffectivePlanAccess';
import { ProBadge } from '@/components/subscription';
import { getLockedProFeatureForPath } from '@/config/lockedProRoutes';
import { openUpgradeModal } from '@/lib/upgradeModalEvents';
import { features, type SubscriptionTier } from '@/config/subscriptionFeatureMatrix';
import { logger } from "@/lib/logger";
import { hasHarvestCollectionsModule } from '@/lib/cropModules';

interface StaffSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function StaffSidebar({ collapsed, onToggle }: StaffSidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const { activeProject } = useProject();
  const { can } = usePermissions();
  const { can: canKey, effectivePermissionKeys } = useEmployeeAccess();
  const isMobile = useIsMobile();
  const { fullName, roleLabel, avatarUrl } = useStaff();
  const { plan, isDeveloper, isLoading: planLoading, isOverride } = useEffectivePlanAccess();
  const normalizedCurrentPath = useMemo(
    () => location.pathname.replace(/\/+/g, '/'),
    [location.pathname],
  );

  const currentTier: SubscriptionTier =
    isDeveloper || plan === 'enterprise' || isOverride ? 'pro' : plan === 'pro' ? 'pro' : 'basic';

  const canAccessTier = (required: SubscriptionTier) => {
    if (required === 'basic') return true;
    return currentTier === 'pro';
  };

  const items: Array<{ label: string; path: string }> = [{ label: 'Home', path: '/staff/staff-dashboard' }];

  const canHarvestCollections = canKey('harvest_collections.view') || can('harvest', 'view');
  const canInventory = effectivePermissionKeys.has('inventory.view') || can('inventory', 'view');
  const canExpenses =
    effectivePermissionKeys.has('expenses.view') ||
    effectivePermissionKeys.has('expenses.approve') ||
    can('expenses', 'view');
  const canOperations = effectivePermissionKeys.has('operations.view') || can('operations', 'view');

  if (canHarvestCollections) {
    items.push({ label: 'Harvest', path: '/staff/harvest' });
  }
  if (canInventory) {
    items.push({ label: 'Inventory', path: '/staff/inventory' });
  }
  if (canExpenses) {
    items.push({ label: 'Expenses', path: '/staff/expenses' });
  }
  if (canOperations) {
    items.push({ label: 'Farm Work', path: '/staff/operations' });
  }
  if (can('notes', 'view') || effectivePermissionKeys.has('notes.view')) {
    items.push({ label: 'Notes', path: '/staff/notes' });
  }

  const displayName = fullName ?? user?.email ?? 'User';

  const displayRole = roleLabel ?? 'Staff';

  if (import.meta.env.DEV && user) {
    // eslint-disable-next-line no-console
    logger.debug('[StaffSidebar] visible nav items', {
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
              const normalizedPath = normalizedCurrentPath;
              const itemPath = item.path.replace(/\/+/g, '/');
              const isStaffHarvestEntry = itemPath === '/staff/harvest';
              const isActive = isStaffHarvestEntry
                ? normalizedPath === '/staff/harvest' ||
                  normalizedPath.startsWith('/staff/harvest-collections') ||
                  normalizedPath.startsWith('/staff/tomato-harvest') ||
                  normalizedPath.startsWith('/staff/harvest-sessions')
                : normalizedPath === itemPath ||
                  (itemPath !== '/' && normalizedPath.startsWith(itemPath + '/'));
              const lockedFeature =
                isStaffHarvestEntry &&
                activeProject &&
                hasHarvestCollectionsModule(String(activeProject.cropTypeKey ?? activeProject.cropType ?? ''))
                  ? getLockedProFeatureForPath('/staff/harvest-collections')
                  : getLockedProFeatureForPath(itemPath);
              const requiredTier = lockedFeature ? features[lockedFeature] : 'basic';
              const isLocked =
                Boolean(lockedFeature) &&
                !planLoading &&
                !isDeveloper &&
                !canAccessTier(requiredTier);
              return (
                <li key={item.path}>
                  <Link
                    to={itemPath}
                    data-tour={
                      item.path === '/staff/harvest'
                        ? 'staff-nav-harvest'
                        : item.path === '/staff/inventory'
                        ? 'staff-nav-inventory'
                        : item.path === '/staff/expenses'
                        ? 'staff-nav-expenses'
                        : item.path === '/staff/operations'
                        ? 'staff-nav-operations'
                        : item.path === '/staff/notes'
                        ? 'staff-nav-notes'
                        : undefined
                    }
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-primary'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                    )}
                    aria-disabled={isLocked ? true : undefined}
                    onMouseDown={(e) => {
                      if (!isLocked) return;
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      if (!isLocked) {
                        if (isMobile) onToggle();
                        return;
                      }
                      e.preventDefault();
                      e.stopPropagation();
                      openUpgradeModal({ checkoutPlan: 'pro' });
                      if (isMobile) onToggle();
                    }}
                  >
                    {!collapsed && (
                      <span className="min-w-0 flex-1 truncate flex items-center gap-2">
                        <span className="truncate">{item.label}</span>
                        {isLocked ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Lock className="h-3.5 w-3.5" />
                            <ProBadge />
                          </span>
                        ) : null}
                      </span>
                    )}
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
                avatarUrl={avatarUrl ?? user.avatar}
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


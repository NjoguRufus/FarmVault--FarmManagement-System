import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Scale, Package, Receipt, Wrench, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useEmployeeAccess } from '@/hooks/useEmployeeAccess';
import { cn } from '@/lib/utils';
import { useEffectivePlanAccess } from '@/hooks/useEffectivePlanAccess';
import { getLockedProFeatureForPath } from '@/config/lockedProRoutes';
import { openUpgradeModal } from '@/lib/upgradeModalEvents';
import { features, type SubscriptionTier } from '@/config/subscriptionFeatureMatrix';
import { logger } from "@/lib/logger";
import { hasHarvestCollectionsModule } from '@/lib/cropModules';

const ACTIVE_TAB_SHADOW =
  '0 8px 18px -12px rgba(27, 67, 50, 0.45), 0 3px 8px -6px rgba(27, 67, 50, 0.35)';

export function StaffBottomNav() {
  const { user } = useAuth();
  const { activeProject } = useProject();
  const { can } = usePermissions();
  const { can: canKey, effectivePermissionKeys } = useEmployeeAccess();
  const location = useLocation();
  const normalizedPath = useMemo(() => location.pathname.replace(/\/+/g, '/'), [location.pathname]);
  const { plan, isDeveloper, isLoading: planLoading, isOverride } = useEffectivePlanAccess();
  const [isDesktop, setIsDesktop] = useState(false);

  const currentTier: SubscriptionTier =
    isDeveloper || plan === 'enterprise' || isOverride ? 'pro' : plan === 'pro' ? 'pro' : 'basic';

  const canAccessTier = (required: SubscriptionTier) => {
    if (required === 'basic') return true;
    return currentTier === 'pro';
  };

  useEffect(() => {
    const update = () => {
      if (typeof window === 'undefined') return;
      const width = window.innerWidth;
      setIsDesktop(width >= 1024);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        logger.log('[StaffBottomNav] viewport', { width, isDesktop: width >= 1024 });
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  if (!user || isDesktop) return null;

  const items: Array<{ label: string; path: string; icon: React.ComponentType<{ className?: string }> }> = [
    { label: 'Dashboard', path: '/staff/staff-dashboard', icon: LayoutDashboard },
  ];

  const canHarvestCollections = canKey('harvest_collections.view') || can('harvest', 'view');
  const canInventory = effectivePermissionKeys.has('inventory.view') || can('inventory', 'view');
  const canExpenses =
    effectivePermissionKeys.has('expenses.view') ||
    effectivePermissionKeys.has('expenses.approve') ||
    can('expenses', 'view');
  const canOperations = effectivePermissionKeys.has('operations.view') || can('operations', 'view');

  if (canHarvestCollections) {
    items.push({ label: 'Harvest', path: '/staff/harvest', icon: Scale });
  }
  if (canInventory) {
    items.push({ label: 'Inventory', path: '/staff/inventory', icon: Package });
  }
  if (canExpenses) {
    items.push({ label: 'Expenses', path: '/staff/expenses', icon: Receipt });
  }
  if (canOperations) {
    items.push({ label: 'Operations', path: '/staff/operations', icon: Wrench });
  }

  if (items.length === 0) return null;

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    logger.log('[StaffBottomNav] visible nav items', {
      uid: user.id,
      items: items.map((i) => i.path),
    });
  }

  return (
    <div
      className="fixed inset-x-0 bottom-3.5 z-[60] lg:hidden flex justify-center pointer-events-none"
      data-tour="staff-bottom-nav"
    >
      <nav
        className="pointer-events-auto w-[92%] max-w-[480px] rounded-2xl min-h-[56px] flex items-center justify-around px-1 py-1.5 gap-1 relative overflow-hidden bg-fv-cream dark:bg-card border border-primary/10 dark:border-emerald-200/10 border-t-primary/20 dark:border-t-emerald-200/15 shadow-[0_10px_24px_-16px_rgba(27,67,50,0.38),0_4px_10px_-6px_rgba(27,67,50,0.2)] dark:shadow-[0_12px_26px_-16px_rgba(0,0,0,0.65),0_4px_10px_-6px_rgba(0,0,0,0.5)]"
        aria-label="Staff bottom navigation"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-primary/15 to-transparent dark:from-emerald-900/30"
        />
        {items.map((item) => {
          const Icon = item.icon;
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
            <NavLink
              key={item.path}
              to={item.path}
              onClick={(e) => {
                if (!isLocked) return;
                e.preventDefault();
                e.stopPropagation();
                openUpgradeModal({ checkoutPlan: 'pro' });
              }}
              className={cn(
                'relative z-10 flex flex-1 min-w-0 min-h-[44px] rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                isActive && 'bg-green-100/85 dark:bg-emerald-900/45',
              )}
              style={
                isActive
                  ? {
                      boxShadow: ACTIVE_TAB_SHADOW,
                    }
                  : undefined
              }
            >
              <span className="flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 min-h-[44px] py-1 px-2">
                <span className="flex items-center justify-center h-5 w-5 shrink-0">
                  <Icon
                    className={cn(
                      'h-5 w-5 shrink-0 transition-colors duration-200 ease-in-out',
                      isActive
                        ? 'text-primary dark:text-emerald-100'
                        : 'text-primary/60 dark:text-emerald-100/60',
                    )}
                  />
                  {isLocked ? (
                    <span className="absolute -top-0.5 -right-0.5 rounded-full bg-muted px-1 py-0.5">
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    'text-[10px] font-medium truncate max-w-[72px] text-center transition-colors duration-200 ease-in-out',
                    isActive
                      ? 'text-primary dark:text-emerald-100'
                      : 'text-primary/60 dark:text-emerald-100/60',
                  )}
                >
                  {item.label}
                </span>
              </span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}


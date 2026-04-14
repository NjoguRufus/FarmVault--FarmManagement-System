import React, { useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { cn, getDisplayRole } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { getNavItemsForSidebar } from '@/config/navConfig';
import { usePermissions } from '@/hooks/usePermissions';
import { getModuleForPath } from '@/lib/permissions';
import { UserAvatar } from '@/components/UserAvatar';
import { useEffectivePlanAccess } from '@/hooks/useEffectivePlanAccess';
import { ProBadge } from '@/components/subscription';
import { getLockedProFeatureForPath } from '@/config/lockedProRoutes';
import { openUpgradeModal } from '@/lib/upgradeModalEvents';
import { features, type SubscriptionTier } from '@/config/subscriptionFeatureMatrix';
import { logger } from "@/lib/logger";

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

function getSidebarTourId(path: string): string | undefined {
  const normalized = path.replace(/\/+/g, '/');
  const map: Record<string, string> = {
    '/dashboard': 'nav-dashboard',
    '/projects': 'nav-projects',
    '/operations': 'nav-operations',
    '/manager/operations': 'nav-operations',
    '/inventory': 'nav-inventory',
    '/harvest': 'nav-harvest-sales',
    '/harvest-sales': 'nav-harvest-sales',
    '/reports': 'nav-reports',
    '/settings': 'nav-settings',
    '/broker': 'nav-broker-dashboard',
    '/broker/harvest-sales': 'nav-broker-harvest-sales',
    '/broker/expenses': 'nav-broker-expenses',
  };
  return map[normalized];
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const { can } = usePermissions();
  const isMobile = useIsMobile();
  const { plan, isDeveloper, isLoading: planLoading, isOverride } = useEffectivePlanAccess();

  const normalizedCurrentPath = useMemo(
    () => location.pathname.replace(/\/+/g, '/'),
    [location.pathname],
  );

  const navItems = getNavItemsForSidebar(user).filter((item) => {
    const module = getModuleForPath(item.path);
    if (!module) return true;
    return can(module, 'view');
  });

  const currentTier: SubscriptionTier =
    isDeveloper || plan === 'enterprise' || isOverride ? 'pro' : plan === 'pro' ? 'pro' : 'basic';

  const canAccessTier = (required: SubscriptionTier) => {
    if (required === 'basic') return true;
    return currentTier === 'pro';
  };

  if (import.meta.env.DEV && user) {
    // eslint-disable-next-line no-console
    logger.log('[Nav] visible nav items', {
      uid: user.id,
      items: navItems.map((i) => i.path),
    });
  }

  return (
    <div className="hidden lg:block">
      {/* Mobile overlay when sidebar is open (desktop only - sidebar hidden on mobile) */}
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
          // On small screens: overlay behavior - slide in/out (handled by translate classes)
          // On large screens: always visible, just changes width
          collapsed 
            ? 'w-16 -translate-x-full lg:translate-x-0' 
            : 'w-60 translate-x-0'
        )}
        style={{
          boxShadow: 'var(--shadow-sidebar)',
        }}
      >
      {/* Logo Section */}
      <div className="flex h-16 shrink-0 items-center px-4 border-b border-sidebar-border/30">
        <div className="flex w-full flex-col items-start justify-center">
          <img
            src={collapsed ? "/Logo/FarmVault_Logo dark mode.png" : "/Logo/fv.png"}
            alt="FarmVault logo"
            className="h-8 w-auto rounded-md object-contain"
          />
          {!collapsed && (
            <span className="mt-1 text-xs text-sidebar-muted">Smart Farm Management</span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 overflow-y-auto py-4 px-3 scrollbar-thin">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const normalizedPath = normalizedCurrentPath;
            const itemPath = item.path.replace(/\/+/g, '/');
            const isActive = normalizedPath === itemPath || (itemPath !== '/' && normalizedPath.startsWith(itemPath + '/'));
            const Icon = item.icon;
            const lockedFeature = getLockedProFeatureForPath(itemPath);
            const requiredTier = lockedFeature ? features[lockedFeature] : 'basic';
            const isLocked =
              Boolean(lockedFeature) &&
              !planLoading &&
              !isDeveloper &&
              !canAccessTier(requiredTier);

            const sharedClassName = cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
              isActive
                ? 'bg-sidebar-accent text-sidebar-primary'
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            );

            const sharedChildren = (
              <>
                <Icon className={cn('h-5 w-5 shrink-0', isActive && 'text-sidebar-primary')} />
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
              </>
            );

            return (
              <li key={item.path}>
                {item.external ? (
                  <a
                    href={itemPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={sharedClassName}
                    onClick={() => { if (isMobile) onToggle(); }}
                  >
                    {sharedChildren}
                  </a>
                ) : (
                  <Link
                    to={itemPath}
                    data-tour={getSidebarTourId(itemPath)}
                    className={sharedClassName}
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
                    {sharedChildren}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User Section */}
      {!collapsed && user && (
        <div className="shrink-0 border-t border-sidebar-border/30 p-4">
          <div className="flex items-center gap-3">
            <UserAvatar
              avatarUrl={user.avatar}
              name={user.name}
              size="md"
              className="h-9 w-9 shrink-0"
              fallbackClassName="bg-sidebar-accent text-sidebar-foreground"
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-sidebar-foreground">{user.name}</span>
              <span className="text-xs text-sidebar-muted">{getDisplayRole(user)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Collapse Toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full bg-card border border-border shadow-sm hover:bg-muted transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 text-foreground" />
        ) : (
          <ChevronLeft className="h-4 w-4 text-foreground" />
        )}
      </button>
    </aside>
    </div>
  );
}

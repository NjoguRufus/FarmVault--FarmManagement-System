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
import { brokerMayAccessNavPath } from '@/lib/brokerNav';
import { isNavItemActive } from '@/lib/navActive';

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
  const { user, effectiveAccess } = useAuth();
  const { can } = usePermissions();
  const isMobile = useIsMobile();
  const { plan, isDeveloper, isLoading: planLoading, isOverride } = useEffectivePlanAccess();

  const navItems = getNavItemsForSidebar(user).filter((item) => {
    if (effectiveAccess.isBroker && brokerMayAccessNavPath(item.path)) return true;
    const module = getModuleForPath(item.path);
    if (!module) return true;
    return can(module, 'view');
  });

  const isDeveloperShell = Boolean(user?.role === 'developer');
  const isCompanyAdminShell = Boolean(user?.role === 'company-admin' || user?.role === 'company_admin');

  const developerSectionOrder = [
    'Platform Overview',
    'Workspace Management',
    'Finance & Billing',
    'Operations & Monitoring',
    'Communication',
    'Security, Compliance & Data',
  ] as const;
  const companySectionOrder = [
    'Farm Overview',
    'Farm Operations',
    'Team & Partners',
    'Insights & Records',
    'Finance & Subscription',
    'Settings & Help',
  ] as const;

  const getDeveloperSection = (path: string) => {
    switch (path) {
      case '/developer':
        return 'Platform Overview';
      case '/developer/companies':
      case '/developer/users':
      case '/developer/settings':
      case '/developer/integrations':
      case '/developer/company-migrations':
        return 'Workspace Management';
      case '/developer/finances':
      case '/developer/subscription-analytics':
      case '/developer/farmvault-expenses':
      case '/developer/billing-confirmation':
        return 'Finance & Billing';
      case '/developer/qr':
      case '/developer/records':
      case '/developer/code-red':
      case '/developer/backups':
        return 'Operations & Monitoring';
      case '/developer/email-center':
      case '/developer/feedback-inbox':
        return 'Communication';
      case '/developer/audit-logs':
      case '/developer/documents':
        return 'Security, Compliance & Data';
      default:
        return 'Workspace Management';
    }
  };

  const getCompanySection = (path: string) => {
    switch (path) {
      case '/dashboard':
        return 'Farm Overview';
      case '/projects':
      case '/operations':
      case '/inventory':
      case '/harvest':
        return 'Farm Operations';
      case '/employees':
      case '/suppliers':
        return 'Team & Partners';
      case '/records':
      case '/reports':
        return 'Insights & Records';
      case '/expenses':
      case '/billing':
        return 'Finance & Subscription';
      case '/settings':
      case '/support':
      case '/feedback':
        return 'Settings & Help';
      default:
        return 'Farm Operations';
    }
  };

  const groupedNavItems = useMemo(() => {
    if (!isDeveloperShell && !isCompanyAdminShell) return [{ title: null, items: navItems }];

    const sectionOrder = isDeveloperShell ? developerSectionOrder : companySectionOrder;
    const sectionForPath = isDeveloperShell ? getDeveloperSection : getCompanySection;
    const buckets = new Map<string, typeof navItems>();
    sectionOrder.forEach((title) => buckets.set(title, []));

    navItems.forEach((item) => {
      const section = sectionForPath(item.path.replace(/\/+/g, '/'));
      const bucket = buckets.get(section);
      if (bucket) bucket.push(item);
    });

    return sectionOrder
      .map((title) => ({ title, items: buckets.get(title) ?? [] }))
      .filter((group) => group.items.length > 0);
  }, [isDeveloperShell, isCompanyAdminShell, navItems]);

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
          {groupedNavItems.map((group, groupIndex) => (
            <React.Fragment key={group.title ?? `default-${groupIndex}`}>
              {!collapsed && group.title ? (
                <li className={cn('pt-2', groupIndex === 0 && 'pt-0')}>
                  <p className="px-3 pb-1 text-[11px] uppercase tracking-[0.14em] text-sidebar-muted/90">
                    {group.title}
                  </p>
                </li>
              ) : null}
              {group.items.map((item) => {
            const itemPath = item.path;
            const isActive = item.external
              ? false
              : isNavItemActive(location.pathname, location.search, itemPath);
            const Icon = item.icon;
            const lockedFeature = getLockedProFeatureForPath(itemPath.split('?')[0]);
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
                        href={item.path.split('?')[0]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={sharedClassName}
                        onClick={() => { if (isMobile) onToggle(); }}
                      >
                        {sharedChildren}
                      </a>
                    ) : (
                      <Link
                        to={item.path}
                        data-tour={getSidebarTourId(item.path.split('?')[0])}
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
            </React.Fragment>
          ))}
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

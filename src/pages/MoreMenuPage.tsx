import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  buildCompanyMobileDrawerGroups,
  getMoreNavItems,
  getNavItemsForSidebar,
} from '@/config/navConfig';
import { usePermissions } from '@/hooks/usePermissions';
import { getModuleForPath } from '@/lib/permissions';
import { brokerMayAccessNavPath } from '@/lib/brokerNav';
import { cn } from '@/lib/utils';
export default function MoreMenuPage() {
  const { user, effectiveAccess } = useAuth();
  const { can } = usePermissions();

  const allNavItems = useMemo(() => {
    return getNavItemsForSidebar(user).filter((item) => {
      if (effectiveAccess.isBroker && brokerMayAccessNavPath(item.path)) return true;
      const module = getModuleForPath(item.path);
      if (!module) return true;
      return can(module, 'view');
    });
  }, [user, effectiveAccess.isBroker, can]);

  const groups = useMemo(() => {
    const built = buildCompanyMobileDrawerGroups(allNavItems);
    if (built.some((g) => g.items.length > 0)) return built;
    const more = getMoreNavItems(user).filter((item) => {
      if (effectiveAccess.isBroker && brokerMayAccessNavPath(item.path)) return true;
      const module = getModuleForPath(item.path);
      if (!module) return true;
      return can(module, 'view');
    });
    return more.length ? [{ title: 'Menu', items: more }] : [];
  }, [allNavItems, user, effectiveAccess.isBroker, can]);

  return (
    <div className="min-h-[50vh] space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">More</h1>
        <p className="text-muted-foreground">Jump to any section of your farm.</p>
      </div>
      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.title}>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {group.title}
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-[hsl(var(--fv-success))]',
                        'shadow-sm transition-colors hover:bg-[hsl(var(--fv-gold-soft))]/50 hover:border-[#bd922f]/35'
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0 text-[hsl(var(--fv-success))]" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

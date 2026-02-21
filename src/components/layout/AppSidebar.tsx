import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, getDisplayRole } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { getNavItemsForSidebar } from '@/config/navConfig';

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
  const isMobile = useIsMobile();

  const navItems = getNavItemsForSidebar(user);

  return (
    <div className="hidden md:block">
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
          // On mobile: overlay behavior - slide in/out
          // On desktop: always visible, just changes width
          collapsed 
            ? 'w-16 -translate-x-full md:translate-x-0' 
            : 'w-60 translate-x-0'
        )}
        style={{
          boxShadow: 'var(--shadow-sidebar)',
        }}
      >
      {/* Logo Section */}
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
              <span className="text-xs text-sidebar-muted">Management</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 overflow-y-auto py-4 px-3 scrollbar-thin">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const normalizedPath = location.pathname.replace(/\/+/g, '/');
            const itemPath = item.path.replace(/\/+/g, '/');
            const isActive = normalizedPath === itemPath || (itemPath !== '/' && normalizedPath.startsWith(itemPath + '/'));
            const Icon = item.icon;

            return (
              <li key={item.path}>
                <Link
                  to={itemPath}
                  onClick={() => isMobile && onToggle()}
                  data-tour={getSidebarTourId(itemPath)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-primary'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                  )}
                >
                  <Icon className={cn('h-5 w-5 shrink-0', isActive && 'text-sidebar-primary')} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User Section */}
      {!collapsed && user && (
        <div className="shrink-0 border-t border-sidebar-border/30 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-foreground font-medium text-sm">
              {user.name.charAt(0)}
            </div>
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

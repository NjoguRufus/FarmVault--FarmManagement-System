import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ambassadorConsoleNav } from "@/components/layout/ambassadorConsoleNav";

interface AmbassadorSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function AmbassadorSidebar({ collapsed, onToggle }: AmbassadorSidebarProps) {
  const location = useLocation();
  const path = location.pathname.replace(/\/+/g, "/");

  return (
    <div className="hidden lg:block">
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen flex-col transition-all duration-300 fv-sidebar",
          collapsed ? "w-16" : "w-60",
        )}
        style={{ boxShadow: "var(--shadow-sidebar)" }}
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-4 border-b border-sidebar-border/30">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/Logo/FarmVault_Logo dark mode.png"
              alt="FarmVault"
              className="h-8 w-auto shrink-0 rounded-md object-contain bg-sidebar-primary/10 p-1"
            />
            {!collapsed && (
              <div className="min-w-0 flex flex-col">
                <span className="text-sm font-semibold text-sidebar-foreground truncate">FarmVault</span>
                <span className="text-xs text-sidebar-muted">Ambassador</span>
              </div>
            )}
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto py-4 px-3 scrollbar-thin">
          <ul className="space-y-1">
            {ambassadorConsoleNav.map((item) => {
              const itemPath = item.to.replace(/\/+/g, "/");
              const isActive = path === itemPath || (itemPath !== "/" && path.startsWith(`${itemPath}/`));
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-primary"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                    )}
                  >
                    <Icon className={cn("h-5 w-5 shrink-0", isActive && "text-sidebar-primary")} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <button
          type="button"
          onClick={onToggle}
          className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full bg-card border border-border shadow-sm hover:bg-muted transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4 text-foreground" /> : <ChevronLeft className="h-4 w-4 text-foreground" />}
        </button>
      </aside>
    </div>
  );
}

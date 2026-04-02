import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ambassadorConsoleNav } from "@/components/layout/ambassadorConsoleNav";

/**
 * Fixed bottom tab bar for ambassador console on viewports where the sidebar is hidden.
 */
export function AmbassadorMobileBottomNav() {
  return (
    <nav
      className={cn(
        "fixed bottom-0 inset-x-0 z-50 lg:hidden",
        "border-t border-border/60 bg-background/95 backdrop-blur-md",
        "supports-[backdrop-filter]:bg-background/85",
        "pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1",
        "shadow-[0_-6px_24px_-4px_rgba(0,0,0,0.08)]",
      )}
      aria-label="Ambassador navigation"
    >
      <ul className="flex">
        {ambassadorConsoleNav.map((item) => {
          const Icon = item.icon;
          const label = item.shortLabel ?? item.label;
          return (
            <li key={item.to} className="min-w-0 flex-1">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center justify-center gap-0.5 py-2 px-0.5 min-h-[3.25rem] transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={cn("h-5 w-5 shrink-0", isActive && "text-primary")} aria-hidden />
                    <span
                      className={cn(
                        "text-[10px] font-semibold leading-tight text-center max-w-full px-0.5 line-clamp-2",
                        isActive && "text-primary",
                      )}
                    >
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

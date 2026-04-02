import React from "react";
import { Menu } from "lucide-react";
import { UserButton, useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getAmbassadorSession, clearAmbassadorSession } from "@/services/ambassadorService";
import { toast } from "sonner";
import { DashboardRoleClerkMenuItems } from "@/components/dashboard/DashboardRoleSwitcher";

interface AmbassadorTopBarProps {
  sidebarCollapsed: boolean;
  onMenuClick: () => void;
}

export function AmbassadorTopBar({ sidebarCollapsed, onMenuClick }: AmbassadorTopBarProps) {
  const { user, isLoaded } = useUser();
  const legacySession = typeof window !== "undefined" ? getAmbassadorSession() : null;

  function handleLegacySignOut() {
    clearAmbassadorSession();
    toast.message("Signed out");
    window.location.href = "/ambassador/signup";
  }

  return (
    <header
      className={cn(
        "fixed top-0 right-0 z-40 h-16 bg-card border-b border-border transition-all duration-300",
        "left-0",
        sidebarCollapsed ? "lg:left-16" : "lg:left-60",
      )}
    >
      <div className="flex h-full items-center justify-between px-4 sm:px-6 gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Mobile: logo + brand (navigation is the bottom bar) */}
          <div className="flex items-center gap-2.5 min-w-0 lg:hidden">
            <img
              src="/Logo/FarmVault_Logo dark mode.png"
              alt="FarmVault"
              className="h-8 w-auto shrink-0 rounded-md object-contain bg-primary/10 p-1"
            />
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-semibold text-foreground truncate">FarmVault</p>
              <p className="text-xs text-muted-foreground truncate">Ambassador</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 hidden lg:inline-flex"
            onClick={onMenuClick}
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isLoaded && user ? (
            <UserButton afterSignOutUrl="/ambassador" appearance={{ elements: { userButtonAvatarBox: "h-9 w-9" } }}>
              <DashboardRoleClerkMenuItems />
            </UserButton>
          ) : isLoaded && legacySession ? (
            <Button type="button" variant="outline" size="sm" className="text-xs" onClick={handleLegacySignOut}>
              Sign out
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

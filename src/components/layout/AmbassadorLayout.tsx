import React, { useCallback, useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useUser } from "@clerk/react";
import { cn } from "@/lib/utils";
import { AmbassadorSidebar } from "@/components/layout/AmbassadorSidebar";
import { AmbassadorTopBar } from "@/components/layout/AmbassadorTopBar";
import { AmbassadorMobileBottomNav } from "@/components/layout/AmbassadorMobileBottomNav";
import { getAmbassadorSession } from "@/services/ambassadorService";
import { useAuth } from "@/contexts/AuthContext";
import { useAmbassadorAccess } from "@/contexts/AmbassadorAccessContext";
import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";

export function AmbassadorLayout() {
  const { user: clerkUser, isLoaded } = useUser();
  const { authReady, user: fvUser } = useAuth();
  const { workspaceMode } = useAmbassadorAccess();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [gateOk, setGateOk] = useState(false);

  useEffect(() => {
    // Wait for both Clerk and FarmVault auth to be ready — this is what kills the flicker.
    // Rendering anything before authReady=true risks showing the wrong layout or triggering
    // role-based redirects mid-render.
    if (!isLoaded || !authReady) return;

    const s = getAmbassadorSession();
    if (!clerkUser && !s?.id) {
      navigate("/ambassador/signup", { replace: true });
      return;
    }

    // If FarmVault auth resolved a user, verify they're an ambassador before showing the shell.
    // profileUserType is set from core.profiles before authReady=true — no extra DB call needed.
    if (fvUser) {
      const pt = fvUser.profileUserType;
      const isAmbassador = pt === "ambassador" || pt === "both";
      if (!isAmbassador) {
        navigate("/auth/callback", { replace: true });
        return;
      }
      if (pt === "both" && fvUser.companyId && workspaceMode === "company") {
        navigate("/dashboard", { replace: true });
        return;
      }
    }

    setGateOk(true);
  }, [isLoaded, authReady, clerkUser, fvUser, navigate, workspaceMode]);

  const handleMenuClick = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      setSidebarCollapsed((c) => !c);
    }
  }, []);

  if (!isLoaded || !authReady || !gateOk) {
    return <AuthLoadingScreen message="Opening ambassador console…" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AmbassadorSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
      />
      <AmbassadorTopBar sidebarCollapsed={sidebarCollapsed} onMenuClick={handleMenuClick} />

      <AmbassadorMobileBottomNav />

      <main
        className={cn(
          "pt-16 min-h-screen transition-all duration-300",
          "pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] lg:pb-6",
          sidebarCollapsed ? "lg:pl-16" : "lg:pl-60",
        )}
      >
        <div className="px-3 py-3 sm:px-6 sm:py-4 space-y-3 sm:space-y-4 max-lg:max-w-[100vw] overflow-x-hidden">
          <header className="hidden lg:flex flex-col gap-1.5 border-b border-border/50 pb-2.5 sm:pb-3">
            <div className="flex items-center gap-2 text-[10px] font-medium text-primary/80 uppercase tracking-[0.16em] sm:text-xs sm:tracking-[0.18em]">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px]">
                Am
              </span>
              <span className="truncate">FarmVault Ambassador Console</span>
            </div>
          </header>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

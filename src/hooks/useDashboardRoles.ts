import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchDashboardSwitcherCapabilities } from "@/services/dashboardSwitcherCapabilitiesService";

export type DashboardRoles = {
  /** At least one company membership with a real company row (DB; not session-only). */
  hasCompany: boolean;
  /** Row in public.ambassadors for this Clerk user (DB). */
  hasAmbassador: boolean;
  /** Waiting on capabilities RPC while Clerk + Auth are ready. */
  loading: boolean;
  hasCompanyAndAmbassador: boolean;
};

/**
 * Dashboard switcher + post-auth routing: capabilities from `dashboard_switcher_capabilities`
 * (JWT / Clerk id), device- and cache-independent. Falls back if RPC is not deployed.
 */
export function useDashboardRoles(): DashboardRoles {
  const { authReady, user } = useAuth();
  const [resolved, setResolved] = useState(false);
  const [hasAmbassador, setHasAmbassador] = useState(false);
  const [hasCompany, setHasCompany] = useState(false);

  useEffect(() => {
    if (!authReady || !user) {
      setResolved(true);
      setHasAmbassador(false);
      setHasCompany(false);
      return;
    }

    setResolved(false);
    let cancelled = false;

    (async () => {
      try {
        const caps = await fetchDashboardSwitcherCapabilities(user.id, Boolean(user.companyId));
        if (!cancelled) {
          setHasAmbassador(caps.isAmbassador);
          setHasCompany(caps.hasCompany);
          setResolved(true);
        }
      } catch {
        if (!cancelled) {
          setHasAmbassador(false);
          setHasCompany(Boolean(user.companyId));
          setResolved(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, user?.id, user?.companyId]);

  const loading = Boolean(authReady && user && !resolved);

  return {
    hasCompany,
    hasAmbassador,
    loading,
    hasCompanyAndAmbassador: hasCompany && hasAmbassador,
  };
}

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchMyAmbassadorDashboardStats } from "@/services/ambassadorService";

export type DashboardRoles = {
  /** User has an active company workspace (companyId on session). */
  hasCompany: boolean;
  /** Row exists in ambassadors for this account (RPC ok). */
  hasAmbassador: boolean;
  /** Waiting on ambassador RPC while Clerk + Auth are ready. */
  loading: boolean;
  hasCompanyAndAmbassador: boolean;
};

/**
 * Detects company vs ambassador capabilities for routing and the dashboard role switcher.
 */
export function useDashboardRoles(): DashboardRoles {
  const { authReady, user } = useAuth();
  const [ambassadorResolved, setAmbassadorResolved] = useState(false);
  const [hasAmbassador, setHasAmbassador] = useState(false);

  useEffect(() => {
    if (!authReady || !user) {
      setAmbassadorResolved(true);
      setHasAmbassador(false);
      return;
    }

    setAmbassadorResolved(false);
    let cancelled = false;

    (async () => {
      try {
        const r = await fetchMyAmbassadorDashboardStats();
        if (!cancelled) {
          setHasAmbassador(r.ok === true);
          setAmbassadorResolved(true);
        }
      } catch {
        if (!cancelled) {
          setHasAmbassador(false);
          setAmbassadorResolved(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, user?.id]);

  const hasCompany = Boolean(user?.companyId);
  const loading = Boolean(authReady && user && !ambassadorResolved);

  return {
    hasCompany,
    hasAmbassador,
    loading,
    hasCompanyAndAmbassador: hasCompany && hasAmbassador,
  };
}

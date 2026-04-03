import { pickFirstExistingMembershipCompany } from "@/lib/auth/tenantMembershipRecovery";
import { supabase } from "@/lib/supabase";
import { fetchMyAmbassadorDashboardStats } from "@/services/ambassadorService";

export type DashboardSwitcherCapabilities = {
  isAmbassador: boolean;
  hasCompany: boolean;
};

type RpcPayload = {
  is_ambassador?: boolean;
  has_company?: boolean;
};

async function fetchCapabilitiesClientFallback(clerkUserId: string): Promise<DashboardSwitcherCapabilities> {
  const [ambassadorResult, membership] = await Promise.all([
    fetchMyAmbassadorDashboardStats()
      .then((r) => r.ok === true)
      .catch(() => false),
    pickFirstExistingMembershipCompany(clerkUserId).catch(() => null),
  ]);
  return {
    isAmbassador: ambassadorResult,
    hasCompany: membership != null,
  };
}

/**
 * Switcher visibility: ambassador row + company membership from DB (JWT identity).
 * Prefer `dashboard_switcher_capabilities` RPC; on failure, query membership + ambassador RPC client-side.
 */
export async function fetchDashboardSwitcherCapabilities(
  clerkUserId: string | null | undefined,
  sessionHasCompanyId: boolean,
): Promise<DashboardSwitcherCapabilities> {
  const { data, error } = await supabase.rpc("dashboard_switcher_capabilities");

  if (!error && data != null && typeof data === "object") {
    const row = data as RpcPayload;
    return {
      isAmbassador: row.is_ambassador === true,
      hasCompany: row.has_company === true,
    };
  }

  if (import.meta.env.DEV && error) {
    // eslint-disable-next-line no-console
    console.warn("[dashboard_switcher_capabilities] RPC unavailable; using fallback", error);
  }

  if (clerkUserId) {
    return fetchCapabilitiesClientFallback(clerkUserId);
  }

  return {
    isAmbassador: false,
    hasCompany: Boolean(sessionHasCompanyId),
  };
}

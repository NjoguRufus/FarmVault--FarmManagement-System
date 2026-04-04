import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import {
  fetchAmbassadorDashboardStats,
  fetchAmbassadorEarningsTransactions,
  fetchAmbassadorReferralRows,
  fetchMyAmbassadorDashboardStats,
  fetchMyAmbassadorEarningsTransactions,
  fetchMyAmbassadorReferralRows,
  getAmbassadorSession,
} from "@/services/ambassadorService";

function sessionIdKey(): string {
  return getAmbassadorSession()?.id ?? "none";
}

export function useAmbassadorConsoleStatsQuery(enabled: boolean) {
  const { user, isLoaded } = useUser();
  return useQuery({
    queryKey: ["ambassador", "console", "stats", user?.id ?? sessionIdKey()],
    enabled: isLoaded && enabled,
    queryFn: async () => {
      if (user) {
        return fetchMyAmbassadorDashboardStats();
      }
      const s = getAmbassadorSession();
      if (!s?.id) {
        return { ok: false as const, error: "no_session" };
      }
      return fetchAmbassadorDashboardStats(s.id);
    },
  });
}

export function useAmbassadorConsoleReferralsQuery(enabled: boolean) {
  const { user, isLoaded } = useUser();
  return useQuery({
    queryKey: ["ambassador", "console", "referrals", user?.id ?? sessionIdKey()],
    enabled: isLoaded && enabled,
    queryFn: async () => {
      if (user) {
        return fetchMyAmbassadorReferralRows();
      }
      const s = getAmbassadorSession();
      if (!s?.id) {
        return { ok: false as const, error: "no_session" };
      }
      return fetchAmbassadorReferralRows(s.id);
    },
  });
}

export function useAmbassadorEarningsTransactionsQuery(enabled: boolean) {
  const { user, isLoaded } = useUser();
  return useQuery({
    queryKey: ["ambassador", "console", "earnings-tx", user?.id ?? sessionIdKey()],
    enabled: isLoaded && enabled,
    queryFn: async () => {
      if (user) {
        return fetchMyAmbassadorEarningsTransactions();
      }
      const s = getAmbassadorSession();
      if (!s?.id) {
        return { ok: false as const, error: "no_session" };
      }
      return fetchAmbassadorEarningsTransactions(s.id);
    },
  });
}

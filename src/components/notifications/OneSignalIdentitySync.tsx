import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { queueOneSignalIdentitySync, queueOneSignalLogout, resetOneSignalSubscription } from "@/services/oneSignalService";
import { getCompany } from "@/services/companyService";

function mapRoleTag(role: string | undefined, profileUserType: string | null | undefined): "developer" | "company" | "ambassador" {
  const profileType = (profileUserType ?? "").trim().toLowerCase();
  if (profileType === "ambassador" || profileType === "both") return "ambassador";
  if ((role ?? "").trim().toLowerCase() === "developer") return "developer";
  return "company";
}

function resolveRoleTags(role: string | undefined, profileUserType: string | null | undefined): Array<"developer" | "company" | "ambassador"> {
  const out = new Set<"developer" | "company" | "ambassador">();
  const baseRole = (role ?? "").trim().toLowerCase();
  const profileType = (profileUserType ?? "").trim().toLowerCase();
  if (baseRole === "developer") out.add("developer");
  if (profileType === "ambassador" || profileType === "both") out.add("ambassador");
  // Most FarmVault users are company users unless strictly developer-only.
  if (baseRole !== "developer" || profileType === "both") out.add("company");
  if (out.size === 0) out.add("company");
  return Array.from(out);
}

function mapPlanTag(plan: "trial" | "basic" | "pro" | "enterprise" | undefined): "basic" | "pro" {
  if (plan === "pro" || plan === "enterprise") return "pro";
  return "basic";
}

export function OneSignalIdentitySync() {
  const { user, isAuthenticated } = useAuth();
  const { plan } = useSubscriptionStatus();
  const resetDone = useRef(false);

  // Run once per session after login to recover users whose subscription
  // silently expired, was never confirmed, or missed the initial prompt.
  useEffect(() => {
    if (!user?.id || resetDone.current) return;
    resetDone.current = true;
    resetOneSignalSubscription(user.id);
  }, [user?.id]);

  const { data: companyData } = useQuery({
    queryKey: ["company", user?.companyId],
    enabled: !!user?.companyId,
    queryFn: () => getCompany(user!.companyId!),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      queueOneSignalLogout();
      return;
    }

    queueOneSignalIdentitySync({
      userId: user.id,
      role: mapRoleTag(user.role, user.profileUserType),
      roles: resolveRoleTags(user.role, user.profileUserType),
      plan: mapPlanTag(plan),
      companyId: user.companyId ?? null,
      notificationsEnabled: companyData?.notifications_enabled ?? false,
    });
  }, [isAuthenticated, user?.id, user?.role, user?.profileUserType, user?.companyId, plan, companyData?.notifications_enabled]);

  return null;
}

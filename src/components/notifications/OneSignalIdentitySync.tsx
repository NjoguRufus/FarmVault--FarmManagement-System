import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { queueOneSignalIdentitySync, queueOneSignalLogout } from "@/services/oneSignalService";

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
    });
  }, [isAuthenticated, user?.id, user?.role, user?.profileUserType, user?.companyId, plan]);

  return null;
}


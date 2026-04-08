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
      plan: mapPlanTag(plan),
    });
  }, [isAuthenticated, user?.id, user?.role, user?.profileUserType, plan]);

  return null;
}


import { Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";

/**
 * Waits for auth before rendering the farm shell. Brokers use the same `MainLayout` as other roles;
 * `RequireNotBroker` + `MainLayout` broker path rules restrict admin-only pages.
 */
export function FarmRoleGate() {
  const { authReady, isAuthenticated } = useAuth();

  if (!authReady || !isAuthenticated) {
    return <AuthLoadingScreen message="Signing you in…" />;
  }

  return <Outlet />;
}

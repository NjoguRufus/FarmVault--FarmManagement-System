import { useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";

/**
 * OAuth / SSO return URL for Clerk. Hands off to `/auth/continue` so role, staff landing, and onboarding
 * resolve in one place (`resolvePostAuthDestination`).
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();

  useLayoutEffect(() => {
    navigate("/auth/continue", { replace: true });
  }, [navigate]);

  return <AuthLoadingScreen message="Signing you in…" />;
}

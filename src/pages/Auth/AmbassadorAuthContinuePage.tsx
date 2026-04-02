/**
 * Post-Clerk entry for ambassador flow: create platform profile if needed, then route by ambassador row
 * (RPC uses linked profile / email). Never signs out or sends users to sign-up with access-revoked.
 */
import React, { useEffect, useRef } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth as useClerkAuth } from "@clerk/react";
import { useAuth } from "@/contexts/AuthContext";
import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";
import { getAmbassadorSignInPath } from "@/lib/ambassador/clerkAuth";
import { fetchMyAmbassadorDashboardStats } from "@/services/ambassadorService";

export default function AmbassadorAuthContinuePage() {
  const navigate = useNavigate();
  const { isLoaded: clerkLoaded, isSignedIn: clerkSignedIn } = useClerkAuth();
  const { authReady } = useAuth();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!clerkLoaded || !clerkSignedIn) return;
    if (!authReady) return;
    if (ranRef.current) return;
    ranRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        const r = await fetchMyAmbassadorDashboardStats();
        if (cancelled) return;
        if (r.ok) {
          if (r.onboarding_complete) {
            navigate("/ambassador/dashboard", { replace: true });
          } else {
            navigate("/ambassador/onboarding", { replace: true });
          }
          return;
        }
        navigate("/ambassador/onboarding", { replace: true });
      } catch {
        if (!cancelled) navigate("/ambassador/onboarding", { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clerkLoaded, clerkSignedIn, authReady, navigate]);

  if (!clerkLoaded) {
    return <AuthLoadingScreen message="Completing sign-in…" />;
  }

  if (!clerkSignedIn) {
    return <Navigate to={getAmbassadorSignInPath()} replace />;
  }

  if (!authReady) {
    return <AuthLoadingScreen message="Preparing your ambassador account…" />;
  }

  return <AuthLoadingScreen message="Finding your ambassador account…" />;
}

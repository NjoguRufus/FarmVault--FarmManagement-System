import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  getReferralDeviceId,
  persistReferralCodeIfEmpty,
  recordReferralSessionOnServer,
} from "@/lib/ambassador/referralPersistence";
import { resolveFarmerSignUpUrl } from "@/lib/urls/domains";

/**
 * /r/:code — capture referral, record session, redirect to farmer sign-up.
 */
export default function ReferralShortLinkPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { clerkLoaded, hasClerkSession, authReady, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!clerkLoaded) return;

    if (hasClerkSession || (authReady && isAuthenticated)) {
      navigate("/dashboard", { replace: true });
      return;
    }

    const raw = code?.trim();
    if (!raw) {
      navigate("/sign-up", { replace: true });
      return;
    }

    const stored = persistReferralCodeIfEmpty(raw);
    if (stored) {
      recordReferralSessionOnServer(stored);
      void getReferralDeviceId();
    }

    const q = new URLSearchParams({ ref: (stored ?? raw).toUpperCase() });
    const target = resolveFarmerSignUpUrl(q.toString());
    if (target.startsWith("http://") || target.startsWith("https://")) {
      window.location.replace(target);
      return;
    }
    navigate(target, { replace: true });
  }, [clerkLoaded, hasClerkSession, authReady, isAuthenticated, code, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Taking you to sign up…</p>
    </div>
  );
}

import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUser } from "@clerk/react";
import { DeveloperPageShell } from "@/components/developer/DeveloperPageShell";
import { AmbassadorReferralsTable } from "@/components/ambassador/AmbassadorReferralsTable";
import { SeoHead } from "@/seo/SeoHead";
import { SEO_ROUTES } from "@/seo/routes";
import {
  useAmbassadorConsoleReferralsQuery,
  useAmbassadorConsoleStatsQuery,
} from "@/hooks/useAmbassadorConsoleQueries";
import {
  clearAmbassadorSession,
  getAmbassadorSession,
} from "@/services/ambassadorService";
import { Button } from "@/components/ui/button";
import { getAmbassadorSignUpPath } from "@/lib/ambassador/clerkAuth";

export default function AmbassadorReferralsPage() {
  const navigate = useNavigate();
  const { user, isLoaded } = useUser();
  const statsQ = useAmbassadorConsoleStatsQuery(isLoaded);
  const stats = statsQ.data;
  const statsReady = Boolean(stats && stats.ok && stats.onboarding_complete);
  const refQ = useAmbassadorConsoleReferralsQuery(isLoaded && statsReady);

  useEffect(() => {
    if (!statsQ.isFetched || !stats) return;
    if (stats.ok && !stats.onboarding_complete) {
      navigate("/ambassador/onboarding", { replace: true });
      return;
    }
    if (!stats.ok && stats.error === "not_found" && user) {
      navigate("/ambassador/onboarding", { replace: true });
    }
    if (!stats.ok && stats.error === "not_found" && !user && !getAmbassadorSession()) {
      navigate("/ambassador/signup", { replace: true });
    }
    if (!stats.ok && stats.error === "not_found" && !user && getAmbassadorSession()) {
      clearAmbassadorSession();
    }
  }, [statsQ.isFetched, stats, user, navigate]);

  if (!isLoaded || statsQ.isLoading) {
    return (
      <>
        <SeoHead title="Referrals" description="Your FarmVault ambassador referrals." canonical={SEO_ROUTES.ambassadorDashboard} />
        <DeveloperPageShell title="Referrals" isLoading>
          <div className="h-40 rounded-xl border border-border/50 bg-muted/20 animate-pulse" />
        </DeveloperPageShell>
      </>
    );
  }

  if (stats && !stats.ok) {
    if (stats.error === "not_found" && user) {
      return null;
    }
    return (
      <>
        <SeoHead title="Referrals" description="Your FarmVault ambassador referrals." canonical={SEO_ROUTES.ambassadorDashboard} />
        <DeveloperPageShell title="Referrals">
          <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm p-4">
            Could not load ambassador data.
            <Button asChild className="mt-3" variant="secondary" size="sm">
              <Link to={getAmbassadorSignUpPath()}>Get started</Link>
            </Button>
          </div>
        </DeveloperPageShell>
      </>
    );
  }

  if (!stats?.ok) {
    return null;
  }

  const rows = refQ.data?.ok ? refQ.data.rows : [];

  return (
    <>
      <SeoHead title="Referrals" description="Your FarmVault ambassador referrals." canonical={SEO_ROUTES.ambassadorDashboard} />
      <DeveloperPageShell
        title="Referrals"
        description="Full list of everyone attributed to your ambassador account."
        isLoading={refQ.isLoading}
        isRefetching={refQ.isFetching}
        onRefresh={() => void refQ.refetch()}
      >
        <AmbassadorReferralsTable rows={rows} loading={refQ.isLoading} />
      </DeveloperPageShell>
    </>
  );
}

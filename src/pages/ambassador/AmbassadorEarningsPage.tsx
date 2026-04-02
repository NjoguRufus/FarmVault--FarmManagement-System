import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUser } from "@clerk/react";
import { Banknote, TrendingUp } from "lucide-react";
import { DeveloperPageShell } from "@/components/developer/DeveloperPageShell";
import { DeveloperStatGrid } from "@/components/developer/DeveloperStatGrid";
import { StatCard } from "@/components/dashboard/StatCard";
import { SeoHead } from "@/seo/SeoHead";
import { SEO_ROUTES } from "@/seo/routes";
import { useAmbassadorConsoleStatsQuery } from "@/hooks/useAmbassadorConsoleQueries";
import { clearAmbassadorSession, getAmbassadorSession } from "@/services/ambassadorService";
import { Button } from "@/components/ui/button";
import { getAmbassadorSignUpPath } from "@/lib/ambassador/clerkAuth";

function formatKes(n: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

export default function AmbassadorEarningsPage() {
  const navigate = useNavigate();
  const { user, isLoaded } = useUser();
  const statsQ = useAmbassadorConsoleStatsQuery(isLoaded);
  const stats = statsQ.data;

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
        <SeoHead title="Earnings" description="Ambassador commissions and payouts." canonical={SEO_ROUTES.ambassadorDashboard} />
        <DeveloperPageShell title="Earnings" isLoading>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-28 rounded-xl border border-border/50 bg-muted/20 animate-pulse" />
            <div className="h-28 rounded-xl border border-border/50 bg-muted/20 animate-pulse" />
          </div>
        </DeveloperPageShell>
      </>
    );
  }

  if (stats && !stats.ok) {
    if (stats.error === "not_found" && user) return null;
    return (
      <>
        <SeoHead title="Earnings" description="Ambassador commissions and payouts." canonical={SEO_ROUTES.ambassadorDashboard} />
        <DeveloperPageShell title="Earnings">
          <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm p-4">
            Could not load earnings.
            <Button asChild className="mt-3" variant="secondary" size="sm">
              <Link to={getAmbassadorSignUpPath()}>Get started</Link>
            </Button>
          </div>
        </DeveloperPageShell>
      </>
    );
  }

  if (!stats?.ok) return null;

  return (
    <>
      <SeoHead title="Earnings" description="Ambassador commissions and payouts." canonical={SEO_ROUTES.ambassadorDashboard} />
      <DeveloperPageShell
        title="Earnings"
        description="Commission totals from paid and pending (owed) rows in your ambassador account."
        isRefetching={statsQ.isFetching}
        onRefresh={() => void statsQ.refetch()}
      >
        <DeveloperStatGrid cols="2">
          <StatCard
            title="Total earned (paid)"
            value={formatKes(stats.total_earned)}
            icon={<Banknote className="h-4 w-4 sm:h-5 sm:w-5" />}
            variant="primary"
            compact
          />
          <StatCard
            title="Owed"
            value={formatKes(stats.owed)}
            icon={<TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />}
            variant={stats.owed > 0 ? "warning" : "default"}
            compact
          />
        </DeveloperStatGrid>
        <p className="text-xs text-muted-foreground max-w-xl leading-relaxed">
          Payouts and adjustments are managed by FarmVault. Contact support if amounts look incorrect.
        </p>
      </DeveloperPageShell>
    </>
  );
}

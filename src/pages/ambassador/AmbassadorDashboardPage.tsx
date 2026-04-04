import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUser } from "@clerk/react";
import { Banknote, ListOrdered, TrendingUp, UserCheck, UserMinus, Users, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SeoHead } from "@/seo/SeoHead";
import { SEO_ROUTES } from "@/seo/routes";
import { getAmbassadorSignUpPath } from "@/lib/ambassador/clerkAuth";
import { clearAmbassadorSession, getAmbassadorSession } from "@/services/ambassadorService";
import { DeveloperPageShell } from "@/components/developer/DeveloperPageShell";
import { DeveloperStatGrid } from "@/components/developer/DeveloperStatGrid";
import { StatCard } from "@/components/dashboard/StatCard";
import { AmbassadorReferralsTable } from "@/components/ambassador/AmbassadorReferralsTable";
import {
  useAmbassadorConsoleReferralsQuery,
  useAmbassadorConsoleStatsQuery,
  useAmbassadorEarningsTransactionsQuery,
} from "@/hooks/useAmbassadorConsoleQueries";
import { cn } from "@/lib/utils";

function formatKes(n: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

function formatEarningType(type: string): string {
  if (!type) return "—";
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AmbassadorDashboardPage() {
  const navigate = useNavigate();
  const { user, isLoaded: clerkLoaded } = useUser();

  const statsQ = useAmbassadorConsoleStatsQuery(clerkLoaded);
  const stats = statsQ.data;
  const statsReady = Boolean(stats && stats.ok && stats.onboarding_complete);
  const refQ = useAmbassadorConsoleReferralsQuery(clerkLoaded && statsReady);
  const earningsTxQ = useAmbassadorEarningsTransactionsQuery(clerkLoaded && statsReady);

  useEffect(() => {
    if (!statsQ.isFetched || !stats) return;

    if (stats.ok && !stats.onboarding_complete) {
      navigate("/ambassador/onboarding", { replace: true });
      return;
    }

    if (!stats.ok) {
      if (stats.error === "not_found" && user) {
        navigate("/ambassador/onboarding", { replace: true });
        return;
      }
      if (stats.error === "not_found" && !user) {
        const s = getAmbassadorSession();
        if (!s?.id) return;
        clearAmbassadorSession();
        return;
      }
    }
  }, [statsQ.isFetched, stats, user, navigate]);

  if (statsQ.isError) {
    return (
      <>
        <SeoHead title="Ambassador dashboard" description="FarmVault ambassador dashboard" canonical={SEO_ROUTES.ambassadorDashboard} />
        <DeveloperPageShell title="Ambassador Dashboard">
          <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm p-4 max-w-md">
            {statsQ.error instanceof Error ? statsQ.error.message : "Could not load dashboard."}
          </div>
        </DeveloperPageShell>
      </>
    );
  }

  if (!clerkLoaded || statsQ.isLoading) {
    return (
      <>
        <SeoHead title="Ambassador dashboard" description="FarmVault ambassador dashboard" canonical={SEO_ROUTES.ambassadorDashboard} />
        <DeveloperPageShell title="Ambassador Dashboard" isLoading>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-28 rounded-xl border border-border/50 bg-muted/20 animate-pulse" />
            ))}
          </div>
          <div className="h-40 rounded-xl border border-border/50 bg-muted/20 animate-pulse mt-4" />
          <div className="h-64 rounded-xl border border-border/50 bg-muted/20 animate-pulse mt-4" />
        </DeveloperPageShell>
      </>
    );
  }

  if (stats && !stats.ok) {
    const errMsg =
      stats.error === "not_found" && user
        ? null
        : stats.error === "not_found" && !user
          ? "Session expired or invalid. Please sign up again."
          : "Could not load dashboard.";

    if (stats.error === "not_found" && user) {
      return null;
    }

    return (
      <>
        <SeoHead title="Ambassador dashboard" description="FarmVault ambassador dashboard" canonical={SEO_ROUTES.ambassadorDashboard} />
        <DeveloperPageShell title="Ambassador Dashboard">
          <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm p-4 max-w-md">
            <p>{errMsg}</p>
            <Button asChild className="mt-3" variant="secondary" size="sm">
              <Link to={getAmbassadorSignUpPath()}>Get started</Link>
            </Button>
          </div>
        </DeveloperPageShell>
      </>
    );
  }

  if (!stats?.ok) {
    if (!user && !getAmbassadorSession()) {
      return (
        <>
          <SeoHead title="Ambassador dashboard" description="FarmVault ambassador dashboard" canonical={SEO_ROUTES.ambassadorDashboard} />
          <DeveloperPageShell title="Ambassador Dashboard">
            <div className="fv-card p-6 max-w-md text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Create a FarmVault account to join the ambassador program and track referrals.
              </p>
              <div className="flex flex-col gap-2">
                <Button asChild>
                  <Link to={getAmbassadorSignUpPath()}>Create ambassador account</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/ambassador">Program home</Link>
                </Button>
              </div>
            </div>
          </DeveloperPageShell>
        </>
      );
    }

    if (user) {
      return (
        <>
          <SeoHead title="Ambassador dashboard" description="FarmVault ambassador dashboard" canonical={SEO_ROUTES.ambassadorDashboard} />
          <DeveloperPageShell title="Ambassador Dashboard">
            <div className="fv-card p-6 max-w-md text-center space-y-4">
              <p className="text-sm text-muted-foreground">Complete your ambassador profile to view this dashboard.</p>
              <Button asChild>
                <Link to="/ambassador/onboarding">Continue onboarding</Link>
              </Button>
            </div>
          </DeveloperPageShell>
        </>
      );
    }

    return (
      <>
        <SeoHead title="Ambassador dashboard" description="FarmVault ambassador dashboard" canonical={SEO_ROUTES.ambassadorDashboard} />
        <DeveloperPageShell title="Ambassador Dashboard">
          <div className="fv-card p-6 max-w-md text-center text-sm text-muted-foreground">
            <p className="mb-4">Unable to load ambassador dashboard.</p>
            <Button asChild variant="secondary" size="sm">
              <Link to="/ambassador/signup">Back</Link>
            </Button>
          </div>
        </DeveloperPageShell>
      </>
    );
  }

  const referralRows = refQ.data?.ok ? refQ.data.rows : [];
  const earningsRows = earningsTxQ.data?.ok ? earningsTxQ.data.rows : [];

  return (
    <>
      <SeoHead title="Ambassador dashboard" description="Your FarmVault ambassador referrals and commissions." canonical={SEO_ROUTES.ambassadorDashboard} />
      <DeveloperPageShell
        title="Ambassador Dashboard"
        isRefetching={statsQ.isFetching || refQ.isFetching || earningsTxQ.isFetching}
        onRefresh={() => {
          void statsQ.refetch();
          void refQ.refetch();
          void earningsTxQ.refetch();
        }}
        toolbarEnd={
          <Button asChild variant="secondary" size="sm" className="shrink-0">
            <Link to="/ambassador">Program home</Link>
          </Button>
        }
      >
        <div className="space-y-1 -mt-1 mb-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{stats.name || "Ambassador"}</span>
            {!stats.ambassador_active ? (
              <span className="text-amber-600 dark:text-amber-400"> · Inactive</span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">
            Referral code{" "}
            <code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded text-foreground">{stats.referral_code}</code>
          </p>
        </div>

        <DeveloperStatGrid cols="6">
          <StatCard
            title="Total referrals"
            value={String(stats.total_referrals)}
            icon={<Users className="h-4 w-4 sm:h-5 sm:w-5" />}
            variant="default"
            compact
          />
          <StatCard
            title="Active"
            value={String(stats.active_referrals)}
            icon={<UserCheck className="h-4 w-4 sm:h-5 sm:w-5" />}
            variant="primary"
            compact
          />
          <StatCard
            title="Inactive"
            value={String(stats.inactive_referrals)}
            icon={<UserMinus className="h-4 w-4 sm:h-5 sm:w-5" />}
            variant="warning"
            compact
          />
          <StatCard
            title="Total earned"
            value={formatKes(stats.total_earned)}
            icon={<Banknote className="h-4 w-4 sm:h-5 sm:w-5" />}
            variant="primary"
            compact
          />
          <StatCard
            title="Paid"
            value={formatKes(stats.paid)}
            icon={<Wallet className="h-4 w-4 sm:h-5 sm:w-5" />}
            variant="default"
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

        <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden mt-6">
          <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
            <ListOrdered className="h-4 w-4 text-emerald-600 shrink-0" />
            <h2 className="text-sm font-semibold text-foreground">Transactions</h2>
          </div>
          <div className="overflow-x-auto">
            {earningsTxQ.isError ? (
              <p className="text-sm text-destructive px-4 py-6">
                {earningsTxQ.error instanceof Error ? earningsTxQ.error.message : "Could not load transactions."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                      Date
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                      Type
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                      Amount
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {earningsTxQ.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : !earningsTxQ.data?.ok ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        Could not load transactions.
                      </TableCell>
                    </TableRow>
                  ) : earningsRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        No transactions yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    earningsRows.map((tx) => (
                      <TableRow key={tx.id} className="border-border/40">
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {tx.created_at ? new Date(tx.created_at).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-foreground max-w-[200px] truncate">{tx.description || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatEarningType(tx.type)}</TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">{formatKes(tx.amount)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              tx.status === "paid"
                                ? "border-emerald-500/50 text-emerald-700 dark:text-emerald-300"
                                : "border-amber-500/50 text-amber-800 dark:text-amber-300",
                            )}
                          >
                            {tx.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        <AmbassadorReferralsTable rows={referralRows} loading={refQ.isLoading} />
      </DeveloperPageShell>
    </>
  );
}

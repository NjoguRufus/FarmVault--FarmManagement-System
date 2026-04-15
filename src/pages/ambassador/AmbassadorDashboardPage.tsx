import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import {
  BadgeCheck,
  Check,
  CheckCircle,
  CircleHelp,
  Clock,
  Copy,
  ListOrdered,
  Loader2,
  Repeat2,
  TrendingUp,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";
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
  useAmbassadorPayoutsQuery,
} from "@/hooks/useAmbassadorConsoleQueries";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { buildAmbassadorReferralScanUrl } from "@/lib/ambassador/referralLink";

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

function payoutTimelineLabel(status: string, statusLabel?: string): string {
  const v = (statusLabel ?? "").trim();
  if (v) return v;
  const s = status.toLowerCase();
  if (s === "pending") return "requested";
  if (s === "approved") return "awaiting payment";
  if (s === "paid") return "completed";
  return status || "unknown";
}

export default function AmbassadorDashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user, isLoaded: clerkLoaded } = useUser();
  const [statsPrepTimeout, setStatsPrepTimeout] = useState(false);
  const onboardingBootstrapRef = useRef(false);
  const [dashboardListTab, setDashboardListTab] = useState<"referrals" | "transactions" | "approved_payouts">(
    "referrals",
  );
  const [referralLinkCopied, setReferralLinkCopied] = useState(false);

  useEffect(() => {
    document.title = "Ambassador | FarmVault";
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setStatsPrepTimeout(true), 4000);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (searchParams.get("amb_refresh") !== "1") return;
    void queryClient.invalidateQueries({ queryKey: ["ambassador", "console", "stats"] });
    const next = new URLSearchParams(searchParams);
    next.delete("amb_refresh");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, queryClient]);

  const statsQ = useAmbassadorConsoleStatsQuery(clerkLoaded);
  const stats = statsQ.data;
  const statsReady = Boolean(stats && stats.ok && stats.onboarding_complete);
  const refQ = useAmbassadorConsoleReferralsQuery(clerkLoaded && statsReady);
  const earningsTxQ = useAmbassadorEarningsTransactionsQuery(clerkLoaded && statsReady);
  const payoutsQ = useAmbassadorPayoutsQuery(clerkLoaded && statsReady && Boolean(user));

  const referralRows = refQ.data?.ok ? refQ.data.rows : [];
  const earningsRows = earningsTxQ.data?.ok ? earningsTxQ.data.rows : [];
  const payoutRows = payoutsQ.data?.ok ? payoutsQ.data.rows : [];
  const approvedPayoutRows = useMemo(
    () =>
      payoutRows.filter((w) => {
        const st = String(w.status).toLowerCase();
        return st === "approved" || st === "paid";
      }),
    [payoutRows],
  );

  const referralShareUrl = useMemo(() => {
    const s = statsQ.data;
    if (!s || !s.ok || !s.referral_code) return "";
    return buildAmbassadorReferralScanUrl(s.referral_code);
  }, [statsQ.data]);

  /** Single bootstrap: only this page auto-sends incomplete ambassadors to onboarding (once per cycle). */
  useEffect(() => {
    if (location.pathname.startsWith("/ambassador/onboarding")) {
      return;
    }

    if (!statsQ.isFetched) {
      return;
    }

    const s = statsQ.data;
    if (!s) return;

    if (s.ok && s.onboarding_complete) {
      onboardingBootstrapRef.current = false;
      return;
    }

    if (s.ok && !s.onboarding_complete) {
      if (onboardingBootstrapRef.current) return;
      onboardingBootstrapRef.current = true;
      navigate("/ambassador/onboarding", { replace: true });
      return;
    }

    if (!s.ok && s.error === "not_found" && user) {
      if (onboardingBootstrapRef.current) return;
      onboardingBootstrapRef.current = true;
      navigate("/ambassador/onboarding", { replace: true });
      return;
    }

    if (!s.ok && s.error === "not_found" && !user) {
      const sess = getAmbassadorSession();
      if (!sess?.id) return;
      clearAmbassadorSession();
    }
  }, [location.pathname, statsQ.isFetched, statsQ.data, user, navigate]);

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

  if (!clerkLoaded || (!statsQ.isFetched && !statsPrepTimeout)) {
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

  if (!statsQ.isFetched && statsPrepTimeout) {
    return (
      <>
        <SeoHead title="Ambassador dashboard" description="FarmVault ambassador dashboard" canonical={SEO_ROUTES.ambassadorDashboard} />
        <DeveloperPageShell title="Ambassador Dashboard">
          <div className="fv-card p-6 max-w-md space-y-4 text-sm text-muted-foreground">
            <p>Stats are taking longer than usual. You can retry or continue ambassador onboarding.</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button type="button" onClick={() => void statsQ.refetch()}>
                Retry
              </Button>
              <Button asChild variant="secondary">
                <Link to="/ambassador/onboarding">Ambassador onboarding</Link>
              </Button>
            </div>
          </div>
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
      return <Navigate to="/ambassador/onboarding" replace />;
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

  return (
    <>
      <SeoHead title="Ambassador dashboard" description="Your FarmVault ambassador referrals and commissions." canonical={SEO_ROUTES.ambassadorDashboard} />
      <DeveloperPageShell
        title="Ambassador Dashboard"
        isRefetching={
          statsQ.isFetching || refQ.isFetching || earningsTxQ.isFetching || payoutsQ.isFetching
        }
        onRefresh={() => {
          void statsQ.refetch();
          void refQ.refetch();
          void earningsTxQ.refetch();
          void payoutsQ.refetch();
        }}
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

        {stats.total_referrals === 0 ? (
          <div className="rounded-xl border border-sky-200/50 bg-sky-50/80 dark:border-sky-800/50 dark:bg-sky-950/30 px-4 py-3 text-sm text-sky-950 dark:text-sky-100 mb-4 space-y-3">
            <p className="font-medium text-foreground">Start by sharing your link to onboard your first farmer</p>
            {referralShareUrl ? (
              <div className="flex items-center gap-2 rounded-lg border border-sky-200/80 bg-background/90 dark:border-sky-800/60 dark:bg-background/50 px-2.5 py-2">
                <a
                  href={referralShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 break-all font-mono text-[11px] leading-snug text-foreground underline-offset-2 hover:underline sm:text-xs"
                >
                  {referralShareUrl}
                </a>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => {
                    void navigator.clipboard.writeText(referralShareUrl);
                    setReferralLinkCopied(true);
                    toast.success("Referral link copied");
                    window.setTimeout(() => setReferralLinkCopied(false), 2000);
                  }}
                  aria-label="Copy referral link"
                >
                  {referralLinkCopied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <DeveloperStatGrid cols="4">
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
          {/* Total Earned — blue */}
          <div className="relative overflow-hidden rounded-xl border border-blue-200 bg-blue-50 p-3 sm:p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 sm:text-xs">
                Total Earned
              </span>
              <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-700" />
              </div>
            </div>
            <div className="mt-1">
              <span className="font-heading text-lg sm:text-xl font-bold tracking-tight text-blue-900">
                {formatKes(stats.total_earned)}
              </span>
            </div>
          </div>

          {/* Paid — green */}
          <div className="relative overflow-hidden rounded-xl border border-green-200 bg-green-50 p-3 sm:p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-green-700 sm:text-xs">
                Paid
              </span>
              <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg bg-green-100">
                <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-700" />
              </div>
            </div>
            <div className="mt-1">
              <span className="font-heading text-lg sm:text-xl font-bold tracking-tight text-green-900">
                {formatKes(stats.paid)}
              </span>
            </div>
          </div>

          {/* Pending — amber */}
          <div className="relative overflow-hidden rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4 dark:border-amber-800/50 dark:bg-amber-950/25">
            <div className="mb-1 flex items-center justify-between gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 sm:text-xs dark:text-amber-200">
                Pending
              </span>
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200/80 dark:bg-amber-900/50 dark:text-amber-200 dark:hover:bg-amber-900"
                      aria-label="About pending balance"
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px] text-xs">
                    KES 300 unlocks after first farmer payment. Pending can also include other locked commissions (for example
                    monthly KES 500 lines before release).
                  </TooltipContent>
                </Tooltip>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50">
                  <Clock className="h-3.5 w-3.5 text-amber-800 dark:text-amber-200" />
                </div>
              </div>
            </div>
            <div className="mt-1">
              <span className="font-heading text-lg sm:text-xl font-bold tabular-nums tracking-tight text-amber-950 dark:text-amber-50">
                {formatKes(stats.pending_earnings)}
              </span>
            </div>
          </div>

          <StatCard
            title="Monthly run-rate (est.)"
            value={formatKes(stats.monthly_recurring_income_kes)}
            icon={<Repeat2 className="h-4 w-4 sm:h-5 sm:w-5" />}
            variant="gold"
            compact
          />
        </DeveloperStatGrid>

        <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden mt-6">
          <div className="flex flex-col gap-3 border-b border-border/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div
              className={cn(
                "flex w-full max-w-2xl rounded-lg bg-muted/70 p-1 gap-1",
                "max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:pb-0.5 max-sm:[scrollbar-width:thin]",
                "max-sm:[&::-webkit-scrollbar]:h-0.5 max-sm:[&::-webkit-scrollbar-track]:bg-transparent max-sm:[&::-webkit-scrollbar-thumb]:rounded-full max-sm:[&::-webkit-scrollbar-thumb]:bg-border/40 max-sm:[&::-webkit-scrollbar-thumb]:hover:bg-border/60",
                "sm:flex sm:flex-wrap sm:overflow-visible",
              )}
            >
              <button
                type="button"
                onClick={() => setDashboardListTab("referrals")}
                className={cn(
                  "flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors sm:min-w-0 sm:flex-1 sm:px-3",
                  dashboardListTab === "referrals"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Users className="h-4 w-4 shrink-0 text-emerald-600" />
                Referrals
              </button>
              <button
                type="button"
                onClick={() => setDashboardListTab("transactions")}
                className={cn(
                  "flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors sm:min-w-0 sm:flex-1 sm:px-3",
                  dashboardListTab === "transactions"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ListOrdered className="h-4 w-4 shrink-0 text-emerald-600" />
                Transactions
              </button>
              <button
                type="button"
                onClick={() => setDashboardListTab("approved_payouts")}
                className={cn(
                  "flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors sm:min-w-0 sm:flex-1 sm:px-3",
                  dashboardListTab === "approved_payouts"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                Approved payouts
              </button>
            </div>
            <p className="text-xs text-muted-foreground sm:max-w-[240px] sm:text-right">
              {dashboardListTab === "referrals"
                ? "People referred through your code."
                : dashboardListTab === "transactions"
                  ? "Commission and payout history."
                  : "Payouts approved by FarmVault or already paid out."}
            </p>
          </div>

          {dashboardListTab === "referrals" ? (
            <AmbassadorReferralsTable rows={referralRows} loading={refQ.isLoading} embedInPanel />
          ) : dashboardListTab === "transactions" ? (
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
                                  : tx.status === "available"
                                    ? "border-sky-500/50 text-sky-800 dark:text-sky-300"
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
          ) : (
            <div className="overflow-x-auto">
              {payoutsQ.isError ? (
                <p className="text-sm text-destructive px-4 py-6">
                  {payoutsQ.error instanceof Error ? payoutsQ.error.message : "Could not load payouts."}
                </p>
              ) : payoutsQ.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading…
                </div>
              ) : approvedPayoutRows.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground px-4">No approved payouts yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Date
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
                    {approvedPayoutRows.map((w) => (
                      <TableRow key={w.id} className="border-border/40">
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {w.created_at ? new Date(w.created_at).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">{formatKes(w.amount)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              String(w.status).toLowerCase() === "paid"
                                ? "border-emerald-500/50 text-emerald-700 dark:text-emerald-300"
                                : "border-sky-500/50 text-sky-800 dark:text-sky-300",
                            )}
                          >
                            {payoutTimelineLabel(w.status, w.status_label)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </div>
      </DeveloperPageShell>
    </>
  );
}

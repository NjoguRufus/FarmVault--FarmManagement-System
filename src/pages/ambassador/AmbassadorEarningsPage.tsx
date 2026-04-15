import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Banknote, CheckCircle, CircleHelp, Clock, ListOrdered, Loader2, TrendingUp, Wallet } from "lucide-react";
import { DeveloperPageShell } from "@/components/developer/DeveloperPageShell";
import { DeveloperStatGrid } from "@/components/developer/DeveloperStatGrid";
import { AmbassadorPayoutSection } from "@/components/ambassador/AmbassadorPayoutSection";
import { SeoHead } from "@/seo/SeoHead";
import { SEO_ROUTES } from "@/seo/routes";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useAmbassadorConsoleStatsQuery,
  useAmbassadorEarningsTransactionsQuery,
  useAmbassadorPayoutsQuery,
} from "@/hooks/useAmbassadorConsoleQueries";
import { clearAmbassadorSession, getAmbassadorSession } from "@/services/ambassadorService";
import { getAmbassadorSignUpPath } from "@/lib/ambassador/clerkAuth";

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

export default function AmbassadorEarningsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isLoaded } = useUser();
  const statsQ = useAmbassadorConsoleStatsQuery(isLoaded);
  const stats = statsQ.data;
  const statsOk = Boolean(stats?.ok);
  const earningsTxQ = useAmbassadorEarningsTransactionsQuery(isLoaded && statsOk);
  const payoutsQ = useAmbassadorPayoutsQuery(isLoaded && statsOk && Boolean(user));
  const earningsRows = earningsTxQ.data?.ok ? earningsTxQ.data.rows : [];
  const payoutRows = payoutsQ.data?.ok ? payoutsQ.data.rows : [];
  const [earningsTableTab, setEarningsTableTab] = useState<"transactions" | "payouts">("transactions");

  useEffect(() => {
    document.title = "Earnings | FarmVault";
  }, []);

  useEffect(() => {
    if (!statsQ.isFetched || !stats) return;
    if (stats.ok && !stats.onboarding_complete) {
      navigate("/ambassador/onboarding", { replace: true });
      return;
    }
    if (!stats.ok && stats.error === "not_found" && !user && !getAmbassadorSession()) {
      navigate("/ambassador/signup", { replace: true });
    }
    if (!stats.ok && stats.error === "not_found" && !user && getAmbassadorSession()) {
      clearAmbassadorSession();
    }
  }, [statsQ.isFetched, stats, user, navigate]);

  if (!isLoaded || !statsQ.isFetched) {
    return (
      <>
        <SeoHead title="Earnings | FarmVault" description="Ambassador commissions and earnings." canonical={SEO_ROUTES.ambassadorDashboard} />
        <DeveloperPageShell title="Earnings" isLoading>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="h-28 rounded-xl border border-border/50 bg-muted/20 animate-pulse" />
            <div className="h-28 rounded-xl border border-border/50 bg-muted/20 animate-pulse" />
            <div className="h-28 rounded-xl border border-border/50 bg-muted/20 animate-pulse" />
          </div>
        </DeveloperPageShell>
      </>
    );
  }

  if (stats && !stats.ok) {
    if (stats.error === "not_found" && user) return <Navigate to="/ambassador/onboarding" replace />;
    return (
      <>
        <SeoHead title="Earnings | FarmVault" description="Ambassador commissions and earnings." canonical={SEO_ROUTES.ambassadorDashboard} />
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
      <SeoHead title="Earnings | FarmVault" description="Ambassador commissions and earnings." canonical={SEO_ROUTES.ambassadorDashboard} />
      <DeveloperPageShell
        title="Earnings"
        description="Revenue-triggered commissions and balances."
        isRefetching={statsQ.isFetching || earningsTxQ.isFetching || payoutsQ.isFetching}
        onRefresh={() => {
          void statsQ.refetch();
          void earningsTxQ.refetch();
          void payoutsQ.refetch();
        }}
        toolbarEnd={
          user && stats?.ok ? (
            <AmbassadorPayoutSection
              variant="trigger"
              hideTriggerHint
              availableBalance={stats.available_balance}
              pendingEarnings={stats.pending_earnings}
              totalEarned={stats.total_earned}
              payouts={payoutRows}
              payoutsLoading={payoutsQ.isLoading}
              onAfterMutation={() => {
                void queryClient.invalidateQueries({ queryKey: ["ambassador", "console"] });
              }}
            />
          ) : null
        }
      >
        <DeveloperStatGrid cols="3">
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

          {/* Pending — amber */}
          <div className="relative overflow-hidden rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4">
            <div className="mb-1 flex items-center justify-between gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 sm:text-xs">Pending</span>
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200/80"
                      aria-label="About pending balance"
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px] text-xs">
                    KES 300 unlocks after first farmer payment. Pending can also include other locked commissions before release.
                  </TooltipContent>
                </Tooltip>
                <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                  <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-700" />
                </div>
              </div>
            </div>
            <div className="mt-1">
              <span className="font-heading text-lg sm:text-xl font-bold tracking-tight text-amber-900">
                {formatKes(stats.pending_earnings)}
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
        </DeveloperStatGrid>

        <DeveloperStatGrid cols="3" className="mt-3">
          <div className="relative overflow-hidden rounded-xl border border-sky-200 bg-sky-50 p-3 sm:p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-800 sm:text-xs">
                Available
              </span>
              <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100">
                <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-sky-800" />
              </div>
            </div>
            <div className="mt-1">
              <span className="font-heading text-lg sm:text-xl font-bold tracking-tight text-sky-950">
                {formatKes(stats.available_balance)}
              </span>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-xl border border-border/60 bg-muted/20 p-3 sm:p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
                Paying farmers
              </span>
            </div>
            <div className="mt-1">
              <span className="font-heading text-lg sm:text-xl font-bold tracking-tight text-foreground">
                {stats.active_paying_farmers}
              </span>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-xl border border-border/60 bg-muted/20 p-3 sm:p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
                Monthly run-rate (est.)
              </span>
            </div>
            <div className="mt-1">
              <span className="font-heading text-lg sm:text-xl font-bold tracking-tight text-foreground">
                {formatKes(stats.monthly_recurring_income_kes)}
              </span>
            </div>
          </div>
        </DeveloperStatGrid>

        {/* Transactions / Payouts */}
        <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden mt-6">
          <div className="flex flex-col gap-3 border-b border-border/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full max-w-md rounded-lg bg-muted/70 p-1 gap-1">
              <button
                type="button"
                onClick={() => setEarningsTableTab("transactions")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  earningsTableTab === "transactions"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ListOrdered className="h-4 w-4 shrink-0 text-emerald-600" />
                Transactions
              </button>
              <button
                type="button"
                onClick={() => setEarningsTableTab("payouts")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  earningsTableTab === "payouts"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Banknote className="h-4 w-4 shrink-0 text-emerald-600" />
                Payouts
              </button>
            </div>
            <p className="text-xs text-muted-foreground sm:max-w-[220px] sm:text-right">
              {earningsTableTab === "transactions"
                ? "Commission lines from your ambassador ledger."
                : "Payout requests and their review status."}
            </p>
          </div>

          {earningsTableTab === "transactions" ? (
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
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Type
                      </TableHead>
                      <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Amount
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Status
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Paid Date
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
                            {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-foreground whitespace-nowrap">
                            {formatEarningType(tx.type)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium tabular-nums">
                            {formatKes(tx.amount)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                tx.status === "paid"
                                  ? "bg-green-100 text-green-700 border-green-200"
                                  : tx.status === "available"
                                    ? "bg-sky-100 text-sky-800 border-sky-200"
                                    : tx.status === "pending"
                                      ? "bg-amber-100 text-amber-800 border-amber-200"
                                      : "bg-amber-100 text-amber-700 border-amber-200",
                              )}
                            >
                              {tx.status === "paid"
                                ? "Paid"
                                : tx.status === "available"
                                  ? "Available"
                                  : tx.status === "pending"
                                    ? "Pending"
                                    : "Owed"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            —
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
              {!user ? (
                <p className="py-10 text-center text-sm text-muted-foreground px-4">Sign in to view payout history.</p>
              ) : payoutsQ.isError ? (
                <p className="text-sm text-destructive px-4 py-6">
                  {payoutsQ.error instanceof Error ? payoutsQ.error.message : "Could not load payouts."}
                </p>
              ) : payoutsQ.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading…
                </div>
              ) : payoutRows.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground px-4">No payouts yet.</p>
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
                    {payoutRows.map((w) => {
                      const st = String(w.status).toLowerCase();
                      return (
                        <TableRow key={w.id} className="border-border/40">
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {w.created_at ? new Date(w.created_at).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium tabular-nums">{formatKes(w.amount)}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                "capitalize",
                                st === "paid" && "border-emerald-500/50 text-emerald-700 dark:text-emerald-300",
                                st === "approved" && "border-sky-500/50 text-sky-800 dark:text-sky-300",
                                st === "pending" && "border-amber-500/50 text-amber-800 dark:text-amber-300",
                                st === "rejected" && "border-destructive/50 text-destructive",
                              )}
                            >
                              {payoutTimelineLabel(w.status, w.status_label)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground max-w-xl leading-relaxed mt-4">
          Commission lines are managed by FarmVault. Contact support if amounts look incorrect.
        </p>
      </DeveloperPageShell>
    </>
  );
}

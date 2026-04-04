import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUser } from "@clerk/react";
import { CheckCircle, Clock, ListOrdered, TrendingUp } from "lucide-react";
import { DeveloperPageShell } from "@/components/developer/DeveloperPageShell";
import { DeveloperStatGrid } from "@/components/developer/DeveloperStatGrid";
import { SeoHead } from "@/seo/SeoHead";
import { SEO_ROUTES } from "@/seo/routes";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useAmbassadorConsoleStatsQuery,
  useAmbassadorEarningsTransactionsQuery,
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

export default function AmbassadorEarningsPage() {
  const navigate = useNavigate();
  const { user, isLoaded } = useUser();
  const statsQ = useAmbassadorConsoleStatsQuery(isLoaded);
  const stats = statsQ.data;
  const statsOk = Boolean(stats?.ok);
  const earningsTxQ = useAmbassadorEarningsTransactionsQuery(isLoaded && statsOk);
  const earningsRows = earningsTxQ.data?.ok ? earningsTxQ.data.rows : [];

  useEffect(() => {
    document.title = "Earnings | FarmVault";
  }, []);

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
        <SeoHead title="Earnings | FarmVault" description="Ambassador commissions and payouts." canonical={SEO_ROUTES.ambassadorDashboard} />
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
    if (stats.error === "not_found" && user) return null;
    return (
      <>
        <SeoHead title="Earnings | FarmVault" description="Ambassador commissions and payouts." canonical={SEO_ROUTES.ambassadorDashboard} />
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
      <SeoHead title="Earnings | FarmVault" description="Ambassador commissions and payouts." canonical={SEO_ROUTES.ambassadorDashboard} />
      <DeveloperPageShell
        title="Earnings"
        description="Totals from your ambassador earnings (paid and owed)."
        isRefetching={statsQ.isFetching}
        onRefresh={() => void statsQ.refetch()}
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

          {/* Owed — amber */}
          <div className="relative overflow-hidden rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 sm:text-xs">
                Owed
              </span>
              <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-700" />
              </div>
            </div>
            <div className="mt-1">
              <span className="font-heading text-lg sm:text-xl font-bold tracking-tight text-amber-900">
                {formatKes(stats.owed)}
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

        {/* Transactions */}
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
                                : "bg-amber-100 text-amber-700 border-amber-200",
                            )}
                          >
                            {tx.status === "paid" ? "Paid" : "Owed"}
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
        </div>

        <p className="text-xs text-muted-foreground max-w-xl leading-relaxed mt-4">
          Payouts and adjustments are managed by FarmVault. Contact support if amounts look incorrect.
        </p>
      </DeveloperPageShell>
    </>
  );
}

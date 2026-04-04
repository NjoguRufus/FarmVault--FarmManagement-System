import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Banknote, Leaf, Radio, RefreshCw, Sprout, Users, Wallet } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAmbassadorProgramRealtime } from "@/hooks/developer/useAmbassadorProgramRealtime";
import {
  fetchDevGlobalReferralStats,
  fetchDevReferralConversion,
  type DevReferralConversionRow,
} from "@/services/developerReferralService";
import { cn } from "@/lib/utils";

function formatKes(n: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

export default function DevReferralsPage() {
  const navigate = useNavigate();

  const {
    data: stats,
    isLoading: loadingStats,
    error: statsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ["dev", "referral-stats"],
    queryFn: fetchDevGlobalReferralStats,
  });

  const {
    data: rows = [],
    isLoading: loadingRows,
    error: rowsError,
    refetch: refetchRows,
    isFetching,
  } = useQuery({
    queryKey: ["dev", "referral-conversion"],
    queryFn: fetchDevReferralConversion,
  });

  const refetchAll = useCallback(() => {
    void refetchStats();
    void refetchRows();
  }, [refetchStats, refetchRows]);

  useAmbassadorProgramRealtime(refetchAll);

  const loading = loadingStats || loadingRows;
  const error = statsError ?? rowsError;

  function onRowClick(row: DevReferralConversionRow) {
    navigate(`/dev/referrals/${row.id}`);
  }

  return (
    <div className="space-y-6 sm:space-y-8 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            <Sprout className="h-4 w-4" />
            Developer
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Referral dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">
            Live view of ambassadors, referral funnel, and ambassador earnings. Table updates in realtime when
            ambassadors, referrals, or earnings change.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300">
            <Radio className="h-3 w-3" />
            Realtime
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => refetchAll()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {[
          {
            label: "Total ambassadors",
            value: stats?.total_ambassadors ?? "—",
            icon: Users,
            format: "count" as const,
          },
          {
            label: "Active ambassadors",
            value: stats?.active_ambassadors ?? "—",
            icon: Leaf,
            format: "count" as const,
          },
          {
            label: "Inactive ambassadors",
            value: stats?.inactive_ambassadors ?? "—",
            icon: Users,
            format: "count" as const,
          },
          {
            label: "Total owed",
            value: stats?.total_owed ?? "—",
            icon: Banknote,
            format: "kes" as const,
          },
          {
            label: "Total paid out",
            value: stats?.total_paid_out ?? "—",
            icon: Wallet,
            format: "kes" as const,
          },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl border border-border/60 bg-background/60 p-5 shadow-sm backdrop-blur-md dark:bg-background/40 dark:border-emerald-900/30"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <card.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
                <p className="text-2xl font-semibold tabular-nums text-foreground truncate">
                  {loading
                    ? "…"
                    : typeof card.value === "number"
                      ? card.format === "kes"
                        ? formatKes(card.value)
                        : card.value.toLocaleString()
                      : card.value}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {(error as Error).message}
        </div>
      ) : null}

      <div className="rounded-2xl border border-border/60 bg-background/50 shadow-sm backdrop-blur-md dark:border-emerald-900/25 dark:bg-background/30 overflow-hidden">
        <div className="border-b border-border/50 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-foreground">Referral summary</h2>
          <p className="text-xs text-muted-foreground">Select a row to open referrer details.</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Name
                </TableHead>
                <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Type
                </TableHead>
                <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Code
                </TableHead>
                <TableHead className="whitespace-nowrap text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Referrals
                </TableHead>
                <TableHead className="whitespace-nowrap text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Active
                </TableHead>
                <TableHead className="whitespace-nowrap text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Inactive
                </TableHead>
                <TableHead className="whitespace-nowrap text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Conv. %
                </TableHead>
                <TableHead className="whitespace-nowrap text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Total earned
                </TableHead>
                <TableHead className="whitespace-nowrap text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Owed
                </TableHead>
                <TableHead className="whitespace-nowrap text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Paid
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                    No ambassadors yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer border-border/40 hover:bg-emerald-500/5 dark:hover:bg-emerald-500/10"
                    onClick={() => onRowClick(row)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`Open details for ${row.name}`}
                  >
                    <TableCell className="font-medium text-foreground">{row.name}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{row.type}</TableCell>
                    <TableCell>
                      <code className="rounded bg-muted/80 px-1.5 py-0.5 text-xs">{row.referral_code ?? "—"}</code>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.total_referrals}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {row.active_referrals}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-400">
                      {row.inactive_referrals}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.conversion_rate}%</TableCell>
                    <TableCell className="text-right tabular-nums">{formatKes(row.total_earned)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatKes(row.owed)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatKes(row.paid)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

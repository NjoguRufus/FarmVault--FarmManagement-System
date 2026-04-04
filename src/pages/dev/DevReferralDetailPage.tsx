import { useCallback, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Banknote,
  Layers,
  Loader2,
  Radio,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAmbassadorProgramRealtime } from "@/hooks/developer/useAmbassadorProgramRealtime";
import {
  fetchDevAmbassadorEarnings,
  fetchDevReferralConversionById,
  fetchDevReferrerDetails,
  markAmbassadorEarningsPaid,
  type DevAmbassadorEarningRow,
  type DevReferrerDetailRow,
} from "@/services/developerReferralService";
import { cn } from "@/lib/utils";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export default function DevReferralDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const ambassadorId = id?.trim() ?? "";
  const idValid = useMemo(() => UUID_RE.test(ambassadorId), [ambassadorId]);

  const detailKey = useMemo(() => ["dev", "referral-detail", ambassadorId] as const, [ambassadorId]);

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: [...detailKey, "summary"],
    queryFn: () => fetchDevReferralConversionById(ambassadorId),
    enabled: idValid,
  });

  const { data: referred = [], isLoading: loadingReferred } = useQuery({
    queryKey: [...detailKey, "referred"],
    queryFn: () => fetchDevReferrerDetails(ambassadorId),
    enabled: idValid,
  });

  const { data: earnings = [], isLoading: loadingEarnings } = useQuery({
    queryKey: [...detailKey, "earnings"],
    queryFn: () => fetchDevAmbassadorEarnings(ambassadorId),
    enabled: idValid,
  });

  const refetchDetail = useCallback(() => {
    if (!UUID_RE.test(ambassadorId)) return;
    void queryClient.invalidateQueries({ queryKey: detailKey });
  }, [queryClient, ambassadorId, detailKey]);

  useAmbassadorProgramRealtime(refetchDetail);

  const totalOwed = useMemo(
    () => earnings.filter((e) => e.status === "owed").reduce((s, e) => s + e.amount, 0),
    [earnings],
  );
  const totalPaid = useMemo(
    () => earnings.filter((e) => e.status === "paid").reduce((s, e) => s + e.amount, 0),
    [earnings],
  );

  const markPaidMutation = useMutation({
    mutationFn: () => markAmbassadorEarningsPaid(ambassadorId),
    onSuccess: (updated) => {
      if (updated > 0) {
        toast.success(`Marked ${updated} earning row${updated === 1 ? "" : "s"} as paid.`);
      } else {
        toast.message("No owed earnings to mark.");
      }
      void refetchDetail();
      void queryClient.invalidateQueries({ queryKey: ["dev", "referral-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["dev", "referral-conversion"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Update failed"),
  });

  if (!idValid) {
    return (
      <div className="space-y-4 pb-8">
        <Button variant="ghost" size="sm" asChild className="gap-2">
          <Link to="/dev/referrals">
            <ArrowLeft className="h-4 w-4" />
            Back to referrals
          </Link>
        </Button>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm text-destructive">
          Invalid ambassador id.
        </div>
      </div>
    );
  }

  const loading = loadingSummary || loadingReferred || loadingEarnings;
  const hasOwed = Boolean(summary && summary.owed > 0);

  return (
    <div className="space-y-6 sm:space-y-8 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" asChild className="gap-2 -ml-2 text-muted-foreground">
            <Link to="/dev/referrals">
              <ArrowLeft className="h-4 w-4" />
              All referrers
            </Link>
          </Button>
          {loadingSummary ? (
            <h1 className="text-2xl font-bold text-foreground">Loading…</h1>
          ) : !summary ? (
            <h1 className="text-2xl font-bold text-foreground">Ambassador not found</h1>
          ) : (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{summary.name}</h1>
                <Badge variant="secondary" className="capitalize">
                  {summary.type}
                </Badge>
                <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                  <Radio className="h-3 w-3" />
                  Live
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Code{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">{summary.referral_code ?? "—"}</code>
                · Conversion {summary.conversion_rate}% · Referrals {summary.total_referrals} total
              </p>
            </motion.div>
          )}
        </div>
        {summary ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="rounded-full bg-gradient-to-r from-emerald-600 to-lime-600 text-white shadow-md hover:opacity-95 disabled:opacity-50"
              disabled={!hasOwed || markPaidMutation.isPending}
              onClick={() => markPaidMutation.mutate()}
            >
              {markPaidMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Banknote className="mr-2 h-4 w-4" />
              )}
              Mark as paid
            </Button>
          </div>
        ) : null}
      </div>

      {!summary && !loadingSummary ? (
        <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          No conversion row for this id (ambassador may have been removed).
        </div>
      ) : null}

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Total earned", value: formatKes(summary.total_earned) },
            { label: "Owed", value: formatKes(summary.owed), accent: "text-amber-600 dark:text-amber-400" },
            { label: "Paid out", value: formatKes(summary.paid), accent: "text-emerald-600 dark:text-emerald-400" },
            { label: "Active / inactive refs", value: `${summary.active_referrals} / ${summary.inactive_referrals}` },
          ].map((c, i) => (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="rounded-2xl border border-border/60 bg-background/55 p-4 shadow-sm backdrop-blur-md dark:border-emerald-900/25 dark:bg-background/35"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</p>
              <p className={cn("mt-1 text-lg font-semibold tabular-nums", c.accent)}>{c.value}</p>
            </motion.div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-background/50 shadow-sm backdrop-blur-md dark:border-emerald-900/25 dark:bg-background/30 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
            <User className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold">Referred users</h2>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="text-xs uppercase text-muted-foreground">Who</TableHead>
                  <TableHead className="text-xs uppercase text-muted-foreground">Type</TableHead>
                  <TableHead className="text-xs uppercase text-muted-foreground">Level</TableHead>
                  <TableHead className="text-xs uppercase text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : referred.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      No referrals yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  referred.map((r: DevReferrerDetailRow) => (
                    <TableRow key={r.referral_id} className="border-border/40">
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {r.referred_name ?? r.referred_user_id.slice(0, 8) + "…"}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">{r.referred_user_id}</div>
                      </TableCell>
                      <TableCell className="capitalize text-muted-foreground">{r.referred_user_type}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted/80 px-2 py-0.5 text-xs font-medium">
                          <Layers className="h-3 w-3" />
                          {r.level}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={r.is_active ? "default" : "secondary"}
                          className={cn(
                            r.is_active
                              ? "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {r.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-background/50 shadow-sm backdrop-blur-md dark:border-emerald-900/25 dark:bg-background/30 overflow-hidden">
          <div className="flex flex-col gap-1 border-b border-border/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold">Earnings transactions</h2>
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span>
                Owed: <strong className="text-amber-600 dark:text-amber-400">{formatKes(totalOwed)}</strong>
              </span>
              <span>
                Paid: <strong className="text-emerald-600 dark:text-emerald-400">{formatKes(totalPaid)}</strong>
              </span>
            </div>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="text-xs uppercase text-muted-foreground whitespace-nowrap">Date</TableHead>
                  <TableHead className="text-xs uppercase text-muted-foreground">Description</TableHead>
                  <TableHead className="text-xs uppercase text-muted-foreground">Type</TableHead>
                  <TableHead className="text-xs uppercase text-muted-foreground text-right">Amount</TableHead>
                  <TableHead className="text-xs uppercase text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : earnings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No earnings rows.
                    </TableCell>
                  </TableRow>
                ) : (
                  earnings.map((e: DevAmbassadorEarningRow) => (
                    <TableRow key={e.earning_id} className="border-border/40">
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {e.created_at ? new Date(e.created_at).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-foreground max-w-[180px] truncate">{e.description ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatEarningType(e.earning_type)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatKes(e.amount)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            e.status === "paid"
                              ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                              : "border-amber-500/40 text-amber-800 dark:text-amber-300",
                          )}
                        >
                          {e.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

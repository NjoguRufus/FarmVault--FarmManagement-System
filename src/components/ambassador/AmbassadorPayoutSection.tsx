import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AmbassadorPayoutRow } from "@/services/ambassadorService";
import { requestAmbassadorPayout } from "@/services/ambassadorService";

const MIN_PAYOUT_KES = 1200;
const GOLD = "#D8B980";
const COOL_BLUE = "#9DC3E6";

function formatKes(n: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

function parseKesInput(raw: string): number | null {
  const t = raw.replace(/,/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
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

type AmbassadorPayoutSectionProps = {
  availableBalance: number;
  pendingEarnings: number;
  totalEarned: number;
  payouts: AmbassadorPayoutRow[];
  payoutsLoading: boolean;
  onAfterMutation: () => void;
  /** Full payout card + history, or only the withdraw button and request dialog (for dashboard toolbar). */
  variant?: "full" | "trigger";
  /** When `variant="trigger"`, omit the small inline hint next to the button (toolbar layout). */
  hideTriggerHint?: boolean;
};

export function AmbassadorPayoutSection({
  availableBalance,
  pendingEarnings,
  totalEarned,
  payouts,
  payoutsLoading,
  onAfterMutation,
  variant = "full",
  hideTriggerHint = false,
}: AmbassadorPayoutSectionProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const floorAvailable = useMemo(() => Math.floor(availableBalance), [availableBalance]);

  const hasPendingPayout = useMemo(
    () => payouts.some((w) => String(w.status).toLowerCase() === "pending"),
    [payouts],
  );

  const canRequest =
    availableBalance >= MIN_PAYOUT_KES && !hasPendingPayout && floorAvailable >= MIN_PAYOUT_KES;

  useEffect(() => {
    if (modalOpen) {
      setAmountInput(String(floorAvailable > 0 ? floorAvailable : ""));
    }
  }, [modalOpen, floorAvailable]);

  const parsedAmount = useMemo(() => parseKesInput(amountInput), [amountInput]);

  const confirmDisabled =
    submitting ||
    parsedAmount === null ||
    parsedAmount < MIN_PAYOUT_KES ||
    parsedAmount > availableBalance + 0.01;

  const onConfirm = useCallback(async () => {
    if (parsedAmount === null || confirmDisabled) return;
    setSubmitting(true);
    try {
      const res = await requestAmbassadorPayout(parsedAmount);
      if (!res.ok) {
        const msg =
          res.error === "below_minimum"
            ? "Amount is below the minimum."
            : res.error === "insufficient_available"
              ? "Amount exceeds available balance."
              : res.error === "pending_withdrawal_exists"
                ? "You already have a pending payout."
                : res.error === "not_authenticated"
                  ? "Please sign in again."
                  : res.error;
        toast.error("Request failed", { description: msg });
        return;
      }
      toast.success("Payout request submitted");
      setModalOpen(false);
      onAfterMutation();
    } catch (e) {
      toast.error("Request failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [parsedAmount, confirmDisabled, onAfterMutation]);

  const triggerDisabledTitle = !canRequest
    ? hasPendingPayout
      ? "A payout is already pending."
      : `Minimum payout is KES ${MIN_PAYOUT_KES.toLocaleString("en-KE")}.`
    : undefined;

  const triggerBlock = (
    <>
      <Button
        type="button"
        disabled={!canRequest}
        title={hideTriggerHint ? triggerDisabledTitle : undefined}
        onClick={() => setModalOpen(true)}
        className={cn(
          "h-10 shrink-0 rounded-lg text-sm font-semibold transition-all duration-200",
          canRequest
            ? "border-0 bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-[0_8px_28px_-6px_rgba(16,185,129,0.45)] hover:from-emerald-500 hover:to-emerald-700 hover:shadow-[0_10px_32px_-6px_rgba(16,185,129,0.5)]"
            : "cursor-not-allowed border border-border bg-muted/50 text-muted-foreground opacity-80",
        )}
        style={canRequest ? { boxShadow: `0 0 0 1px ${GOLD}33 inset` } : undefined}
      >
        <Wallet className="mr-2 h-4 w-4 opacity-90" aria-hidden />
        Request Payout
      </Button>
      {!hideTriggerHint && !canRequest ? (
        <span className="text-[11px] leading-snug text-muted-foreground max-w-[200px] sm:text-left">
          {hasPendingPayout
            ? "A payout is already pending."
            : `Minimum payout is KES ${MIN_PAYOUT_KES.toLocaleString("en-KE")}.`}
        </span>
      ) : null}
    </>
  );

  const dialogBlock = (
    <Dialog open={modalOpen} onOpenChange={setModalOpen}>
      <DialogContent className="border-neutral-800 bg-neutral-950 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Request payout</DialogTitle>
          <DialogDescription className="text-white/60">
            Available balance:{" "}
            <span className="font-semibold text-emerald-300 tabular-nums">{formatKes(availableBalance)}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="payout-amount" className="text-white/80">
            Amount (KES)
          </Label>
          <Input
            id="payout-amount"
            type="number"
            inputMode="decimal"
            min={MIN_PAYOUT_KES}
            max={floorAvailable}
            step={1}
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="border-white/10 bg-neutral-900 text-white placeholder:text-white/35"
          />
            <p className="text-[11px] text-white/45">
              Minimum payout is KES {MIN_PAYOUT_KES.toLocaleString("en-KE")}. Cannot exceed available balance.
            </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            className="text-white/70 hover:bg-white/10 hover:text-white"
            onClick={() => setModalOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={confirmDisabled}
            onClick={() => void onConfirm()}
            className="border-0 bg-gradient-to-br from-emerald-600 to-emerald-800 font-semibold text-white hover:from-emerald-500 hover:to-emerald-700"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Submitting…
              </>
            ) : (
              "Confirm Request"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (variant === "trigger") {
    return (
      <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:gap-2">
        {triggerBlock}
        {dialogBlock}
      </div>
    );
  }

  return (
    <section
      className="mb-6 rounded-2xl border border-white/[0.08] bg-[#0c0c0e] p-5 sm:p-6 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.65)] transition-shadow duration-300 hover:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.55)]"
      aria-labelledby="ambassador-payout-heading"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
              Payouts
            </p>
            <h2 id="ambassador-payout-heading" className="mt-1 text-lg font-bold tracking-tight text-white">
              Your balance
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div
              className={cn(
                "relative overflow-hidden rounded-xl border px-4 py-4 transition-transform duration-200",
                "border-emerald-500/25 bg-gradient-to-br from-emerald-950/80 to-neutral-950",
                "hover:-translate-y-0.5",
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">Available</p>
              <p className="mt-2 font-heading text-2xl font-bold tabular-nums tracking-tight text-emerald-50">
                {formatKes(availableBalance)}
              </p>
              <div
                className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-30 blur-2xl"
                style={{ backgroundColor: COOL_BLUE }}
              />
            </div>

            <div
              className="rounded-xl border border-white/[0.08] bg-neutral-900/80 px-4 py-4 transition-transform duration-200 hover:-translate-y-0.5"
              style={{ boxShadow: `inset 0 1px 0 0 ${GOLD}22` }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: GOLD }}>
                Pending
              </p>
              <p className="mt-2 font-heading text-xl font-bold tabular-nums tracking-tight text-white/95">
                {formatKes(pendingEarnings)}
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-neutral-900/80 px-4 py-4 transition-transform duration-200 hover:-translate-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: COOL_BLUE }}>
                Total earned
              </p>
              <p className="mt-2 font-heading text-xl font-bold tabular-nums tracking-tight text-white/95">
                {formatKes(totalEarned)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 lg:w-[220px] lg:items-stretch">
          <Button
            type="button"
            disabled={!canRequest}
            onClick={() => setModalOpen(true)}
            className={cn(
              "h-12 rounded-xl text-base font-semibold transition-all duration-200",
              canRequest
                ? "border-0 bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-[0_8px_28px_-6px_rgba(16,185,129,0.45)] hover:from-emerald-500 hover:to-emerald-700 hover:shadow-[0_10px_32px_-6px_rgba(16,185,129,0.5)]"
                : "cursor-not-allowed border border-white/10 bg-neutral-800/80 text-white/40 opacity-70",
            )}
            style={
              canRequest
                ? { boxShadow: `0 0 0 1px ${GOLD}33 inset` }
                : undefined
            }
          >
            <Wallet className="mr-2 h-4 w-4 opacity-90" aria-hidden />
            Request Payout
          </Button>
          {!canRequest ? (
            <p className="text-center text-[11px] leading-snug text-white/55 lg:text-left">
              {hasPendingPayout
                ? "You have a pending payout. Wait for it to be processed."
                : `Minimum payout is KES ${MIN_PAYOUT_KES.toLocaleString("en-KE")}.`}
            </p>
          ) : null}
          {dialogBlock}
        </div>
      </div>

      <div className="mt-8 border-t border-white/[0.08] pt-6">
        <h3 className="text-sm font-semibold tracking-tight text-white">Payout history</h3>
        <div className="mt-3 overflow-x-auto rounded-xl border border-white/[0.06] bg-neutral-950/50">
          {payoutsLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-white/60">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading…
            </div>
          ) : payouts.length === 0 ? (
            <p className="py-12 text-center text-sm text-white/50">No payouts yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.06] hover:bg-transparent">
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-white/50">Date</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-white/50">
                    Amount
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-white/50">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((w) => (
                  <TableRow key={w.id} className="border-white/[0.06]">
                    <TableCell className="text-xs text-white/70 whitespace-nowrap">
                      {w.created_at ? new Date(w.created_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums text-white">
                      {formatKes(w.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "border-white/15 capitalize",
                          String(w.status).toLowerCase() === "paid" && "border-emerald-500/40 text-emerald-200",
                          String(w.status).toLowerCase() === "approved" && "text-white/80",
                          String(w.status).toLowerCase() === "pending" && "text-amber-200/90",
                          String(w.status).toLowerCase() === "rejected" && "text-red-300/90",
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
      </div>
    </section>
  );
}

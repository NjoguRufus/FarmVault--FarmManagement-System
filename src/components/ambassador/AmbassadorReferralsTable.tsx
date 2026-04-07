import React from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AmbassadorReferralRow } from "@/services/ambassadorService";

function formatKes(n: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

function formatReferralDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy");
}

function lifecycleLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "signed_up":
      return "Signed up";
    case "active":
      return "Active";
    case "subscribed":
      return "Subscribed";
    case "commissioned":
      return "Commissioned";
    default:
      return status.replace(/_/g, " ");
  }
}

function subscriptionBadge(sub: string | null | undefined): { label: string; className: string } {
  const s = (sub ?? "none").toLowerCase();
  if (s === "paid" || s === "active") {
    return { label: s === "paid" ? "Paid" : "Active", className: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300" };
  }
  if (s === "trial") {
    return { label: "Trial", className: "bg-amber-500/15 text-amber-900 dark:text-amber-200" };
  }
  if (s === "none" || !sub) {
    return { label: "—", className: "bg-muted text-muted-foreground" };
  }
  return { label: sub, className: "bg-muted text-muted-foreground" };
}

function commissionBadge(status: string): { label: string; className: string } {
  if (status === "paid") {
    return { label: "Paid", className: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300" };
  }
  if (status === "owed") {
    return { label: "Owed", className: "bg-sky-600/15 text-sky-900 dark:text-sky-200" };
  }
  return { label: "—", className: "bg-muted text-muted-foreground" };
}

export function AmbassadorReferralsTable({
  rows,
  loading,
  emptyMessage = "No referrals yet.",
  /** When true, render only the scrollable table (for use inside a parent card with shared header/tabs). */
  embedInPanel = false,
}: {
  rows: AmbassadorReferralRow[];
  loading?: boolean;
  emptyMessage?: string;
  embedInPanel?: boolean;
}) {
  const tableBlock = (
    <div className="max-h-[min(520px,55vh)] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/50">
              <TableHead className="text-xs uppercase text-muted-foreground">Name</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground">Type</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground">Lifecycle</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground">Signed up</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground">Last activity</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground">Subscription</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground">Commission</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground text-right">Earnings</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground text-sm">
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground text-sm">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const sub = subscriptionBadge(r.subscription_status);
                const comm = commissionBadge(r.commission_status);
                return (
                  <TableRow key={r.referral_id} className="border-border/40">
                    <TableCell className="font-medium text-foreground">{r.name}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{r.type}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "font-normal",
                          r.referral_status === "commissioned" || r.referral_status === "subscribed"
                            ? "bg-emerald-600/12 text-emerald-900 dark:text-emerald-200"
                            : r.referral_status === "active"
                              ? "bg-lime-600/12 text-lime-900 dark:text-lime-200"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {lifecycleLabel(r.referral_status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums text-sm">
                      {formatReferralDate(r.date)}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums text-sm">
                      {formatReferralDate(r.last_activity_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn("font-normal", sub.className)}>
                        {sub.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn("font-normal", comm.className)}>
                        {comm.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatKes(r.commission)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
    </div>
  );

  if (embedInPanel) {
    return tableBlock;
  }

  return (
    <div className="fv-card overflow-hidden rounded-xl border border-border/50 bg-card/60">
      <div className="border-b border-border/50 px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Referrals</h2>
        <p className="text-xs text-muted-foreground mt-0.5">People referred through your code.</p>
      </div>
      {tableBlock}
    </div>
  );
}

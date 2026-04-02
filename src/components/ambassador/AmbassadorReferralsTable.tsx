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

function formatReferralDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy");
}

export function AmbassadorReferralsTable({
  rows,
  loading,
  emptyMessage = "No referrals yet.",
}: {
  rows: AmbassadorReferralRow[];
  loading?: boolean;
  emptyMessage?: string;
}) {
  return (
    <div className="fv-card overflow-hidden rounded-xl border border-border/50 bg-card/60">
      <div className="border-b border-border/50 px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Referrals</h2>
        <p className="text-xs text-muted-foreground mt-0.5">People referred through your code.</p>
      </div>
      <div className="max-h-[min(520px,55vh)] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/50">
              <TableHead className="text-xs uppercase text-muted-foreground">Name</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground">Type</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground">Status</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground">Date</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground text-right">Commission</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground text-sm">
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground text-sm">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.referral_id} className="border-border/40">
                  <TableCell className="font-medium text-foreground">{r.name}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{r.type}</TableCell>
                  <TableCell>
                    <Badge
                      variant={r.status === "active" ? "default" : "secondary"}
                      className={cn(
                        r.status === "active"
                          ? "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {r.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums text-sm">
                    {formatReferralDate(r.date)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatKes(r.commission)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

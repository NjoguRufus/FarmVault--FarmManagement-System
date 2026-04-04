import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { EmptyStateBlock } from './EmptyStateBlock';
import { formatDevDate, formatMoney } from './utils';

// ---------------------------------------------------------------------------
// Raw DB row shapes
// ---------------------------------------------------------------------------

type ManualRow = {
  id: string;
  created_at: string;
  submitted_at?: string | null;
  amount?: number | null;
  currency?: string | null;
  plan_id?: string | null;
  billing_cycle?: string | null;
  status?: string | null;
  payment_method?: string | null;
  billing_reference?: string | null;
  mpesa_receipt?: string | null;
  transaction_code?: string | null;
};

type StkRow = {
  id: string;
  created_at: string;
  amount?: number | string | null;
  plan?: string | null;
  billing_cycle?: string | null;
  status: string;
  billing_reference?: string | null;
  mpesa_receipt?: string | null;
};

// ---------------------------------------------------------------------------
// Unified payment type
// ---------------------------------------------------------------------------

type PaymentStatus =
  | 'pending'
  | 'manual_confirmed'
  | 'sdk_confirmed'
  | 'rejected'
  | 'failed';

type UnifiedPayment = {
  id: string;
  source: 'manual' | 'stk';
  date: string;
  amount: number | null;
  currency: string;
  plan: string | null;
  cycle: string | null;
  status: PaymentStatus | string;
  billing_reference: string | null;
  receipt: string | null;
};

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

function normalizeAmount(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeManualStatus(row: ManualRow): PaymentStatus | string {
  const s = String(row.status ?? '').trim().toLowerCase();
  const method = String(row.payment_method ?? '').trim().toLowerCase();
  if (s === 'pending_verification' || s === 'pending') return 'pending';
  if (s === 'approved') return method === 'mpesa_stk' ? 'sdk_confirmed' : 'manual_confirmed';
  if (s === 'rejected') return 'rejected';
  return s || 'pending';
}

function normalizeStkStatus(row: StkRow): PaymentStatus | string {
  const s = String(row.status ?? '').trim().toUpperCase();
  if (s === 'SUCCESS') return 'sdk_confirmed';
  if (s === 'FAILED') return 'failed';
  return 'pending';
}

function fromManual(row: ManualRow): UnifiedPayment {
  return {
    id: `manual:${row.id}`,
    source: 'manual',
    date: String(row.submitted_at ?? row.created_at ?? ''),
    amount: normalizeAmount(row.amount),
    currency: String(row.currency ?? 'KES'),
    plan: row.plan_id ? String(row.plan_id) : null,
    cycle: row.billing_cycle ? String(row.billing_cycle) : null,
    status: normalizeManualStatus(row),
    billing_reference: row.billing_reference ? String(row.billing_reference) : null,
    receipt: row.mpesa_receipt
      ? String(row.mpesa_receipt)
      : row.transaction_code
        ? String(row.transaction_code)
        : null,
  };
}

function fromStk(row: StkRow): UnifiedPayment {
  return {
    id: `stk:${row.id}`,
    source: 'stk',
    date: String(row.created_at ?? ''),
    amount: normalizeAmount(row.amount),
    currency: 'KES',
    plan: row.plan ? String(row.plan) : null,
    cycle: row.billing_cycle ? String(row.billing_cycle) : null,
    status: normalizeStkStatus(row),
    billing_reference: row.billing_reference ? String(row.billing_reference) : null,
    receipt: row.mpesa_receipt ? String(row.mpesa_receipt) : null,
  };
}

// ---------------------------------------------------------------------------
// Badge sub-components
// ---------------------------------------------------------------------------

const STATUS_CLASSES: Record<string, string> = {
  pending:
    'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  manual_confirmed:
    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
  sdk_confirmed:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
  rejected:
    'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
  failed:
    'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  manual_confirmed: 'Manual Confirmed',
  sdk_confirmed: 'STK Confirmed',
  rejected: 'Rejected',
  failed: 'Failed',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        STATUS_CLASSES[status] ??
          'bg-muted text-muted-foreground border-border',
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function MethodBadge({ source }: { source: 'manual' | 'stk' }) {
  if (source === 'stk') {
    return (
      <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-400">
        STK
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
      Manual
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CompanyPaymentHistoryTab({
  companyId,
  active,
}: {
  companyId: string;
  active: boolean;
}) {
  const [manualRows, setManualRows] = useState<ManualRow[]>([]);
  const [stkRows, setStkRows] = useState<StkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [manualResult, stkResult] = await Promise.all([
        supabase
          .from('subscription_payments')
          .select(
            'id, created_at, submitted_at, amount, currency, plan_id, billing_cycle, status, payment_method, billing_reference, mpesa_receipt, transaction_code',
          )
          .eq('company_id', companyId)
          .order('created_at', { ascending: false }),
        supabase
          .from('mpesa_payments')
          .select(
            'id, created_at, amount, plan, billing_cycle, status, billing_reference, mpesa_receipt',
          )
          .eq('company_id', companyId)
          .order('created_at', { ascending: false }),
      ]);

      if (manualResult.error) throw new Error(manualResult.error.message);
      if (stkResult.error) throw new Error(stkResult.error.message);

      setManualRows((manualResult.data ?? []) as ManualRow[]);
      setStkRows((stkResult.data ?? []) as StkRow[]);
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load payment history.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // Initial fetch when tab becomes active
  useEffect(() => {
    if (!active || !companyId) return;
    void fetchAll();
  }, [active, companyId, fetchAll]);

  // Realtime — both tables
  useEffect(() => {
    if (!active || !companyId) return;

    const channel = supabase
      .channel(`company-payments:${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscription_payments' },
        () => { void fetchAll(); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mpesa_payments' },
        () => { void fetchAll(); },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [active, companyId, fetchAll]);

  // Merge and sort newest-first
  const unified = useMemo<UnifiedPayment[]>(() => {
    const rows = [
      ...manualRows.map(fromManual),
      ...stkRows.map(fromStk),
    ];
    return rows.sort((a, b) => {
      const ta = a.date ? new Date(a.date).getTime() : 0;
      const tb = b.date ? new Date(b.date).getTime() : 0;
      return tb - ta;
    });
  }, [manualRows, stkRows]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Payment History</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Shows all payments made by this company.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {loading && unified.length === 0 ? (
        <div className="fv-card py-10 text-center text-xs text-muted-foreground">
          Loading…
        </div>
      ) : unified.length === 0 ? (
        <EmptyStateBlock
          title="No payment history"
          description="No payment history for this company yet."
          className="py-10"
        />
      ) : (
        <div className="fv-card overflow-x-auto">
          <table className="fv-table-mobile w-full min-w-[860px] text-sm">
            <thead className="border-b border-border/60 text-xs text-muted-foreground">
              <tr>
                <th className="py-2 text-left font-medium">Date</th>
                <th className="py-2 pr-4 text-right font-medium">Amount</th>
                <th className="py-2 text-left font-medium">Plan</th>
                <th className="py-2 text-left font-medium">Cycle</th>
                <th className="py-2 text-left font-medium">Method</th>
                <th className="py-2 text-left font-medium">Status</th>
                <th className="py-2 text-left font-medium">Reference</th>
                <th className="py-2 text-left font-medium">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {unified.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border/40 last:border-0 hover:bg-muted/30"
                >
                  <td
                    className="whitespace-nowrap py-2.5 pr-4 text-xs"
                    data-label="Date"
                  >
                    {p.date ? formatDevDate(p.date) : '—'}
                  </td>
                  <td
                    className="py-2.5 pr-4 text-right tabular-nums"
                    data-label="Amount"
                  >
                    {p.amount != null ? formatMoney(p.amount, p.currency) : '—'}
                  </td>
                  <td
                    className="py-2.5 pr-4 text-xs capitalize"
                    data-label="Plan"
                  >
                    {p.plan ?? '—'}
                  </td>
                  <td
                    className="py-2.5 pr-4 text-xs capitalize"
                    data-label="Cycle"
                  >
                    {p.cycle ?? '—'}
                  </td>
                  <td className="py-2.5 pr-4" data-label="Method">
                    <MethodBadge source={p.source} />
                  </td>
                  <td className="py-2.5 pr-4" data-label="Status">
                    <StatusBadge status={p.status} />
                  </td>
                  <td
                    className="max-w-[140px] truncate py-2.5 pr-4 font-mono text-[11px]"
                    data-label="Reference"
                    title={p.billing_reference ?? undefined}
                  >
                    {p.billing_reference ?? '—'}
                  </td>
                  <td
                    className="max-w-[160px] truncate py-2.5 font-mono text-[11px]"
                    data-label="Receipt"
                    title={p.receipt ?? undefined}
                  >
                    {p.receipt ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

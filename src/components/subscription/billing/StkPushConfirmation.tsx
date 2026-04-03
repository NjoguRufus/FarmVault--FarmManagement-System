import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export interface MpesaPaymentRow {
  id: string;
  checkout_request_id: string | null;
  company_id: string | null;
  mpesa_receipt: string | null;
  amount: number | string | null;
  phone: string | null;
  status: string;
  result_desc: string | null;
  paid_at: string | null;
  created_at: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

export function StkPushConfirmation({ checkoutRequestId }: { checkoutRequestId: string }) {
  const [payment, setPayment] = useState<MpesaPaymentRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = checkoutRequestId.trim();
    if (!id) return;

    let cancelled = false;

    const channel = supabase
      .channel(`mpesa_payment:${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mpesa_payments',
          filter: `checkout_request_id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new;
          if (isRecord(row) && typeof row.id === 'string') {
            setPayment(row as unknown as MpesaPaymentRow);
          }
        },
      )
      .subscribe();

    void supabase
      .from('mpesa_payments')
      .select('*')
      .eq('checkout_request_id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // eslint-disable-next-line no-console
          console.warn('[StkPushConfirmation] initial fetch', error.message);
        }
        setPayment(data ? (data as MpesaPaymentRow) : null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [checkoutRequestId]);

  if (!checkoutRequestId.trim()) return null;

  if (loading) {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Waiting for payment…
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-950 dark:text-amber-100/90">
        No payment record found yet. If you just approved the prompt, status should appear in a moment.
      </div>
    );
  }

  const st = String(payment.status || '').toUpperCase();

  if (st === 'PENDING') {
    return (
      <div
        className={cn(
          'rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3 text-sm',
          'text-sky-950 dark:text-sky-100/90',
        )}
      >
        <span aria-hidden>⏳</span> Payment pending — approve the M-Pesa prompt on your phone.
      </div>
    );
  }

  if (st === 'SUCCESS') {
    return (
      <div
        className={cn(
          'rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm',
          'text-emerald-950 dark:text-emerald-100/90',
        )}
      >
        <span aria-hidden>✅</span> Payment confirmed
        {payment.mpesa_receipt ? (
          <>
            {' '}
            — receipt <span className="font-mono font-medium">{payment.mpesa_receipt}</span>
          </>
        ) : null}
        <p className="mt-1 text-xs opacity-90">
          Your subscription is still subject to manual verification if required by your plan.
        </p>
      </div>
    );
  }

  if (st === 'FAILED') {
    return (
      <div
        className={cn(
          'rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive',
        )}
      >
        <span aria-hidden>❌</span> Payment failed
        {payment.result_desc ? (
          <>
            : <span className="font-medium">{payment.result_desc}</span>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
      Status: <span className="font-medium text-foreground">{payment.status}</span>
    </div>
  );
}

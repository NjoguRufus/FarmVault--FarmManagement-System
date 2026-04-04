import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/sonner';
import type { MpesaPaymentRow } from '@/types/mpesa';

export type { MpesaPaymentRow };

export type StkConfirmationContext = 'billing' | 'developer';

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

export function StkPushConfirmation({
  checkoutRequestId,
  onSubscriptionActivated,
  onPaymentSuccess,
  confirmationContext = 'billing',
}: {
  checkoutRequestId: string;
  /** Fired once when the server marks `subscription_activated` (after STK success + activation RPC). Billing only. */
  onSubscriptionActivated?: () => void;
  /** Fired once when M-Pesa status is SUCCESS (after global success toast). Use to close modal or clear UI. */
  onPaymentSuccess?: () => void;
  confirmationContext?: StkConfirmationContext;
}) {
  const [payment, setPayment] = useState<MpesaPaymentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const activatedFiredRef = useRef(false);
  const successFiredRef = useRef(false);
  const failedFiredRef = useRef(false);
  const loadingToastIdRef = useRef<string | number | undefined>(undefined);

  const onPaymentSuccessRef = useRef(onPaymentSuccess);
  onPaymentSuccessRef.current = onPaymentSuccess;

  useEffect(() => {
    const id = checkoutRequestId.trim();
    if (!id) return;

    let cancelled = false;
    loadingToastIdRef.current = toast.loading('Waiting for confirmation...');

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
      const tid = loadingToastIdRef.current;
      if (tid !== undefined) {
        toast.dismiss(tid);
        loadingToastIdRef.current = undefined;
      }
    };
  }, [checkoutRequestId]);

  const firePaymentSuccess = useCallback(() => {
    if (successFiredRef.current) return;
    successFiredRef.current = true;

    const tid = loadingToastIdRef.current;
    const message =
      confirmationContext === 'developer'
        ? '✅ Payment confirmed.'
        : '✅ Payment confirmed. Activating your subscription…';

    toast.success(message, {
      id: tid,
      duration: 5000,
    });
    loadingToastIdRef.current = undefined;

    onPaymentSuccessRef.current?.();
  }, [confirmationContext]);

  useEffect(() => {
    if (!payment) return;
    const st = String(payment.status || '').toUpperCase();
    if (st !== 'SUCCESS') return;
    firePaymentSuccess();
  }, [payment, firePaymentSuccess]);

  useEffect(() => {
    if (!payment) return;
    const st = String(payment.status || '').toUpperCase();
    if (st !== 'FAILED') return;
    if (failedFiredRef.current) return;
    failedFiredRef.current = true;

    const tid = loadingToastIdRef.current;
    const desc = payment.result_desc ? String(payment.result_desc) : 'Payment was not completed.';
    toast.error(`Payment failed: ${desc}`, { id: tid, duration: 6000 });
    loadingToastIdRef.current = undefined;
  }, [payment]);

  useEffect(() => {
    if (!payment || !onSubscriptionActivated) return;
    if (!payment.subscription_activated) return;
    if (activatedFiredRef.current) return;
    activatedFiredRef.current = true;
    onSubscriptionActivated();
  }, [payment, onSubscriptionActivated]);

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
    return null;
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

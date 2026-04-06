import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth as useClerkAuth } from '@clerk/react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import type { MpesaPaymentRow } from '@/types/mpesa';

export type { MpesaPaymentRow };

export type StkConfirmationContext = 'billing' | 'developer';

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

function isLikelyNetworkFailure(err: unknown): boolean {
  const msg =
    err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
      ? String((err as { message: string }).message).toLowerCase()
      : String(err ?? '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('network request failed')
  );
}

async function fetchMpesaPaymentRow(checkoutId: string): Promise<{
  data: MpesaPaymentRow | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabase
    .from('mpesa_payments')
    .select('*')
    .eq('checkout_request_id', checkoutId)
    .maybeSingle();
  return {
    data: data ? (data as MpesaPaymentRow) : null,
    error: error ? { message: error.message ?? 'Request failed' } : null,
  };
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
  const { isLoaded: clerkLoaded } = useClerkAuth();
  const [payment, setPayment] = useState<MpesaPaymentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const activatedFiredRef = useRef(false);
  const successFiredRef = useRef(false);
  const failedFiredRef = useRef(false);
  const loadingToastIdRef = useRef<string | number | undefined>(undefined);

  const onPaymentSuccessRef = useRef(onPaymentSuccess);
  onPaymentSuccessRef.current = onPaymentSuccess;

  useEffect(() => {
    const id = checkoutRequestId.trim();
    if (!id || !clerkLoaded) return;

    let cancelled = false;
    setLoading(true);
    setFetchFailed(false);
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
            setFetchFailed(false);
          }
        },
      )
      .subscribe();

    const load = async () => {
      setFetchFailed(false);
      let lastErr: { message: string } | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
        if (cancelled) return;
        const { data, error } = await fetchMpesaPaymentRow(id);
        if (cancelled) return;
        if (!error) {
          setPayment(data);
          setLoading(false);
          setFetchFailed(false);
          return;
        }
        lastErr = error;
        if (!isLikelyNetworkFailure(error)) {
          // eslint-disable-next-line no-console
          console.warn('[StkPushConfirmation] initial fetch', error.message);
          break;
        }
      }
      setLoading(false);
      setFetchFailed(true);
      if (lastErr) {
        // eslint-disable-next-line no-console
        console.warn('[StkPushConfirmation] initial fetch exhausted retries', lastErr.message);
      }
    };

    void load();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      const tid = loadingToastIdRef.current;
      if (tid !== undefined) {
        toast.dismiss(tid);
        loadingToastIdRef.current = undefined;
      }
    };
  }, [checkoutRequestId, clerkLoaded, retryCount]);

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

  if (!clerkLoaded) {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Preparing session…
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Waiting for payment…
      </div>
    );
  }

  if (fetchFailed) {
    return (
      <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm space-y-2">
        <p className="text-destructive">
          Could not reach FarmVault to load payment status ({confirmationContext === 'billing' ? 'check your connection' : 'check network'}). Realtime updates may still arrive.
        </p>
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setRetryCount((c) => c + 1)}>
          Retry
        </Button>
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

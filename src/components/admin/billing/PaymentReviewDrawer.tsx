import React, { useEffect, useState } from 'react';
import { CreditCard, ShieldCheck, XCircle, CheckCircle2, Clock4 } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import type { SubscriptionPaymentDoc } from '@/services/subscriptionPaymentService';
import { getCompanySubscription, type CompanySubscriptionRecord } from '@/services/subscriptionAdminService';

export interface PaymentReviewDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: (SubscriptionPaymentDoc & { id: string }) | null;
  onApprove: (payment: SubscriptionPaymentDoc & { id: string }, note: string) => Promise<void> | void;
  onReject: (paymentId: string, note: string) => Promise<void> | void;
  onGrantOverride: (companyId: string) => void;
}

export function PaymentReviewDrawer({
  open,
  onOpenChange,
  payment,
  onApprove,
  onReject,
  onGrantOverride,
}: PaymentReviewDrawerProps) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [subscription, setSubscription] = useState<CompanySubscriptionRecord | null>(null);
  const [trialInfo, setTrialInfo] = useState<string | null>(null);

  useEffect(() => {
    if (open && payment) {
      setNote('');
      setSubmitting(false);
      setSubscription(null);
      setTrialInfo(null);
      getCompanySubscription(payment.companyId)
        .then((sub) => {
          setSubscription(sub);
          if (!sub) return;
          const trialEnds = (sub as any).trialEndsAt?.toDate?.() as Date | undefined;
          if (sub.status === 'trial' && trialEnds) {
            const now = new Date();
            const diffMs = trialEnds.getTime() - now.getTime();
            const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            if (days > 0) {
              setTrialInfo(`${days} day${days === 1 ? '' : 's'} remaining in free trial`);
            } else {
              setTrialInfo('Trial ended');
            }
          } else if (sub.status === 'trial') {
            setTrialInfo('On free trial');
          }
        })
        .catch(() => {
          setSubscription(null);
        });
    }
  }, [open, payment?.id, payment?.companyId]);

  if (!payment) {
    return null;
  }

  const planLabel = payment.planName ?? payment.plan;
  const modeLabel = (payment.billingMode ?? payment.mode)?.toString();

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await onApprove(payment, note.trim());
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    setSubmitting(true);
    try {
      await onReject(payment.id!, note.trim());
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGrantOverride = () => {
    onGrantOverride(payment.companyId);
  };

  const createdAt = (payment as any).createdAt;
  let createdAtLabel = '—';
  if (createdAt?.toDate) {
    createdAtLabel = createdAt.toDate().toLocaleString();
  } else if (createdAt?.seconds) {
    createdAtLabel = new Date(createdAt.seconds * 1000).toLocaleString();
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent resizable defaultHeightVh={60}>
        <DrawerHeader className="flex flex-col items-start gap-1 border-b border-border/60">
          <DrawerTitle className="flex items-center gap-2 text-left">
            <CreditCard className="h-5 w-5 text-primary" />
            Review payment
          </DrawerTitle>
          <DrawerDescription className="text-left">
            Confirm this M-Pesa subscription payment or grant a temporary override.
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 py-3 space-y-4">
          <div className="fv-card border border-border/70 bg-muted/30">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Company
                  </p>
                  <p className="font-semibold text-foreground">
                    {payment.companyName || payment.companyId}
                  </p>
                  <p className="text-xs text-muted-foreground break-all">
                    {payment.companyId}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Amount
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    KES {Number(payment.amount).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{createdAtLabel}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                <div>
                  <p className="font-medium text-muted-foreground uppercase tracking-wide">
                    Plan
                  </p>
                  <p className="mt-0.5 text-foreground capitalize">
                    {planLabel} · {modeLabel}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground uppercase tracking-wide">
                    Payer
                  </p>
                  <p className="mt-0.5 text-foreground">
                    {payment.mpesaPayerName || payment.mpesaName}
                  </p>
                  {payment.mpesaPhone || payment.phone ? (
                    <p className="text-xs text-muted-foreground">
                      {payment.mpesaPhone || payment.phone}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 text-xs">
                <p className="font-medium text-muted-foreground uppercase tracking-wide">
                  M-Pesa Reference
                </p>
                <p className="font-mono text-xs mt-0.5">
                  {payment.mpesaReceipt || payment.transactionCode || '—'}
                </p>
              </div>
              {trialInfo && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] text-amber-900">
                  <Clock4 className="h-3 w-3" />
                  <span>{trialInfo}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Quick notes (optional)
            </label>
            <textarea
              className="fv-input min-h-[80px] resize-y text-sm"
              placeholder="Why you approved/rejected, reference for future audits…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Notes are stored with the payment record and visible only to developers.
            </p>
          </div>
        </div>
        <DrawerFooter className="border-t border-border/60 bg-background/80 backdrop-blur">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleGrantOverride}
              disabled={submitting}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Grant override
            </button>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="fv-btn fv-btn--secondary text-xs"
                onClick={handleReject}
                disabled={submitting}
              >
                <XCircle className="h-3 w-3 mr-1" />
                Reject
              </button>
              <button
                type="button"
                className="fv-btn fv-btn--primary text-xs"
                onClick={handleApprove}
                disabled={submitting}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Approve &amp; activate
              </button>
            </div>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}


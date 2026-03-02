import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle, Crown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import type { PaymentMode } from '@/services/companyService';
import { createSubscriptionPayment } from '@/services/subscriptionPaymentService';

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isTrial: boolean;
  isExpired: boolean;
  daysRemaining: number | null;
}

export function UpgradeModal({ open, onOpenChange, isTrial, isExpired, daysRemaining }: UpgradeModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState<'basic' | 'pro'>('basic');
  const [mode, setMode] = useState<PaymentMode>('monthly');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mpesaName, setMpesaName] = useState('');
  const [phone, setPhone] = useState('');
  const [transactionCode, setTransactionCode] = useState('');

  const title = isExpired ? 'Trial expired' : 'Upgrade to keep full access';

  const description = isExpired
    ? 'Your trial has ended. Upgrade your FarmVault subscription to continue adding projects, expenses, employees, and harvest data.'
    : 'Your trial is limited. Upgrade now to keep full write access to FarmVault.';

  const badge =
    !isExpired && typeof daysRemaining === 'number' && daysRemaining >= 0
      ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left in trial`
      : null;

  const pricing = useMemo(() => {
    const base: Record<'basic' | 'pro', Record<PaymentMode, number>> = {
      basic: { monthly: 2500, seasonal: 6500, annual: 25000 },
      pro: { monthly: 5500, seasonal: 14000, annual: 55000 },
    };
    const months: Record<PaymentMode, number> = {
      monthly: 1,
      seasonal: 3,
      annual: 12,
    };
    const currentPrice = base[plan][mode];
    const monthlyPrice = base[plan].monthly;
    const durationMonths = months[mode];
    const baseline = monthlyPrice * durationMonths;
    const savings = mode === 'monthly' ? 0 : Math.max(0, baseline - currentPrice);
    return { currentPrice, monthlyPrice, savings, durationMonths };
  }, [plan, mode]);

  const handleTransactionCodeChange = (raw: string) => {
    // Allow users to paste the full M-Pesa SMS; extract a clean 10-character code.
    const cleaned = raw.replace(/[^A-Za-z0-9]/g, '');
    const code = cleaned.slice(0, 10).toUpperCase();
    setTransactionCode(code);
  };

  const handleConfirm = async () => {
    if (!user?.companyId) {
      onOpenChange(false);
      return;
    }
    if (!mpesaName.trim() || !phone.trim() || !transactionCode.trim()) {
      setError('Please fill in M-Pesa name, phone number, and transaction code.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createSubscriptionPayment({
        companyId: user.companyId,
        companyName: (user as any)?.companyName ?? null,
        plan,
        mode,
        amount: pricing.currentPrice,
        mpesaName: mpesaName.trim(),
        phone: phone.trim(),
        transactionCode: transactionCode.trim(),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['company-subscription', user.companyId] }),
        queryClient.invalidateQueries({ queryKey: ['company-billing', user.companyId] }),
      ]);
      onOpenChange(false);
      if (typeof window !== 'undefined') {
        window.alert('Payment submitted. Awaiting manual confirmation.');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update subscription. Please try again.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isExpired ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <Crown className="h-5 w-5 text-fv-olive" />
            )}
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{description}</p>
            {badge && (
              <div className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                {badge}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Choose a plan and billing cycle below. You can still view all your existing data; upgrading keeps full write access.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Plan
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPlan('basic')}
                  className={`fv-btn flex-1 text-sm ${plan === 'basic' ? 'fv-btn--primary' : 'fv-btn--secondary'}`}
                >
                  Basic
                </button>
                <button
                  type="button"
                  onClick={() => setPlan('pro')}
                  className={`fv-btn flex-1 text-sm ${plan === 'pro' ? 'fv-btn--primary' : 'fv-btn--secondary'}`}
                >
                  Pro
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Payment Mode
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMode('monthly')}
                  className={`fv-btn flex-1 text-xs ${mode === 'monthly' ? 'fv-btn--primary' : 'fv-btn--secondary'}`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setMode('seasonal')}
                  className={`fv-btn flex-1 text-xs ${mode === 'seasonal' ? 'fv-btn--primary' : 'fv-btn--secondary'}`}
                >
                  Seasonal (3 months)
                </button>
                <button
                  type="button"
                  onClick={() => setMode('annual')}
                  className={`fv-btn flex-1 text-xs ${mode === 'annual' ? 'fv-btn--primary' : 'fv-btn--secondary'}`}
                >
                  Annual
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Pay via M-Pesa
            </p>
            <p className="text-xs text-muted-foreground">
              Till Number: <span className="font-semibold text-foreground">123456</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Business Name: <span className="font-semibold text-foreground">FarmVault</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Exact Amount: <span className="font-semibold text-foreground">KES {pricing.currentPrice.toLocaleString()}</span>
            </p>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">
                {plan === 'basic' ? 'Basic' : 'Pro'} ·{' '}
                {mode === 'monthly' ? 'Monthly' : mode === 'seasonal' ? 'Seasonal (3 months)' : 'Annual'}
              </p>
              <p className="text-xs text-muted-foreground">
                KES {pricing.currentPrice.toLocaleString()} for {pricing.durationMonths}{' '}
                {pricing.durationMonths === 1 ? 'month' : 'months'}
              </p>
              {pricing.savings > 0 && (
                <p className="text-xs text-emerald-700 mt-1">
                  Save KES {pricing.savings.toLocaleString()} vs paying monthly.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">M-Pesa Name</label>
              <input
                className="fv-input h-8 text-sm"
                value={mpesaName}
                onChange={(e) => setMpesaName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Phone Number</label>
              <input
                className="fv-input h-8 text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+2547..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Transaction Code</label>
              <input
                className="fv-input h-8 text-sm"
                value={transactionCode}
                onChange={(e) => handleTransactionCodeChange(e.target.value)}
                placeholder="Paste full M-Pesa message"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="mt-4 flex flex-wrap justify-between gap-2">
          <button
            type="button"
            className="fv-btn fv-btn--secondary"
            onClick={() => onOpenChange(false)}
          >
            Maybe later
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="fv-btn fv-btn--secondary text-xs opacity-60 cursor-not-allowed"
              disabled
            >
              STK Push (Coming Soon)
            </button>
            <button
              type="button"
              className="fv-btn fv-btn--primary"
              onClick={handleConfirm}
              disabled={saving}
            >
              {saving ? 'Submitting…' : 'Submit M-Pesa Payment'}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


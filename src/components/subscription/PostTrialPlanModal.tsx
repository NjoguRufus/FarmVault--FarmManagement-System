import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Crown, Sparkles } from 'lucide-react';
import { choosePostTrialPlan } from '@/services/subscriptionService';
import { useAuth } from '@/contexts/AuthContext';
import { BillingModal } from '@/components/subscription/billing/BillingModal';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface PostTrialPlanModalProps {
  open: boolean;
}

/**
 * Shown when the 7-day Pro trial has ended and `is_trial` is still true.
 * Must pick Basic or Pro — saves via `choose_post_trial_plan` RPC.
 */
export function PostTrialPlanModal({ open }: PostTrialPlanModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<'basic' | 'pro' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingOpen, setBillingOpen] = useState(false);

  const handleChoose = async (plan: 'basic' | 'pro') => {
    setSaving(plan);
    setError(null);
    try {
      await choosePostTrialPlan(plan);
      const cid = user?.companyId;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['subscription-gate', cid] }),
        queryClient.invalidateQueries({ queryKey: ['company-subscription-row', cid] }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your plan. Try again.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-md [&>button:last-child]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-fv-olive" />
              Your Pro trial has ended
            </DialogTitle>
            <DialogDescription>
              Choose whether to keep Pro or continue with Basic.
            </DialogDescription>
          </DialogHeader>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/30 p-4 flex flex-col gap-3">
              <div>
                <p className="font-semibold text-foreground">Continue with Basic</p>
                <p className="text-xs text-muted-foreground mt-1">Core tracking and limits for smaller operations.</p>
              </div>
              <Button
                variant="outline"
                className="w-full mt-auto"
                disabled={saving !== null}
                onClick={() => void handleChoose('basic')}
              >
                {saving === 'basic' ? 'Saving…' : 'Continue with Basic'}
              </Button>
            </div>
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-1 text-primary">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">Pro</span>
              </div>
              <div>
                <p className="font-semibold text-foreground">Keep Pro</p>
                <p className="text-xs text-muted-foreground mt-1">Continue with Pro and complete billing to activate.</p>
              </div>
              <Button
                className="w-full mt-auto"
                disabled={saving !== null}
                onClick={() => {
                  // Requirement: open billing immediately; do not silently downgrade.
                  setBillingOpen(true);
                  void handleChoose('pro');
                }}
              >
                Keep Pro
              </Button>
            </div>
          </div>

          <DialogFooter className="sm:justify-center">
            <p className="text-[11px] text-muted-foreground text-center w-full">
              Your data stays safe. Choosing Basic only restricts access to Pro-only tools.
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BillingModal
        open={billingOpen}
        onOpenChange={setBillingOpen}
        isTrial={false}
        isExpired={true}
        daysRemaining={null}
        checkoutPlan="pro"
        workspaceCompanyId={user?.companyId ?? null}
      />
    </>
  );
}

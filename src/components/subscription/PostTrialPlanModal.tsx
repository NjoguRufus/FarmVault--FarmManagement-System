import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Crown, Sparkles } from 'lucide-react';
import { choosePostTrialPlan } from '@/services/subscriptionService';
import { useAuth } from '@/contexts/AuthContext';
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

  const handleChoose = async (plan: 'basic' | 'pro') => {
    setSaving(plan);
    setError(null);
    try {
      await choosePostTrialPlan(plan);
      const cid = user?.companyId;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['company-subscription', cid] }),
        queryClient.invalidateQueries({ queryKey: ['subscription-gate', cid] }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your plan. Try again.');
    } finally {
      setSaving(null);
    }
  };

  return (
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
            Choose how you want to continue. You can keep using FarmVault on <strong>Basic</strong> or stay on{' '}
            <strong>Pro</strong> features.
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
              {saving === 'basic' ? 'Saving…' : 'Use Basic'}
            </Button>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-1 text-primary">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Recommended</span>
            </div>
            <div>
              <p className="font-semibold text-foreground">Upgrade to Pro</p>
              <p className="text-xs text-muted-foreground mt-1">Unlock advanced reports, integrations, and Pro-only tools.</p>
            </div>
            <Button className="w-full mt-auto" disabled={saving !== null} onClick={() => void handleChoose('pro')}>
              {saving === 'pro' ? 'Saving…' : 'Keep Pro'}
            </Button>
          </div>
        </div>

        <DialogFooter className="sm:justify-center">
          <p className="text-[11px] text-muted-foreground text-center w-full">
            Billing and M-Pesa payment (if required) can be completed from Billing after you choose.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

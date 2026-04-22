import React, { useState, useEffect } from 'react';
import { Banknote } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { isConcurrentUpdateConflict, CONCURRENT_UPDATE_MESSAGE } from '@/lib/concurrentUpdate';
import { useAuth } from '@/contexts/AuthContext';
import { markWorkCardPaid, type WorkCard } from '@/services/operationsWorkCardService';
import { createAdminAlert } from '@/services/adminAlertService';
import { createFinanceExpense } from '@/services/financeExpenseService';
import { logger } from "@/lib/logger";

interface MarkPaidModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workCard: WorkCard | null;
  onSuccess?: () => void;
}

export function MarkPaidModal({ open, onOpenChange, workCard, onSuccess }: MarkPaidModalProps) {
  const { user } = useAuth();
  const companyId = user?.companyId ?? null;

  const [saving, setSaving] = useState(false);
  const [paymentNoteOpen, setPaymentNoteOpen] = useState(false);
  const [formData, setFormData] = useState({
    amount: 0,
    method: 'mpesa' as 'cash' | 'mpesa' | 'bank' | 'other',
    notes: '',
  });

  // Initialize with actual total when modal opens
  useEffect(() => {
    if (workCard && open) {
      setPaymentNoteOpen(false);
      setFormData({
        amount: workCard.actualTotal ?? workCard.plannedTotal ?? 0,
        method: 'mpesa',
        notes: '',
      });
    }
  }, [workCard, open]);

  const handleSubmit = async () => {
    if (!workCard) return;

    if (formData.amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setSaving(true);
    try {
      // Mark work card as paid
      await markWorkCardPaid({
        id: workCard.id,
        expectedRowVersion: workCard.rowVersion ?? null,
        amount: formData.amount,
        method: formData.method,
        notes: formData.notes.trim() || null,
        actorUserId: user?.id ?? '',
        actorUserName: user?.name ?? null,
      });

      // Create labor expense in Supabase
      try {
        await createFinanceExpense({
          companyId: companyId!,
          farmId: workCard.farmId,
          projectId: workCard.projectId,
          category: 'labour',
          amount: formData.amount,
          note: `Labor: ${workCard.workTitle} (${workCard.workCategory})`,
          expenseDate: new Date().toISOString().slice(0, 10),
          createdBy: user?.id ?? null,
        });
        if (import.meta.env.DEV) {
          logger.log('[MarkPaid] Labor expense created in Supabase', {
            amount: formData.amount,
            workCardId: workCard.id,
            category: 'labour',
          });
        }
      } catch (expenseError) {
        console.error('Failed to create labor expense:', expenseError);
      }

      // Create admin alert
      await createAdminAlert({
        companyId: companyId!,
        severity: 'normal',
        module: 'operations',
        action: 'WORK_PAID',
        actorUserId: user?.id ?? undefined,
        actorName: user?.name ?? undefined,
        targetId: workCard.id,
        targetLabel: workCard.workTitle,
        metadata: {
          amount: formData.amount,
          method: formData.method,
        },
      });

      toast.success('Work marked as paid');
      onSuccess?.();
    } catch (error) {
      console.error('Failed to mark work as paid:', error);
      toast.error(isConcurrentUpdateConflict(error) ? CONCURRENT_UPDATE_MESSAGE : 'Failed to mark work as paid');
    } finally {
      setSaving(false);
    }
  };

  if (!workCard) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[520px] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Mark as Paid
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Work Card Info */}
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="font-medium">{workCard.workTitle}</p>
            <p className="text-sm text-muted-foreground">{workCard.workCategory}</p>
            {workCard.loggedByName && (
              <p className="text-xs text-muted-foreground mt-1">
                Logged by {workCard.loggedByName}
              </p>
            )}
          </div>

          {/* Amount + payment method — same row on all breakpoints */}
          <div className="grid grid-cols-2 gap-2 sm:gap-4 items-start">
            <div className="min-w-0 space-y-1.5 sm:space-y-2">
              <Label htmlFor="amount" className="text-xs leading-tight sm:text-sm">
                Amount Paid (KSh) *
              </Label>
              <Input
                id="amount"
                type="number"
                min={0}
                className="min-w-0"
                value={formData.amount}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  amount: parseFloat(e.target.value) || 0,
                }))}
              />
              {workCard.actualTotal && workCard.actualTotal !== formData.amount && (
                <p className="text-xs text-muted-foreground">
                  Calculated total: KSh {workCard.actualTotal.toLocaleString()}
                </p>
              )}
            </div>
            <div className="min-w-0 space-y-1.5 sm:space-y-2">
              <Label htmlFor="method" className="text-xs leading-tight sm:text-sm">
                Payment Method
              </Label>
              <Select
                value={formData.method}
                onValueChange={(v) => setFormData(prev => ({
                  ...prev,
                  method: v as 'cash' | 'mpesa' | 'bank' | 'other',
                }))}
              >
                <SelectTrigger id="method" className="min-w-0 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-primary/25 bg-primary/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-primary">Amount to Pay</span>
              <span className="text-2xl font-bold tabular-nums text-foreground">
                KSh {formData.amount.toLocaleString()}
              </span>
            </div>
            <p className="mt-2 text-xs text-primary/80">
              This will create a labor expense entry
            </p>
          </div>
        </div>

        <DialogFooter className="!flex-row flex-nowrap items-center justify-end gap-2 space-x-0 sm:space-x-0">
          <Button
            variant="outline"
            className="min-w-0 flex-1 sm:flex-initial"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button className="min-w-0 flex-1 sm:flex-initial" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Processing...' : 'Confirm Payment'}
          </Button>
        </DialogFooter>

        {paymentNoteOpen ? (
          <div className="space-y-2">
            <Label htmlFor="notes">Payment note</Label>
            <Textarea
              id="notes"
              placeholder="Optional notes..."
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-0 text-muted-foreground hover:text-foreground"
              onClick={() => setPaymentNoteOpen(false)}
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="flex justify-start">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs font-normal"
              onClick={() => setPaymentNoteOpen(true)}
            >
              Add Payment Note
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

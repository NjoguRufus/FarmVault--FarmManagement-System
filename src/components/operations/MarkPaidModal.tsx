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
  const [formData, setFormData] = useState({
    amount: 0,
    method: 'cash' as 'cash' | 'mpesa' | 'bank' | 'other',
    notes: '',
  });

  // Initialize with actual total when modal opens
  useEffect(() => {
    if (workCard && open) {
      setFormData({
        amount: workCard.actualTotal ?? workCard.plannedTotal ?? 0,
        method: 'cash',
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
      <DialogContent className="sm:max-w-[400px]">
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

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount Paid (KSh) *</Label>
            <Input
              id="amount"
              type="number"
              min={0}
              value={formData.amount}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                amount: parseFloat(e.target.value) || 0 
              }))}
            />
            {workCard.actualTotal && workCard.actualTotal !== formData.amount && (
              <p className="text-xs text-muted-foreground">
                Calculated total: KSh {workCard.actualTotal.toLocaleString()}
              </p>
            )}
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label htmlFor="method">Payment Method</Label>
            <Select
              value={formData.method}
              onValueChange={(v) => setFormData(prev => ({ 
                ...prev, 
                method: v as 'cash' | 'mpesa' | 'bank' | 'other' 
              }))}
            >
              <SelectTrigger>
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

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Payment Notes</Label>
            <Textarea
              id="notes"
              placeholder="Optional notes..."
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
            />
          </div>

          {/* Summary */}
          <div className="p-4 rounded-lg bg-purple-50 border border-purple-200">
            <div className="flex items-center justify-between">
              <span className="text-purple-700">Amount to Pay</span>
              <span className="text-2xl font-bold text-purple-900">
                KSh {formData.amount.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-purple-600 mt-2">
              This will create a labor expense entry
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Processing...' : 'Confirm Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

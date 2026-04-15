import React, { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createFinanceExpense } from '@/services/financeExpenseService';
import { toast } from 'sonner';

type ExpenseCategory = 'labour' | 'fertilizer' | 'chemical' | 'fuel' | 'other';

interface AddExpenseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  farmId: string | null;
  projectId?: string | null;
  createdBy?: string | null;
  onSaved?: () => void | Promise<void>;
}

export function AddExpenseModal({
  open,
  onOpenChange,
  companyId,
  farmId,
  projectId = null,
  createdBy = null,
  onSaved,
}: AddExpenseModalProps) {
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('labour');
  const [customCategory, setCustomCategory] = useState('');

  const reset = () => {
    setDescription('');
    setAmount('');
    setCategory('labour');
    setCustomCategory('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !farmId) {
      toast.error('Farm context is required.');
      return;
    }
    const amountNum = Number(amount);
    if (!description.trim() || !Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error('Enter valid expense details.');
      return;
    }
    setSaving(true);
    try {
      const categoryToSave =
        category === 'other' && customCategory.trim() ? customCategory.trim() : category;
      await createFinanceExpense({
        companyId,
        farmId,
        projectId,
        category: categoryToSave,
        amount: amountNum,
        note: description.trim(),
        createdBy,
      });
      await onSaved?.();
      toast.success('Expense added.');
      reset();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error('Could not add expense.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSave}>
          <div>
            <label className="text-sm font-medium">Description</label>
            <input
              className="fv-input mt-1"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">Amount (KES)</label>
            <input
              className="fv-input mt-1"
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">Category</label>
            <select
              className="fv-select mt-1"
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            >
              <option value="labour">Labour</option>
              <option value="fertilizer">Fertilizer</option>
              <option value="chemical">Chemical</option>
              <option value="fuel">Fuel</option>
              <option value="other">Custom / Not listed</option>
            </select>
          </div>
          {category === 'other' && (
            <div>
              <label className="text-sm font-medium">Custom category</label>
              <input
                className="fv-input mt-1"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="e.g. Transport"
              />
            </div>
          )}
          <DialogFooter>
            <button type="button" className="fv-btn fv-btn--secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button type="submit" className="fv-btn fv-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Expense'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

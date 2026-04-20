import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createFinanceExpense, getFinanceExpenses } from '@/services/financeExpenseService';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';

type ExpenseCategoryBase = 'labour' | 'fertilizer' | 'chemical' | 'fuel';

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
  const [category, setCategory] = useState<string>('labour');
  const [categoryInputMode, setCategoryInputMode] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const [addAnotherAfterSave, setAddAnotherAfterSave] = useState(false);

  const reset = () => {
    setDescription('');
    setAmount('');
    setCategory('labour');
    setCategoryInputMode(false);
    setCustomCategory('');
    setAddAnotherAfterSave(false);
  };

  const categoriesQuery = useQuery({
    queryKey: ['financeExpenses', 'categories', companyId ?? 'none', farmId ?? 'all', projectId ?? 'all'],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!companyId) return [];
      const rows = await getFinanceExpenses(companyId, { farmId, projectId });
      const uniq = new Set<string>();
      for (const r of rows) {
        const c = String(r.category ?? '').trim();
        if (c) uniq.add(c);
      }
      return Array.from(uniq.values()).sort((a, b) => a.localeCompare(b));
    },
  });

  const categoryOptions = useMemo(() => {
    const base: Array<{ value: string; label: string }> = [
      { value: 'labour', label: 'Labour' },
      { value: 'fertilizer', label: 'Fertilizer' },
      { value: 'chemical', label: 'Chemical' },
      { value: 'fuel', label: 'Fuel' },
    ];
    const seen = new Set(base.map((b) => b.value));
    const dynamic = (categoriesQuery.data ?? [])
      .filter((c) => !seen.has(c))
      .map((c) => ({ value: c, label: c }));
    return [...dynamic, ...base];
  }, [categoriesQuery.data]);

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
      const categoryToSave = categoryInputMode && customCategory.trim() ? customCategory.trim() : category;
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
      if (addAnotherAfterSave) {
        setDescription('');
        setAmount('');
        setAddAnotherAfterSave(false);
      } else {
        reset();
        onOpenChange(false);
      }
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
            <Input
              className="mt-1"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">Amount (KES)</label>
            <Input
              className="mt-1"
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">Category</label>
            {categoryInputMode ? (
              <div className="mt-1 space-y-2">
                <Input
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Type a category (e.g. Transport)"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => {
                      setCustomCategory('');
                      setCategoryInputMode(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="rounded-xl"
                    onClick={() => {
                      const v = customCategory.trim();
                      if (!v) return;
                      setCategory(v);
                      setCategoryInputMode(false);
                    }}
                  >
                    Save category
                  </Button>
                </div>
              </div>
            ) : (
              <Select
                value={category}
                onValueChange={(v) => {
                  if (v === '__add_new__') {
                    setCategoryInputMode(true);
                    setCustomCategory('');
                    return;
                  }
                  setCategory(v);
                }}
              >
                <SelectTrigger className="mt-1 rounded-xl">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__add_new__">Add new category…</SelectItem>
                  {categoryOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter className="flex flex-row gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="rounded-xl"
              onClick={() => {
                setAddAnotherAfterSave(true);
              }}
              disabled={saving}
              title="Save and keep this modal open to add another expense"
            >
              Add another expense
            </Button>
            <Button type="submit" className="rounded-xl" disabled={saving}>
              {saving ? 'Saving…' : 'Save Expense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

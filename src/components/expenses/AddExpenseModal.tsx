import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ExpenseService } from '@/services/localData/ExpenseService';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon } from 'lucide-react';
import { toDate, formatDate } from '@/lib/dateUtils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn, getExpenseCategoryLabel } from '@/lib/utils';
import {
  COMPANY_EXPENSE_CATEGORY_CORE_ORDER,
  CUSTOM_EXPENSE_CATEGORIES_CHANGED,
  addCustomExpenseCategory,
  isBrokerExpenseCategorySlug,
  loadCustomExpenseCategories,
} from '@/lib/customExpenseCategoriesStorage';
import { shouldPromptAddInventoryAfterExpense } from '@/lib/expenseInventoryLink';

type DraftExpenseRow = {
  id: string;
  description: string;
  amount: string;
  category: string;
};

/** When set, the modal is in “edit this expense” mode (single row + date). */
export type AddExpenseEditTarget = {
  id: string;
  companyId: string;
  description: string;
  amount: number;
  category: string;
  date: Date | string;
};

export type ExpenseSavedInventoryCandidate = {
  description: string;
  amount: number;
  category: string;
};

interface AddExpenseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  farmId: string | null;
  projectId?: string | null;
  createdBy?: string | null;
  onSaved?: () => void | Promise<void>;
  editingExpense?: AddExpenseEditTarget | null;
  /** After new expenses are saved: rows whose category suggests inventory (fertilizer, chemical, fuel, …). */
  onSavedWithInventoryCandidates?: (rows: ExpenseSavedInventoryCandidate[]) => void;
}

export function AddExpenseModal({
  open,
  onOpenChange,
  companyId,
  farmId,
  projectId = null,
  createdBy = null,
  onSaved,
  editingExpense = null,
  onSavedWithInventoryCandidates,
}: AddExpenseModalProps) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [editExpenseDate, setEditExpenseDate] = useState<Date | undefined>(undefined);

  const newRow = useCallback((): DraftExpenseRow => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? (crypto as any).randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return { id, description: '', amount: '', category: 'labour' };
  }, []);

  const [rows, setRows] = useState<DraftExpenseRow[]>(() => [newRow()]);

  const reset = () => {
    setRows([newRow()]);
    setEditExpenseDate(undefined);
  };

  useEffect(() => {
    if (!open) return;
    if (editingExpense) {
      const d0 = toDate(editingExpense.date) ?? new Date();
      setEditExpenseDate(d0);
      setRows([
        {
          id: editingExpense.id,
          description: editingExpense.description,
          amount: String(editingExpense.amount),
          category: editingExpense.category,
        },
      ]);
    } else {
      setEditExpenseDate(undefined);
      setRows([newRow()]);
    }
  }, [open, editingExpense, newRow]);

  const [customCategoriesEpoch, setCustomCategoriesEpoch] = useState(0);
  useEffect(() => {
    const onStorage = () => setCustomCategoriesEpoch((e) => e + 1);
    window.addEventListener(CUSTOM_EXPENSE_CATEGORIES_CHANGED, onStorage);
    return () => window.removeEventListener(CUSTOM_EXPENSE_CATEGORIES_CHANGED, onStorage);
  }, []);

  const categoriesQuery = useQuery({
    queryKey: ['financeExpenses', 'categories', companyId ?? 'none', farmId ?? 'all', projectId ?? 'all'],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!companyId) return [];
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await ExpenseService.pullRemote(companyId, { farmId, projectId });
        } catch {
          // ignore
        }
      }
      const rows = await ExpenseService.list(companyId, { farmId, projectId });
      const uniq = new Set<string>();
      for (const r of rows) {
        const c = String(r.category ?? '').trim();
        if (c) uniq.add(c);
      }
      return Array.from(uniq.values()).sort((a, b) => a.localeCompare(b));
    },
  });

  const categoryOptions = useMemo(() => {
    const seenLower = new Set<string>();
    const out: Array<{ value: string; label: string }> = [];

    for (const value of COMPANY_EXPENSE_CATEGORY_CORE_ORDER) {
      seenLower.add(value.toLowerCase());
      out.push({ value, label: getExpenseCategoryLabel(value) });
    }

    const stored = [...loadCustomExpenseCategories(companyId)].sort((a, b) =>
      getExpenseCategoryLabel(a).localeCompare(getExpenseCategoryLabel(b), undefined, {
        sensitivity: 'base',
      }),
    );
    for (const c of stored) {
      if (isBrokerExpenseCategorySlug(c)) continue;
      const L = c.toLowerCase();
      if (seenLower.has(L)) continue;
      seenLower.add(L);
      out.push({ value: c, label: c });
    }

    const dynamic = (categoriesQuery.data ?? [])
      .filter((c) => !seenLower.has(c.toLowerCase()) && !isBrokerExpenseCategorySlug(c))
      .sort((a, b) =>
        getExpenseCategoryLabel(a).localeCompare(getExpenseCategoryLabel(b), undefined, {
          sensitivity: 'base',
        }),
      );
    for (const c of dynamic) {
      seenLower.add(c.toLowerCase());
      out.push({ value: c, label: c });
    }

    return out;
  }, [categoriesQuery.data, companyId, customCategoriesEpoch]);

  function CategoryCombobox({
    value,
    onChange,
    options,
    disabled,
  }: {
    value: string;
    onChange: (next: string) => void;
    options: Array<{ value: string; label: string }>;
    disabled: boolean;
  }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="mt-1 w-full justify-between rounded-xl"
            disabled={disabled}
          >
            <span className="truncate">{value ? value : 'Select category…'}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Type to search or add…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    const v = search.trim();
                    if (!v) return;
                    onChange(v);
                    setOpen(false);
                  }}
                >
                  Use “{search.trim() || '…'}”
                </button>
              </CommandEmpty>
              {search.trim() ? (
                <CommandGroup>
                  <CommandItem
                    value={search.trim()}
                    onSelect={() => {
                      const v = search.trim();
                      if (!v) return;
                      onChange(v);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === search.trim() ? 'opacity-100' : 'opacity-0')} />
                    Add “{search.trim()}”
                  </CommandItem>
                </CommandGroup>
              ) : null}
              <CommandGroup heading="Categories">
                {options.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={opt.label}
                    onSelect={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === opt.value ? 'opacity-100' : 'opacity-0')} />
                    {opt.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !farmId) {
      toast.error('Farm context is required.');
      return;
    }

    if (editingExpense) {
      const r = rows[0];
      if (!r) {
        toast.error('Nothing to save.');
        return;
      }
      const amt = Number(r.amount);
      if (!r.description.trim() || !Number.isFinite(amt) || amt <= 0) {
        toast.error('Enter a valid description and amount.');
        return;
      }
      if (!r.category.trim()) {
        toast.error('Category is required.');
        return;
      }
      const dateForSave = editExpenseDate ?? toDate(editingExpense.date);
      if (!dateForSave) {
        toast.error('Pick an expense date.');
        return;
      }
      setSaving(true);
      try {
        await ExpenseService.update(editingExpense.id, {
          companyId: editingExpense.companyId,
          amount: amt,
          note: r.description.trim(),
          category: r.category.trim(),
          expenseDate: dateForSave.toISOString().slice(0, 10),
        });
        await onSaved?.();
        void queryClient.invalidateQueries({
          queryKey: ['financeExpenses', 'categories', companyId ?? 'none', farmId ?? 'all', projectId ?? 'all'],
        });
        toast.success('Expense updated.');
        onOpenChange(false);
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : 'Could not update expense.');
      } finally {
        setSaving(false);
      }
      return;
    }

    const cleaned = rows
      .map((r, idx) => ({ ...r, idx }))
      .filter((r) => r.description.trim() || r.amount.trim() || r.category.trim());

    if (cleaned.length === 0) {
      toast.error('Add at least one expense.');
      return;
    }

    for (const r of cleaned) {
      const amt = Number(r.amount);
      if (!r.description.trim() || !Number.isFinite(amt) || amt <= 0) {
        toast.error(`Row ${r.idx + 1}: enter a valid description and amount.`);
        return;
      }
      if (!r.category.trim()) {
        toast.error(`Row ${r.idx + 1}: category is required.`);
        return;
      }
    }

    setSaving(true);
    try {
      for (const r of cleaned) {
        await ExpenseService.create({
          companyId,
          farmId,
          projectId,
          category: r.category.trim(),
          amount: Number(r.amount),
          note: r.description.trim(),
          createdBy,
        });
      }
      await onSaved?.();
      void queryClient.invalidateQueries({
        queryKey: ['financeExpenses', 'categories', companyId ?? 'none', farmId ?? 'all', projectId ?? 'all'],
      });
      toast.success(cleaned.length === 1 ? 'Expense added.' : `Saved ${cleaned.length} expenses.`);
      const inventoryCandidates: ExpenseSavedInventoryCandidate[] = cleaned
        .filter((r) => shouldPromptAddInventoryAfterExpense(r.category))
        .map((r) => ({
          description: r.description.trim(),
          amount: Number(r.amount),
          category: r.category.trim(),
        }));
      if (inventoryCandidates.length && onSavedWithInventoryCandidates) {
        onSavedWithInventoryCandidates(inventoryCandidates);
      }
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
          <DialogTitle>{editingExpense ? 'Edit expense' : 'Add Expense'}</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSave}>
          <div className="space-y-3">
            {rows.map((row, idx) => (
              <div key={row.id} className="rounded-xl border border-border/60 bg-background/50 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-muted-foreground">Expense {idx + 1}</div>
                  {!editingExpense && rows.length > 1 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 rounded-lg"
                      onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                      disabled={saving}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium">Description</label>
                    <Input
                      className="mt-1"
                      value={row.description}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, description: e.target.value } : r)),
                        )
                      }
                      required={idx === 0}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Category</label>
                    <CategoryCombobox
                      value={row.category}
                      options={categoryOptions}
                      disabled={saving}
                      onChange={(next) => {
                        const trimmed = next.trim();
                        if (trimmed) {
                          addCustomExpenseCategory(companyId, trimmed);
                        }
                        setRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, category: next } : r)),
                        );
                      }}
                    />
                  </div>
                </div>

                {editingExpense ? (
                  <div>
                    <span className="text-sm font-medium">Date</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-1 w-full justify-start text-left font-normal rounded-xl"
                          disabled={saving}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 opacity-60 shrink-0" />
                          {formatDate(
                            editExpenseDate ?? toDate(editingExpense.date) ?? new Date(),
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={editExpenseDate ?? toDate(editingExpense.date) ?? undefined}
                          onSelect={(d) => d && setEditExpenseDate(d)}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                ) : null}

                <div>
                  <label className="text-sm font-medium">Amount (KES)</label>
                  <Input
                    className="mt-1"
                    type="number"
                    min={0}
                    value={row.amount}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, amount: e.target.value } : r)),
                      )
                    }
                    required={idx === 0}
                  />
                </div>
              </div>
            ))}
          </div>

          {!editingExpense ? (
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-xl"
                onClick={() => setRows((prev) => [...prev, newRow()])}
                disabled={saving}
              >
                Add another expense
              </Button>
            </div>
          ) : null}

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
            <Button type="submit" className="rounded-xl" disabled={saving}>
              {saving
                ? 'Saving…'
                : editingExpense
                  ? 'Save changes'
                  : rows.length > 1
                    ? 'Save Expenses'
                    : 'Save Expense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

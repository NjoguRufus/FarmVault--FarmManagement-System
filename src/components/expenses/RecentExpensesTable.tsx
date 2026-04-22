import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Banknote,
  Box,
  FlaskConical,
  Fuel,
  Grid3x3,
  Link2,
  MoreHorizontal,
  Receipt,
  Shield,
  Sprout,
  Users,
  Wrench,
} from 'lucide-react';
import { toDate, formatDate } from '@/lib/dateUtils';
import { TOMATO_HARVEST_PICKER_LABOUR_EXPENSE_SOURCE } from '@/services/financeExpenseService';
import type { Expense } from '@/types';
import { cn } from '@/lib/utils';

type ExpenseWithSyncState = Expense & {
  pending?: boolean;
  fromCache?: boolean;
  createdAt?: string;
};

export type PickerGroupTableRow = {
  type: 'picker_group';
  key: string;
  collectionId: string;
  displayName: string;
  totalAmount: number;
  latestDate: Date;
  expenses: ExpenseWithSyncState[];
};

export type RecentExpenseTableRow =
  | {
      type: 'harvest_payout';
      key: string;
      collectionId: string;
      collectionName: string;
      totalPaid: number;
      harvestDate: unknown;
    }
  | PickerGroupTableRow
  | { type: 'expense'; key: string; expense: ExpenseWithSyncState };

/** When there are more rows than this, the table body scrolls vertically with a max height ~5 rows. */
const RECENT_EXPENSES_SCROLL_AFTER = 5;

/** Icon per category; align with `getCategoryColor` on `ExpensesPage` plus broker categories. */
function getExpenseCategoryIcon(category: string): LucideIcon {
  const c = String(category || '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');
  if (c === 'labour' || c === 'labor' || c === 'picker_payout') return Users;
  if (c === 'fertilizer' || c === 'fertiliser') return Sprout;
  if (c === 'tools' || c === 'tool' || c === 'equipment' || c === 'machinery') return Wrench;
  if (c === 'chemical' || c === 'chemicals' || c === 'pesticide') return FlaskConical;
  if (c === 'fuel') return Fuel;
  if (c === 'space') return Grid3x3;
  if (c === 'watchman') return Shield;
  if (c === 'ropes') return Link2;
  if (c === 'carton') return Box;
  if (c === 'offloading_labour') return ArrowDownToLine;
  if (c === 'onloading_labour') return ArrowUpToLine;
  if (c === 'broker_payment') return Banknote;
  if (c === 'other') return MoreHorizontal;
  return Receipt;
}

/** Text color only, matched to badge palette on the expenses page. */
function getExpenseCategoryIconClass(category: string): string {
  const c = String(category || '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');
  if (c === 'labour' || c === 'labor' || c === 'picker_payout' || c === 'offloading_labour' || c === 'onloading_labour') {
    return 'text-fv-success';
  }
  if (c === 'fertilizer' || c === 'fertiliser') return 'text-fv-olive';
  if (c === 'tools' || c === 'tool' || c === 'equipment' || c === 'machinery') return 'text-primary';
  if (c === 'chemical' || c === 'chemicals' || c === 'pesticide') return 'text-fv-warning';
  if (c === 'fuel') return 'text-fv-info';
  if (c === 'broker_payment') return 'text-fv-info';
  if (c === 'other') return 'text-muted-foreground';
  if (c === 'space' || c === 'watchman' || c === 'ropes' || c === 'carton') return 'text-muted-foreground';
  return 'text-muted-foreground';
}

function ExpenseCategoryGlyph({ categoryKey }: { categoryKey: string }) {
  const Icon = getExpenseCategoryIcon(categoryKey);
  return (
    <span className="mt-0.5 inline-flex shrink-0" aria-hidden>
      <Icon className={cn('h-3.5 w-3.5', getExpenseCategoryIconClass(categoryKey))} strokeWidth={2} />
    </span>
  );
}

export interface RecentExpensesTableProps {
  rows: RecentExpenseTableRow[];
  isLoading: boolean;
  collectionNameMap: Map<string, string>;
  formatCurrency: (n: number) => string;
  getCategoryColor: (category: string) => string;
  onHarvestPayoutClick: (collectionId: string) => void;
  onPickerGroupClick: (group: {
    collectionId: string;
    displayName: string;
    totalAmount: number;
    latestDate: Date;
    expenses: ExpenseWithSyncState[];
  }) => void;
  onExpenseOpen: (expense: ExpenseWithSyncState) => void;
  onLaborPayoutOpen: (collectionId: string) => void;
}

/**
 * List layout aligned with `InventoryTable` ListView: same card shell, thead, zebra rows, and cell rhythm.
 */
export function RecentExpensesTable({
  rows,
  isLoading,
  collectionNameMap,
  formatCurrency,
  getCategoryColor,
  onHarvestPayoutClick,
  onPickerGroupClick,
  onExpenseOpen,
  onLaborPayoutOpen,
}: RecentExpensesTableProps) {
  const useBodyScroll = rows.length > RECENT_EXPENSES_SCROLL_AFTER;

  if (isLoading) {
    return (
      <div className="w-full rounded-xl border border-border/50 bg-card p-8 text-center text-sm text-muted-foreground">
        Loading expenses…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="w-full space-y-3 rounded-xl border border-border/50 bg-card p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
          <Receipt className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-base font-medium text-foreground">No recent expenses</p>
        <p className="text-sm text-muted-foreground">Expenses you add or sync will show up here.</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border/50 bg-card">
      <div className="overflow-x-auto">
        <div
          className={cn(
            useBodyScroll &&
              'max-h-[16.5rem] sm:max-h-[18.5rem] overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]',
          )}
        >
          <table className="w-full">
            <thead className="sticky top-0 z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
              <tr className="border-b border-border bg-muted text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="min-w-[200px] bg-muted px-3 py-2.5 text-left sm:min-w-[240px]">Description</th>
                <th className="min-w-[100px] bg-muted whitespace-nowrap px-3 py-2.5 text-center">Amount</th>
                <th className="min-w-[90px] bg-muted whitespace-nowrap px-3 py-2.5 text-left">Category</th>
                <th className="min-w-[100px] bg-muted whitespace-nowrap px-3 py-2.5 text-left">Date</th>
              </tr>
            </thead>
            <tbody>
            {rows.map((row, index) => {
              const isEven = index % 2 === 0;
              const rowBg = isEven ? 'bg-background' : 'bg-muted/20';
              if (row.type === 'harvest_payout') {
                const payoutDate = row.harvestDate ? toDate(row.harvestDate) : null;
                return (
                  <tr
                    key={row.key}
                    className={`${rowBg} cursor-pointer border-b border-border/40 transition-colors last:border-b-0 hover:bg-primary/5`}
                    onClick={() => onHarvestPayoutClick(row.collectionId)}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex min-w-0 items-start gap-2">
                        <ExpenseCategoryGlyph categoryKey="labour" />
                        <div className="min-w-0 flex-1">
                          <p className="whitespace-nowrap text-sm font-medium leading-tight text-foreground">Picker Payout</p>
                          <p className="whitespace-nowrap text-[11px] leading-tight text-muted-foreground">
                            {row.collectionName}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <p className="text-sm font-medium tabular-nums text-foreground">{formatCurrency(row.totalPaid)}</p>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={cn('fv-badge', getCategoryColor('labour'))}>labour</span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {payoutDate ? formatDate(payoutDate) : '—'}
                    </td>
                  </tr>
                );
              }
              if (row.type === 'picker_group') {
                return (
                  <tr
                    key={row.key}
                    className={`${rowBg} cursor-pointer border-b border-border/40 transition-colors last:border-b-0 hover:bg-primary/5`}
                    onClick={() =>
                      onPickerGroupClick({
                        collectionId: row.collectionId,
                        displayName: row.displayName,
                        totalAmount: row.totalAmount,
                        latestDate: row.latestDate,
                        expenses: row.expenses,
                      })
                    }
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex min-w-0 items-start gap-2">
                        <ExpenseCategoryGlyph categoryKey="labour" />
                        <p className="min-w-0 flex-1 break-words text-sm font-medium leading-tight text-foreground">
                          {row.displayName}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <p className="text-sm font-medium tabular-nums text-foreground">{formatCurrency(row.totalAmount)}</p>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={cn('fv-badge', getCategoryColor('labour'))}>labour</span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {formatDate(row.latestDate)}
                    </td>
                  </tr>
                );
              }
              const expense = row.expense;
              const isPickerPayout = expense.meta?.source === 'harvest_wallet_picker_payment';
              const collectionId = expense.meta?.harvestCollectionId;
              const collectionLabel = collectionId ? collectionNameMap.get(collectionId) : null;
              const isTomatoPickerLabour =
                expense.meta?.source === TOMATO_HARVEST_PICKER_LABOUR_EXPENSE_SOURCE &&
                Boolean(expense.meta?.tomatoHarvestSessionId);
              const tomatoLabourNote = expense.meta?.harvestPickerLabourNote;
              const categoryForIcon =
                expense.category === 'picker_payout' ? 'labour' : String(expense.category ?? 'other');
              return (
                <tr
                  key={row.key}
                  className={`${rowBg} cursor-pointer border-b border-border/40 transition-colors last:border-b-0 hover:bg-primary/5`}
                  onClick={
                    isPickerPayout && collectionId
                      ? () => onLaborPayoutOpen(collectionId)
                      : () => onExpenseOpen(expense)
                  }
                >
                  <td className="px-3 py-2.5">
                    <div className="flex min-w-0 items-start gap-2">
                      <ExpenseCategoryGlyph categoryKey={categoryForIcon} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="min-w-0 break-words text-sm font-medium leading-tight text-foreground">
                            {expense.description}
                          </p>
                          {isTomatoPickerLabour && (
                            <span className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-800 dark:border-sky-700 dark:bg-sky-950/60 dark:text-sky-100">
                              Auto-generated
                            </span>
                          )}
                          {expense.pending && (
                            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                              Syncing...
                            </span>
                          )}
                        </div>
                        {isTomatoPickerLabour && tomatoLabourNote ? (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{tomatoLabourNote}</p>
                        ) : null}
                        {isPickerPayout && collectionLabel && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">Collection: {collectionLabel}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <p className="text-sm font-medium tabular-nums text-foreground">{formatCurrency(expense.amount)}</p>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span
                      className={cn(
                        'fv-badge',
                        getCategoryColor(
                          (expense.category === 'picker_payout' ? 'labour' : String(expense.category)) as string,
                        ),
                      )}
                    >
                      {expense.category === 'picker_payout' ? 'labour' : String(expense.category)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-muted-foreground whitespace-nowrap">
                    {formatDate(expense.date)}
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

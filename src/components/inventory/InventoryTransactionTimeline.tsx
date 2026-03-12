import React from 'react';
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import type { InventoryTransactionRow } from '@/services/inventoryReadModelService';
import { formatDate } from '@/lib/dateUtils';

interface InventoryTransactionTimelineProps {
  transactions: InventoryTransactionRow[];
  isLoading?: boolean;
}

const formatCurrency = (amount: number | null | undefined) =>
  amount != null ? `KES ${amount.toLocaleString()}` : '—';

export function InventoryTransactionTimeline({
  transactions,
  isLoading,
}: InventoryTransactionTimelineProps) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading transaction history…</p>;
  }

  if (!transactions.length) {
    return <p className="text-sm text-muted-foreground">No transactions recorded yet.</p>;
  }

  return (
    <div className="space-y-3">
      {transactions.map((tx) => {
        const isIn = (tx.transaction_type ?? '').toLowerCase().includes('in');
        const Icon = isIn ? ArrowDownCircle : ArrowUpCircle;
        const quantityLabel = `${tx.quantity.toLocaleString()} units`;

        return (
          <div key={tx.id} className="flex gap-3">
            <div className="mt-1">
              <Icon
                className={`h-4 w-4 ${
                  isIn ? 'text-emerald-500' : 'text-destructive'
                }`}
              />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {tx.transaction_type ?? (isIn ? 'Stock In' : 'Stock Out')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(tx.occurred_at)} • {quantityLabel}
                    {tx.balance_after != null &&
                      ` • Balance: ${tx.balance_after.toLocaleString()}`}
                  </p>
                </div>
                <div className="text-right">
                  {tx.total_cost != null && (
                    <p className="text-sm font-semibold">
                      {formatCurrency(tx.total_cost)}
                    </p>
                  )}
                  {tx.unit_cost != null && (
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(tx.unit_cost)}/unit
                    </p>
                  )}
                </div>
              </div>
              {(tx.notes || tx.reference || tx.created_by_name) && (
                <p className="text-xs text-muted-foreground">
                  {tx.reference && <span className="font-medium">{tx.reference}</span>}
                  {tx.reference && (tx.notes || tx.created_by_name) ? ' • ' : ''}
                  {tx.notes}
                  {tx.created_by_name && (
                    <>
                      {' '}
                      • by <span className="font-medium">{tx.created_by_name}</span>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}


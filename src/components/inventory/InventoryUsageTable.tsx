import React from 'react';
import type { InventoryUsageRow } from '@/services/inventoryReadModelService';
import { formatDate } from '@/lib/dateUtils';

interface InventoryUsageTableProps {
  usage: InventoryUsageRow[];
  isLoading?: boolean;
}

export function InventoryUsageTable({ usage, isLoading }: InventoryUsageTableProps) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading usage history…</p>;
  }

  if (!usage.length) {
    return <p className="text-sm text-muted-foreground">No usage recorded yet.</p>;
  }

  return (
    <div className="overflow-x-auto select-text">
      <table className="fv-table min-w-full">
        <thead>
          <tr>
            <th className="text-left">Date</th>
            <th className="text-left hidden md:table-cell">Project</th>
            <th className="text-left hidden lg:table-cell">Stage</th>
            <th className="text-right">Quantity</th>
            <th className="text-left">Purpose</th>
          </tr>
        </thead>
        <tbody>
          {usage.map((row) => (
            <tr key={row.id}>
              <td className="text-sm text-foreground">
                {formatDate(row.used_on)}
              </td>
              <td className="text-sm hidden md:table-cell">
                {row.project_name ?? '—'}
              </td>
              <td className="text-sm hidden lg:table-cell">
                {row.crop_stage ?? '—'}
              </td>
              <td className="text-right text-sm font-medium whitespace-nowrap">
                {row.quantity.toLocaleString()} {row.unit}
              </td>
              <td className="text-sm text-foreground">
                {row.purpose || row.notes || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


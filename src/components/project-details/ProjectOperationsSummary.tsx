import React from 'react';
import { Users, Package, Wallet, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ProjectOperationsSummaryProps {
  workLogCount: number;
  totalPeopleDays: number;
  derivedLabourCost: number;
  inventoryUsageByItem: Record<string, { quantity: number; unit: string; category: string }>;
  expensesByCategory: Record<string, number>;
  openChallengesCount: number;
  formatCurrency: (amount: number) => string;
  onViewWorkLogs: () => void;
  onViewInventory: () => void;
  onViewExpenses: () => void;
  onViewChallenges: () => void;
  workLogsByCategory?: Record<string, number>;
}

const SUMMARY_ITEMS = [
  {
    key: 'workLogs',
    label: 'Work Logs',
    icon: Users,
    getValue: (p: ProjectOperationsSummaryProps) =>
      `${p.workLogCount} logs · ${p.totalPeopleDays} people-days · ${p.formatCurrency(p.derivedLabourCost)}`,
  },
  {
    key: 'inventory',
    label: 'Inventory Used',
    icon: Package,
    getValue: (p: ProjectOperationsSummaryProps) => {
      const n = Object.keys(p.inventoryUsageByItem).length;
      return `${n} item(s)`;
    },
  },
  {
    key: 'expenses',
    label: 'Expenses Summary',
    icon: Wallet,
    getValue: (p: ProjectOperationsSummaryProps) =>
      p.formatCurrency(Object.values(p.expensesByCategory).reduce((a, b) => a + b, 0)),
  },
  {
    key: 'challenges',
    label: 'Open Challenges',
    icon: ListChecks,
    getValue: (p: ProjectOperationsSummaryProps) => `${p.openChallengesCount}`,
  },
] as const;

export function ProjectOperationsSummary(props: ProjectOperationsSummaryProps) {
  const {
    onViewWorkLogs,
    onViewInventory,
    onViewExpenses,
    onViewChallenges,
  } = props;

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Operations Summary
        </h3>
      </div>

      <div className="divide-y divide-border/50">
        {SUMMARY_ITEMS.map((item, i) => {
          const Icon = item.icon;
          return (
            <div
              key={item.key}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="flex items-center gap-2 text-sm min-w-0">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium text-foreground">{item.label}</span>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium text-foreground tabular-nums">
                  {item.getValue(props)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 p-4 border-t border-border/60 bg-muted/20">
        <Button variant="outline" size="sm" onClick={onViewWorkLogs}>
          View Work Logs
        </Button>
        <Button variant="outline" size="sm" onClick={onViewInventory}>
          View Inventory
        </Button>
        <Button variant="outline" size="sm" onClick={onViewExpenses}>
          View Expenses
        </Button>
        <Button variant="outline" size="sm" onClick={onViewChallenges}>
          View Challenges
        </Button>
      </div>
    </div>
  );
}

import React from 'react';
import { Calendar, FileText, Wallet, Package, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ProjectQuickActionsProps {
  onPlanSeason: () => void;
  onViewWorkLogs: () => void;
  onViewExpenses: () => void;
  onViewInventory: () => void;
  onAddChallenge: () => void;
  showPlanSeason?: boolean;
  showAddChallenge?: boolean;
}

export function ProjectQuickActions({
  onPlanSeason,
  onViewWorkLogs,
  onViewExpenses,
  onViewInventory,
  onAddChallenge,
  showPlanSeason = true,
  showAddChallenge = true,
}: ProjectQuickActionsProps) {
  const actions = [
    ...(showPlanSeason
      ? [{ label: 'Plan Season', icon: Calendar, onClick: onPlanSeason }]
      : []),
    { label: 'View Work Logs', icon: FileText, onClick: onViewWorkLogs },
    { label: 'View Expenses', icon: Wallet, onClick: onViewExpenses },
    { label: 'View Inventory Usage', icon: Package, onClick: onViewInventory },
    ...(showAddChallenge
      ? [{ label: 'Add Challenge', icon: ListChecks, onClick: onAddChallenge }]
      : []),
  ];

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Quick Actions
      </h3>
      <div className="flex flex-col gap-2">
        {actions.map(({ label, icon: Icon, onClick }) => (
          <Button
            key={label}
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={onClick}
          >
            <Icon className="h-4 w-4 mr-2 shrink-0" />
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

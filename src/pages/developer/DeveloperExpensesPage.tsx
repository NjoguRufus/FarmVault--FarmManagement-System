import React from 'react';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';

// Phase 1: scaffold UI shell. Detailed FarmVault expense breakdown can be wired
// to a dedicated Supabase view or Firestore export in a later phase.

export default function DeveloperExpensesPage() {
  return (
    <DeveloperPageShell
      title="FarmVault Expenses"
      description="Internal FarmVault expense tracking and instrumentation (scaffolded for Phase 1)."
      isLoading={false}
      isRefetching={false}
      onRefresh={undefined}
    >
      <div className="fv-card text-sm text-muted-foreground">
        This view is scaffolded for Phase 1. Once a canonical expense data source is defined
        (e.g. Supabase `billing.farmvault_expenses` view), we can surface a searchable, filterable
        table of internal costs here.
      </div>
    </DeveloperPageShell>
  );
}


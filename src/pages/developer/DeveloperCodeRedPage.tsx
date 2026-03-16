import React from 'react';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import AdminCodeRedPage from '@/pages/admin/AdminCodeRedPage';

export default function DeveloperCodeRedPage() {
  return (
    <DeveloperPageShell
      title="Code Red"
      description="High-risk operations and incident tooling for FarmVault operators."
      isLoading={false}
      isRefetching={false}
      onRefresh={undefined}
    >
      <div className="space-y-4">
        <div className="fv-card text-xs text-muted-foreground">
          This page reuses the existing admin Code Red tooling, surfaced under the new
          `/developer/code-red` workspace.
        </div>
        <AdminCodeRedPage />
      </div>
    </DeveloperPageShell>
  );
}


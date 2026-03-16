import React from 'react';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import AdminAuditLogsPage from '@/pages/admin/AdminAuditLogsPage';

export default function DeveloperAuditLogsPage() {
  return (
    <DeveloperPageShell
      title="Audit Logs"
      description="System-wide audit trail for sensitive developer and admin operations."
      isLoading={false}
      isRefetching={false}
      onRefresh={undefined}
    >
      <div className="space-y-4">
        <div className="fv-card text-xs text-muted-foreground">
          This page reuses the existing admin audit logs UI, surfaced under the canonical
          `/developer/audit-logs` route.
        </div>
        <AdminAuditLogsPage />
      </div>
    </DeveloperPageShell>
  );
}


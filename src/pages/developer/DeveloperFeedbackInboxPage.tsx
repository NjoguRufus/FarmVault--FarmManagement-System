import React from 'react';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import AdminFeedbackPage from '@/pages/admin/AdminFeedbackPage';

export default function DeveloperFeedbackInboxPage() {
  return (
    <DeveloperPageShell
      title="Feedback Inbox"
      description="Central inbox for all customer feedback across tenants."
      isLoading={false}
      isRefetching={false}
      onRefresh={undefined}
    >
      <div className="space-y-4">
        <div className="fv-card text-xs text-muted-foreground">
          This page wraps the existing admin feedback UI so developer tooling is consistently
          available under `/developer/feedback-inbox`.
        </div>
        <AdminFeedbackPage />
      </div>
    </DeveloperPageShell>
  );
}


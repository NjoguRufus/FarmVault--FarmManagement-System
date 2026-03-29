import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyStateBlock } from './EmptyStateBlock';

type Props = {
  companyId: string;
};

/**
 * Global audit logs are not yet filtered by tenant in-app.
 * Developers can open the full audit console; per-company filtering can be wired when the RPC supports it.
 */
export function CompanyAuditLogsTab({ companyId }: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Company-scoped audit</p>
        <p className="mt-2 leading-relaxed">
          Sensitive platform audit entries (developer actions, billing approvals, etc.) live in the global audit log.
          Tenant-filtered audit for company <span className="font-mono text-xs text-foreground">{companyId}</span> can be
          connected when a gated RPC or filtered query is available.
        </p>
      </div>
      <EmptyStateBlock
        title="Open global audit logs"
        description="Review cross-tenant audit events from the developer console."
        className="py-8"
      />
      <Button variant="outline" size="sm" className="gap-2" asChild>
        <Link to="/developer/audit-logs">
          <ExternalLink className="h-4 w-4" />
          Go to Audit Logs
        </Link>
      </Button>
    </div>
  );
}

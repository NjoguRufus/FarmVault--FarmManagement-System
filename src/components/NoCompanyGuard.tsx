import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompanyScope, NO_COMPANY, TENANT_SYNC_REQUIRED } from '@/hooks/useCompanyScope';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * When the current user has no company (error === NO_COMPANY), show a "Finish setup" message
 * and optional CTA. Use on pages that require company-scoped data.
 */
export function NoCompanyGuard({
  children,
  showMessage = true,
}: {
  children: React.ReactNode;
  showMessage?: boolean;
}) {
  const scope = useCompanyScope();
  const navigate = useNavigate();
  const { syncTenantCompanyFromServer, refreshAuthState } = useAuth();
  const [busy, setBusy] = React.useState(false);

  if (scope.error !== NO_COMPANY && scope.error !== TENANT_SYNC_REQUIRED) {
    return <>{children}</>;
  }

  if (scope.error === TENANT_SYNC_REQUIRED) {
    if (!showMessage) return null;
    return (
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="p-6 text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            We need to confirm your workspace with the server before loading this data.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="default"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void (async () => {
                  try {
                    await syncTenantCompanyFromServer();
                    await refreshAuthState();
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              {busy ? 'Syncing…' : 'Sync workspace'}
            </Button>
            <Button variant="outline" onClick={() => navigate('/home', { replace: true })}>
              Open dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!showMessage) {
    return null;
  }

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="p-6 text-center">
        <p className="text-sm text-muted-foreground mb-4">
          Your account is not linked to a company. Finish setup to use this page.
        </p>
        <Button
          variant="default"
          onClick={() => navigate('/setup-company', { replace: true })}
        >
          Finish setup
        </Button>
      </CardContent>
    </Card>
  );
}

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompanyScope, NO_COMPANY } from '@/hooks/useCompanyScope';
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

  if (scope.error !== NO_COMPANY) {
    return <>{children}</>;
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

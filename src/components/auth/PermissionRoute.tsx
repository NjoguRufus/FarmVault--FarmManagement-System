import React from 'react';
import type { PermissionModule } from '@/types';
import { usePermissions } from '@/hooks/usePermissions';
import AccessRestrictedPage from '@/pages/AccessRestrictedPage';

interface PermissionRouteProps {
  module: PermissionModule;
  actionPath?: string;
  children: React.ReactElement;
}

export function PermissionRoute({ module, actionPath, children }: PermissionRouteProps) {
  const { can, isDeveloper, isCompanyAdmin } = usePermissions();

  if (isDeveloper || isCompanyAdmin) {
    return children;
  }

  const allowed = can(module, actionPath || 'view');

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[Route Guard] permission check', {
      module,
      action: actionPath || 'view',
      allowed,
    });
  }

  if (!allowed) {
    return <AccessRestrictedPage />;
  }

  return children;
}


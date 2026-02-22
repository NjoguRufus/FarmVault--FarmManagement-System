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

  if (!can(module, actionPath || 'view')) {
    return <AccessRestrictedPage />;
  }

  return children;
}


import React from 'react';
import type { PermissionModule } from '@/types';
import { usePermissions } from '@/hooks/usePermissions';
import AccessRestrictedPage from '@/pages/AccessRestrictedPage';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { resolveStaffShellEntryOrHome } from '@/lib/access/effectiveAccess';

interface PermissionRouteProps {
  module: PermissionModule;
  actionPath?: string;
  children: React.ReactElement;
}

export function PermissionRoute({ module, actionPath, children }: PermissionRouteProps) {
  const { can, isDeveloper, isCompanyAdmin } = usePermissions();
  const { user, effectiveAccess } = useAuth();

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
    // Staff isolation: staff users should never land on restricted admin pages; redirect them back into /staff.
    if (user?.role === 'employee') {
      return <Navigate to={resolveStaffShellEntryOrHome(effectiveAccess.landingPage)} replace />;
    }
    return <AccessRestrictedPage />;
  }

  return children;
}


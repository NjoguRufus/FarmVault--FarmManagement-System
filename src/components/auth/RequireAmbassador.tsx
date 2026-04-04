import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardRoles } from '@/hooks/useDashboardRoles';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';

interface RequireAmbassadorProps {
  children: React.ReactNode;
}

/**
 * Route guard for ambassador-only pages inside /ambassador/console/*.
 *
 * Resolution order (fastest to slowest):
 *   1. authReady=false → null (AmbassadorLayout already shows nothing)
 *   2. profileUserType='ambassador'|'both' → allow immediately (set before authReady=true)
 *   3. rolesLoading=true → spinner (DB capabilities RPC in flight)
 *   4. hasAmbassador=false → redirect to / (definitively not an ambassador)
 */
export function RequireAmbassador({ children }: RequireAmbassadorProps) {
  const { authReady, user } = useAuth();
  const { hasAmbassador, loading: rolesLoading } = useDashboardRoles();

  if (!authReady) return null;

  // Fast-path: profileUserType is stamped in core.profiles before authReady=true.
  // No DB round-trip needed — use it immediately to avoid any visible delay.
  const pt = user?.profileUserType;
  if (pt === 'ambassador' || pt === 'both') {
    return <>{children}</>;
  }

  // DB confirmation still in flight — show loading rather than flashing a redirect.
  if (rolesLoading) {
    return <AuthLoadingScreen message="Confirming ambassador access…" />;
  }

  // DB says not an ambassador → eject.
  if (!hasAmbassador) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useUser } from '@clerk/react';
import { useAuth } from '@/contexts/AuthContext';
import { useAmbassadorAccess } from '@/contexts/AmbassadorAccessContext';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';
import { hasAmbassadorRowForCurrentUser } from '@/services/ambassadorService';

interface RequireAmbassadorProps {
  children: React.ReactNode;
}

/**
 * Route guard for ambassador-only pages inside /ambassador/console/*.
 * Dual-role users (company + ambassador) must have workspace mode "ambassador" to enter the console.
 */
export function RequireAmbassador({ children }: RequireAmbassadorProps) {
  const { authReady, user } = useAuth();
  const { isLoaded: clerkLoaded } = useUser();
  const { workspaceMode } = useAmbassadorAccess();
  const [fallbackOk, setFallbackOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (!authReady || !user || !clerkLoaded) return;

    const pt = user.profileUserType;
    if (pt === 'ambassador' || pt === 'both') {
      return;
    }

    let cancelled = false;
    setFallbackOk(null);

    (async () => {
      try {
        const ok = await hasAmbassadorRowForCurrentUser();
        if (!cancelled) setFallbackOk(ok);
      } catch {
        if (!cancelled) setFallbackOk(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, user?.id, user?.profileUserType, clerkLoaded]);

  if (!authReady || !clerkLoaded) {
    return <AuthLoadingScreen message="Loading…" />;
  }

  if (!user) {
    return <Navigate to="/sign-in" replace />;
  }

  const pt = user.profileUserType;

  if (pt === 'ambassador') {
    return <>{children}</>;
  }

  if (pt === 'both') {
    if (workspaceMode === 'company') {
      return <Navigate to="/dashboard" replace />;
    }
    return <>{children}</>;
  }

  if (fallbackOk === null) {
    return <AuthLoadingScreen message="Confirming ambassador access…" />;
  }

  if (!fallbackOk) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

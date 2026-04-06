import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';
import { hasAmbassadorRowForCurrentUser } from '@/services/ambassadorService';

interface RequireAmbassadorProps {
  children: React.ReactNode;
}

/**
 * Route guard for ambassador-only pages inside /ambassador/console/*.
 * Uses profile user_type first; falls back to a single ambassador row check (no dashboard switcher RPC).
 */
export function RequireAmbassador({ children }: RequireAmbassadorProps) {
  const { authReady, user } = useAuth();
  const [fallbackOk, setFallbackOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (!authReady || !user) return;

    const pt = user.profileUserType;
    if (pt === 'ambassador' || pt === 'both') {
      setFallbackOk(true);
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
  }, [authReady, user?.id, user?.profileUserType]);

  if (!authReady) return null;

  if (!user) {
    return <Navigate to="/sign-in" replace />;
  }

  const pt = user.profileUserType;
  if (pt === 'ambassador' || pt === 'both') {
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

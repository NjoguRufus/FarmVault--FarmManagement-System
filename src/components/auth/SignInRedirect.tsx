import React, { useLayoutEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { persistIntendedRoute } from '@/lib/routing/postAuth';

/**
 * Redirect to sign-in while preserving the attempted URL (sessionStorage + Router state)
 * so post-auth can return here after OAuth or full reload.
 */
export function SignInRedirect() {
  const location = useLocation();
  useLayoutEffect(() => {
    persistIntendedRoute(`${location.pathname}${location.search}${location.hash}`);
  }, [location.pathname, location.search, location.hash]);

  return <Navigate to="/sign-in" replace state={{ from: location }} />;
}

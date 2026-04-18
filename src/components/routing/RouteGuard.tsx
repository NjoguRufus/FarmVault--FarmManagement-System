import React from 'react';
import { RequireBroker } from '@/components/auth/RequireBroker';
import { RequireNotBroker } from '@/components/auth/RequireNotBroker';

type RouteGuardMode = 'broker-only' | 'staff-farm';

/**
 * Role-based route wrapper: broker-only vs staff farm shell (non-broker).
 * Prefer this over scattering raw role checks in route trees.
 */
export function RouteGuard({
  mode,
  children,
  staffRedirectTo,
}: {
  mode: RouteGuardMode;
  children: React.ReactElement;
  /** When mode is staff-farm, where brokers are sent (default /broker). */
  staffRedirectTo?: string;
}) {
  if (mode === 'broker-only') {
    return <RequireBroker>{children}</RequireBroker>;
  }
  return <RequireNotBroker redirectTo={staffRedirectTo}>{children}</RequireNotBroker>;
}

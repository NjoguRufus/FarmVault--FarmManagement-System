/** Sales broker (market agent) — nav and route helpers. */

export function isSalesBrokerUser(user: { role?: string; employeeRole?: string } | null | undefined): boolean {
  if (!user) return false;
  const emp = String((user as { employeeRole?: string }).employeeRole ?? '').toLowerCase();
  return user.role === 'broker' || emp === 'sales-broker' || emp === 'broker';
}

/** Paths brokers may open while using the main app shell (sidebar + bottom nav). */
export function brokerMayAccessNavPath(path: string): boolean {
  const p = String(path).split('?')[0].replace(/\/+/g, '/') || '/';
  return (
    p === '/broker' ||
    p.startsWith('/broker/') ||
    p === '/settings' ||
    p.startsWith('/settings/') ||
    p === '/support' ||
    p.startsWith('/support/') ||
    p === '/feedback' ||
    p.startsWith('/feedback/') ||
    p === '/profile'
  );
}

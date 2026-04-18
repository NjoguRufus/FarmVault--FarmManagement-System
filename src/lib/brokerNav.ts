/** Sales broker (market agent) — nav and route helpers. */

export function isSalesBrokerUser(user: { role?: string; employeeRole?: string } | null | undefined): boolean {
  if (!user) return false;
  const emp = String((user as { employeeRole?: string }).employeeRole ?? '').toLowerCase();
  return user.role === 'broker' || emp === 'sales-broker' || emp === 'broker';
}

export function brokerMayAccessNavPath(path: string): boolean {
  const p = path.replace(/\/+/g, '/');
  return p === '/broker' || p.startsWith('/broker/') || p === '/feedback';
}

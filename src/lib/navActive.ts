/** Normalize path + optional query for nav `to` values (e.g. `/broker?tab=markets`). */
export function normalizeNavTarget(path: string): string {
  const [rawPath, query] = path.split('?');
  const p = (rawPath || '/').replace(/\/+/g, '/') || '/';
  return query ? `${p}?${query}` : p;
}

/**
 * Active state for sidebar / bottom links; optional `?query` on `itemPath` must match `location.search`.
 */
export function isNavItemActive(pathname: string, search: string, itemPath: string): boolean {
  const item = normalizeNavTarget(itemPath);
  const [itemBase, itemQuery] = item.split('?');
  const pathNorm = pathname.replace(/\/+/g, '/') || '/';

  const pathMatches =
    pathNorm === itemBase ||
    (itemBase !== '/' && pathNorm.startsWith(`${itemBase}/`) && itemBase !== '/broker');
  if (!pathMatches) return false;

  if (!itemQuery) {
    return true;
  }

  const have = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const want = new URLSearchParams(itemQuery);
  for (const [k, v] of want.entries()) {
    if (have.get(k) !== v) return false;
  }
  return true;
}

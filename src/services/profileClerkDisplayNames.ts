/**
 * Resolve Clerk auth user ids to display names via core.profiles.
 */

import { db } from '@/lib/db';
import { resolveUserDisplayName } from '@/lib/userDisplayName';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export type FetchClerkDisplayNamesOptions = {
  /** When set, fills missing ids from `public.employees` (same company). */
  companyId?: string | null;
};

/** Batch-load display names for Clerk user ids (e.g. tomato_harvest_picker_logs.recorded_by). */
export async function fetchDisplayNamesByClerkUserIds(
  clerkUserIds: string[],
  options?: FetchClerkDisplayNamesOptions,
): Promise<Map<string, string>> {
  const unique = [...new Set(clerkUserIds.map((x) => String(x ?? '').trim()).filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  for (const part of chunk(unique, 40)) {
    const { data, error } = await db
      .core()
      .from('profiles')
      .select('clerk_user_id, full_name, email')
      .in('clerk_user_id', part);
    if (error) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[fetchDisplayNamesByClerkUserIds]', error);
      }
      continue;
    }
    for (const row of data ?? []) {
      const rid = String((row as { clerk_user_id?: string }).clerk_user_id ?? '').trim();
      if (!rid) continue;
      const display = resolveUserDisplayName({
        profileDisplayName: (row as { full_name?: string | null }).full_name,
        email: (row as { email?: string | null }).email,
      });
      map.set(rid, display);
    }
  }

  const companyId = options?.companyId?.trim();
  if (companyId) {
    const missing = unique.filter((id) => !map.has(id));
    for (const part of chunk(missing, 40)) {
      if (part.length === 0) continue;
      const { data, error } = await db
        .public()
        .from('employees')
        .select('clerk_user_id, full_name, name, email')
        .eq('company_id', companyId)
        .in('clerk_user_id', part);
      if (error) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[fetchDisplayNamesByClerkUserIds] employees', error);
        }
        continue;
      }
      for (const row of data ?? []) {
        const rid = String((row as { clerk_user_id?: string }).clerk_user_id ?? '').trim();
        if (!rid) continue;
        const r = row as { full_name?: string | null; name?: string | null; email?: string | null };
        const display = resolveUserDisplayName({
          profileDisplayName: r.full_name ?? r.name,
          email: r.email,
        });
        map.set(rid, display);
      }
    }
  }

  for (const id of unique) {
    if (!map.has(id)) {
      map.set(id, resolveUserDisplayName({}));
    }
  }
  return map;
}

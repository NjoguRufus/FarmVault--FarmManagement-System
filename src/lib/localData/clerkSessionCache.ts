/**
 * Caches Clerk user id, active company, and the Supabase JWT (template `supabase`)
 * for offline use after at least one successful online session in this install.
 * Tokens may expire: while offline, short-lived JWTs can fail server validation after TTL;
 * we still allow UI access; sync replays when a fresh token is available.
 */
import { getLocalDataDB } from '@/lib/localData/indexedDb';

const KEYS = {
  userId: 'clerk_user_id',
  companyId: 'active_company_id',
  token: 'supabase_jwt',
  tokenExp: 'supabase_jwt_exp_ms',
} as const;

const nowIso = () => new Date().toISOString();

export interface CachedClerkSession {
  userId: string;
  companyId: string | null;
  supabaseJwt: string;
  /** Best-effort expiry from JWT `exp` claim (ms since epoch). */
  expiresAtMs: number | null;
}

function parseJwtExpMs(jwt: string): number | null {
  try {
    const p = jwt.split('.')[1];
    if (!p) return null;
    const json = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')));
    const exp = json?.exp;
    if (typeof exp === 'number') return exp * 1000;
    return null;
  } catch {
    return null;
  }
}

export async function cacheClerkSessionForOffline(params: {
  userId: string;
  companyId: string | null;
  supabaseJwt: string;
}): Promise<void> {
  const db = getLocalDataDB();
  const exp = parseJwtExpMs(params.supabaseJwt);
  const pack = (key: string, value: string) =>
    db.session_cache.put({ key, value, updated_at: nowIso() });
  await pack(KEYS.userId, params.userId);
  if (params.companyId) await pack(KEYS.companyId, params.companyId);
  await pack(KEYS.token, params.supabaseJwt);
  if (exp) await pack(KEYS.tokenExp, String(exp));
}

export async function readCachedClerkSession(): Promise<CachedClerkSession | null> {
  const db = getLocalDataDB();
  const u = await db.session_cache.get(KEYS.userId);
  const t = await db.session_cache.get(KEYS.token);
  if (!u?.value || !t?.value) return null;
  const c = await db.session_cache.get(KEYS.companyId);
  const e = await db.session_cache.get(KEYS.tokenExp);
  return {
    userId: u.value,
    companyId: c?.value ?? null,
    supabaseJwt: t.value,
    expiresAtMs: e?.value != null ? Number(e.value) : null,
  };
}

export async function clearClerkSessionCache(): Promise<void> {
  const db = getLocalDataDB();
  await db.session_cache.clear();
}

/**
 * Store active workspace (company) for offline diagnostics and future claims in JWT.
 * Does not require a fresh Clerk token; safe to call whenever `user.companyId` is known.
 */
export async function cacheClerkCompanyId(companyId: string | null): Promise<void> {
  const db = getLocalDataDB();
  if (companyId) {
    await db.session_cache.put({ key: KEYS.companyId, value: companyId, updated_at: nowIso() });
  } else {
    await db.session_cache.delete(KEYS.companyId);
  }
}

/**
 * Token getter for Supabase when the live Clerk bridge is empty (e.g. offline, or first paint).
 */
export async function getOfflineAwareSupabaseToken(
  liveGetter: () => Promise<string | null>,
): Promise<string | null> {
  const t = await liveGetter();
  if (t) return t;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const c = await readCachedClerkSession();
    if (c?.supabaseJwt) {
      // May be past exp — Supabase/RLS will reject; new token when back online
      return c.supabaseJwt;
    }
  }
  return null;
}

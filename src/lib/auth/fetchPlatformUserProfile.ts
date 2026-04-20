import { db } from '@/lib/db';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** PostgREST / gateway hiccups where a short retry usually succeeds. */
function isTransientProfileLookupError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string; status?: number };
  const code = String(e.code ?? '');
  const msg = String(e.message ?? '').toLowerCase();
  if (code === 'PGRST002') return true;
  if (msg.includes('schema cache') || msg.includes('retrying')) return true;
  if (e.status === 503 || e.status === 502 || e.status === 504) return true;
  return false;
}

/** Shorter gaps for auth bootstrap (login must feel fast). */
const BACKOFF_FAST_MS = [40, 120, 280];
const BACKOFF_STANDARD_MS = [120, 300, 700];

export type AuthCoreProfileRow = {
  clerk_user_id: string;
  avatar_url: string | null;
  full_name: string | null;
  user_type: string | null;
};

function mapProfileRow(data: unknown): AuthCoreProfileRow | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.clerk_user_id == null || String(d.clerk_user_id).trim() === '') return null;
  const fn = d.full_name;
  const ut = d.user_type;
  return {
    clerk_user_id: String(d.clerk_user_id),
    avatar_url: d.avatar_url != null ? String(d.avatar_url) : null,
    full_name: fn != null && String(fn).trim().length > 0 ? String(fn).trim() : null,
    user_type: ut != null ? String(ut) : null,
  };
}

/**
 * Full `core.profiles` row needed for auth bootstrap (one round-trip instead of probe + later select).
 * Retries on PGRST002 / schema-cache errors only.
 */
export async function fetchBootstrapCoreProfile(
  clerkUserId: string,
  opts?: { backoff?: 'fast' | 'standard' },
): Promise<AuthCoreProfileRow | null> {
  const id = clerkUserId?.trim();
  if (!id) return null;

  const waitMs = opts?.backoff === 'standard' ? BACKOFF_STANDARD_MS : BACKOFF_FAST_MS;
  const maxAttempts = waitMs.length + 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await sleep(waitMs[attempt - 1]);

    const { data, error } = await db
      .core()
      .from('profiles')
      .select('clerk_user_id, avatar_url, full_name, user_type')
      .eq('clerk_user_id', id)
      .maybeSingle();

    if (!error) {
      return mapProfileRow(data);
    }

    lastError = error;
    if (!isTransientProfileLookupError(error)) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[fetchBootstrapCoreProfile] core.profiles lookup warning:', error);
      }
      return null;
    }
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn('[fetchBootstrapCoreProfile] core.profiles lookup failed after retries:', lastError);
  }
  return null;
}

/**
 * Minimal probe — prefer `fetchBootstrapCoreProfile` in hot paths to avoid duplicate selects.
 */
export async function fetchPlatformUserProfile(clerkUserId: string): Promise<{ clerk_user_id: string } | null> {
  const row = await fetchBootstrapCoreProfile(clerkUserId, { backoff: 'fast' });
  return row ? { clerk_user_id: row.clerk_user_id } : null;
}

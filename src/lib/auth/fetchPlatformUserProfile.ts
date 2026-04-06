import { db } from '@/lib/db';

/**
 * Returns a row when `core.profiles` exists for this Clerk user; otherwise null.
 * Auth bootstrap performs richer checks; this is the minimal “platform identity exists” probe.
 */
export async function fetchPlatformUserProfile(clerkUserId: string): Promise<{ clerk_user_id: string } | null> {
  const id = clerkUserId?.trim();
  if (!id) return null;
  const { data, error } = await db
    .core()
    .from('profiles')
    .select('clerk_user_id')
    .eq('clerk_user_id', id)
    .maybeSingle();
  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[fetchPlatformUserProfile] core.profiles lookup warning:', error);
    }
    return null;
  }
  if (!data?.clerk_user_id) return null;
  return { clerk_user_id: String(data.clerk_user_id) };
}

/**
 * Person display name (separate from farm/company name).
 *
 * DB: `core.profiles.full_name` is the persisted display name (same concept as profile.display_name).
 *
 * Fallback order (everywhere we render a person's name):
 * 1. profile display name (full_name)
 * 2. auth user metadata: full_name / fullName, then combined name / username
 * 3. email local part (before @)
 * 4. "Unnamed User"
 */

export const UNNAMED_USER_FALLBACK = 'Unnamed User';

export function emailLocalPart(email: string | null | undefined): string | null {
  const e = String(email ?? '').trim();
  const at = e.indexOf('@');
  if (at <= 0) return null;
  const local = e.slice(0, at).trim();
  return local.length > 0 ? local : null;
}

/** Clerk / OAuth-shaped user: maps to auth metadata full_name / name. */
export function clerkOAuthDisplayHints(
  authUser: {
    fullName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
  } | null | undefined,
): { oauthFullName: string | null; oauthName: string | null } {
  const full = String(authUser?.fullName ?? '').trim();
  if (full) return { oauthFullName: full, oauthName: null };
  const first = String(authUser?.firstName ?? '').trim();
  const last = String(authUser?.lastName ?? '').trim();
  const combined = [first, last].filter(Boolean).join(' ').trim();
  if (combined) return { oauthFullName: null, oauthName: combined };
  const u = String(authUser?.username ?? '').trim();
  if (u) return { oauthFullName: null, oauthName: u };
  return { oauthFullName: null, oauthName: null };
}

export type AuthUserNameHints = Parameters<typeof clerkOAuthDisplayHints>[0];

/** Convenience: profile row + session auth user + email (e.g. Clerk `useUser()` + profile). */
export function resolveUserDisplayNameFromSources(
  profileDisplayName: string | null | undefined,
  authUser: AuthUserNameHints,
  email: string | null | undefined,
): string {
  const { oauthFullName, oauthName } = clerkOAuthDisplayHints(authUser);
  return resolveUserDisplayName({
    profileDisplayName,
    oauthFullName,
    oauthName,
    email,
  });
}

/** Default to persist on `profiles.full_name` when empty (first Google / OAuth sign-in). */
export function seedFullNameFromClerk(authUser: AuthUserNameHints): string | null {
  const { oauthFullName, oauthName } = clerkOAuthDisplayHints(authUser);
  const s = (oauthFullName ?? oauthName ?? '').trim();
  return s.length > 0 ? s : null;
}

export function resolveUserDisplayName(input: {
  /** Persisted display name (`profiles.full_name`). */
  profileDisplayName?: string | null;
  /** Auth metadata full name (e.g. Clerk `user.fullName`). */
  oauthFullName?: string | null;
  /** Auth metadata name (e.g. first+last, or username). */
  oauthName?: string | null;
  email?: string | null;
}): string {
  const a = String(input.profileDisplayName ?? '').trim();
  if (a) return a;
  const b = String(input.oauthFullName ?? '').trim();
  if (b) return b;
  const c = String(input.oauthName ?? '').trim();
  if (c) return c;
  const local = emailLocalPart(input.email);
  if (local) return local;
  return UNNAMED_USER_FALLBACK;
}

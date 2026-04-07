import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Resolve Clerk user id from `Authorization: Bearer <jwt>`.
 * Matches create-company-onboarding: decode `sub` from JWT, with Supabase Auth fallback.
 */
export async function clerkUserIdFromAuth(
  authHeader: string | null,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<string | null> {
  if (!authHeader?.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length >= 2) {
      const payload = JSON.parse(atob(parts[1])) as { sub?: string };
      if (payload.sub && typeof payload.sub === "string") return payload.sub;
    }
  } catch {
    /* fall through */
  }
  try {
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser(token);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

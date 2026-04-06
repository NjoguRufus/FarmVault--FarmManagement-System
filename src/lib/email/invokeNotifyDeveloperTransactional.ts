const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseApiKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  '';

type TokenProvider = () => Promise<string | null>;

/**
 * Server-side developer alerts (manual payment submitted, payment approved, etc.).
 * Pass Clerk-issued Supabase JWT (template `supabase`); service-role callers use the Edge secret path only from backend.
 */
export async function invokeNotifyDeveloperTransactional(
  body: Record<string, unknown>,
  getToken?: TokenProvider,
): Promise<void> {
  const getter = getToken;
  if (!getter) return;
  const token = await getter();
  if (!token?.trim() || !supabaseUrl || !supabaseApiKey) return;

  const res = await fetch(
    `${supabaseUrl.replace(/\/$/, '')}/functions/v1/notify-developer-transactional`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token.trim()}`,
        apikey: supabaseApiKey,
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t.slice(0, 300) || `notify-developer-transactional HTTP ${res.status}`);
  }
}

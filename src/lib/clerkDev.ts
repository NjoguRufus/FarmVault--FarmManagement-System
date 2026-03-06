function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const rawAllowlist = import.meta.env.VITE_DEV_EMAIL_ALLOWLIST as string | undefined;
const ALLOWLIST = parseAllowlist(rawAllowlist);

export function getDevEmailAllowlist(): string[] {
  return ALLOWLIST;
}

export function isEmailAllowlisted(email: string | null | undefined): boolean {
  if (!email) return false;
  if (!ALLOWLIST.length) return false;
  return ALLOWLIST.includes(email.trim().toLowerCase());
}


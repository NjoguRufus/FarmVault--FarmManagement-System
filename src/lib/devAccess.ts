function parseDevEmailAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];

  return raw
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, '').toLowerCase())
    .filter(Boolean);
}

export function isDevEmail(email?: string | null): boolean {
  if (!email) return false;

  const allowlist = parseDevEmailAllowlist(import.meta.env.VITE_DEV_EMAIL_ALLOWLIST);
  if (!allowlist.length) return false;

  return allowlist.includes(email.trim().toLowerCase());
}


export function isDevEmail(email?: string | null): boolean {
  if (!email) return false;

  const allowlist =
    import.meta.env.VITE_DEV_EMAIL_ALLOWLIST
      ?.split(',')
      .map((e: string) => e.trim().toLowerCase()) || [];

  if (!allowlist.length) return false;

  return allowlist.includes(email.toLowerCase());
}


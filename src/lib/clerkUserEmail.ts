export function getClerkUserEmail(clerkUser: unknown): string | null {
  if (!clerkUser || typeof clerkUser !== 'object') {
    return null;
  }

  const user = clerkUser as Record<string, unknown>;
  const primaryEmail = typeof user?.primaryEmailAddress === 'object' && user.primaryEmailAddress !== null
    ? (user.primaryEmailAddress as Record<string, unknown>)['emailAddress']
    : undefined;
  if (typeof primaryEmail === 'string' && primaryEmail.trim().length > 0) {
    return primaryEmail.trim();
  }

  const directEmail = user.email;
  if (typeof directEmail === 'string' && directEmail.trim().length > 0) {
    return directEmail.trim();
  }

  const emailAddresses = user.emailAddresses;
  if (Array.isArray(emailAddresses)) {
    for (const entry of emailAddresses) {
      if (entry && typeof entry === 'object') {
        const emailAddress = (entry as Record<string, unknown>)['emailAddress'];
        if (typeof emailAddress === 'string' && emailAddress.trim().length > 0) {
          return emailAddress.trim();
        }
      }
    }
  }

  return null;
}

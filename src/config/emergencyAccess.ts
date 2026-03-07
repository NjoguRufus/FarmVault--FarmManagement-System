/**
 * Emergency Access feature flag and config.
 * To disable: set VITE_EMERGENCY_ACCESS=false in .env and rebuild.
 */

export function isEmergencyAccessEnabled(): boolean {
  return (
    import.meta.env.VITE_EMERGENCY_ACCESS === 'true' ||
    import.meta.env.VITE_EMERGENCY_ACCESS === '1'
  );
}

export function getEmergencyConfig(): {
  email: string;
  userId: string;
  companyId: string;
  role: string;
} | null {
  if (!isEmergencyAccessEnabled()) return null;
  const email = import.meta.env.VITE_EMERGENCY_EMAIL;
  const userId = import.meta.env.VITE_EMERGENCY_USER_ID;
  const companyId = import.meta.env.VITE_EMERGENCY_COMPANY_ID;
  const role = import.meta.env.VITE_EMERGENCY_ROLE || 'company_admin';
  if (!email || !userId || !companyId) return null;
  return {
    email: String(email).trim().toLowerCase(),
    userId: String(userId),
    companyId: String(companyId),
    role: String(role),
  };
}

/** Operational routes allowed in Emergency Access Mode (no admin/dev). */
export const EMERGENCY_ALLOWED_PREFIXES = [
  '/dashboard',
  '/projects',
  '/harvest-collections',
  '/expenses',
] as const;

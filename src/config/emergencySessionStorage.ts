/** localStorage payload after successful `emergency-access` Edge Function (no secrets in VITE_*). */
export const EMERGENCY_SESSION_STORAGE_KEY = 'farmvault:emergency-session:v2';

/** Server-issued session shape (from Edge `emergency-access`). */
export type EmergencyServerSession = {
  email: string;
  userId: string;
  companyId: string;
  role: string;
  issuedAt: string;
  version: 2;
};

const TTL_MS = 24 * 60 * 60 * 1000;

export function parseEmergencyServerSession(raw: string | null): EmergencyServerSession | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<EmergencyServerSession>;
    if (data.version !== 2 || !data.email || !data.userId || !data.companyId || !data.issuedAt) {
      return null;
    }
    const issued = Date.parse(data.issuedAt);
    if (Number.isNaN(issued) || Date.now() - issued > TTL_MS) {
      return null;
    }
    return {
      version: 2,
      email: String(data.email).trim().toLowerCase(),
      userId: String(data.userId),
      companyId: String(data.companyId),
      role: String(data.role || 'company_admin'),
      issuedAt: data.issuedAt,
    };
  } catch {
    return null;
  }
}

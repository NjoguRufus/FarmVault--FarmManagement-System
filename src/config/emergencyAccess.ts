import { supabase } from '@/lib/supabase';
import {
  EMERGENCY_SESSION_STORAGE_KEY,
  parseEmergencyServerSession,
  type EmergencyServerSession,
} from '@/config/emergencySessionStorage';

/** True when the SPA can call the `emergency-access` Edge Function (Supabase URL + anon/publishable key). */
export function isEmergencyAccessUiAvailable(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && key);
}

export async function requestEmergencySessionFromEdge(
  email: string,
  passphrase: string,
): Promise<{ ok: true; session: EmergencyServerSession } | { ok: false; error: string }> {
  if (!isEmergencyAccessUiAvailable()) {
    return { ok: false, error: 'Supabase is not configured in this build.' };
  }
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) {
    return { ok: false, error: 'Enter your email address.' };
  }

  const { data, error } = await supabase.functions.invoke('emergency-access', {
    body: { email: normalized, passphrase },
  });

  if (error) {
    return { ok: false, error: error.message || 'Emergency access request failed.' };
  }

  const body = data as {
    ok?: boolean;
    error?: string;
    session?: EmergencyServerSession;
  };

  if (!body?.ok || !body.session || body.session.version !== 2) {
    return { ok: false, error: body?.error || 'Access denied.' };
  }

  return { ok: true, session: body.session };
}

export function readStoredEmergencyServerSession(): EmergencyServerSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(EMERGENCY_SESSION_STORAGE_KEY);
    return parseEmergencyServerSession(raw);
  } catch {
    return null;
  }
}

export function writeStoredEmergencyServerSession(session: EmergencyServerSession | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!session) {
      window.localStorage.removeItem(EMERGENCY_SESSION_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(EMERGENCY_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

/** Operational routes allowed in Emergency Access Mode (no admin/dev). */
export const EMERGENCY_ALLOWED_PREFIXES = [
  '/home',
  '/dashboard',
  '/app',
  '/projects',
  '/harvest-collections',
  '/expenses',
] as const;

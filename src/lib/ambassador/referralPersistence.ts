import { supabase } from "@/lib/supabase";
import { AMBASSADOR_REF_STORAGE_KEY } from "@/lib/ambassador/constants";
import { getHostname, isLocalhostHost, isProdLike } from "@/lib/urls/domains";

/** Primary key (cross-marketing + app); survives when URL param is missing but cookie exists. */
export const FARMVAULT_REFERRAL_LOCAL_KEY = "farmvault_referral";

/** Canonical localStorage key for captured ambassador / farmer referral codes. */
export const FV_REFERRAL_LOCAL_KEY = "fv_referral";

const FV_REFERRAL_SESSION_STORAGE_KEY = "fv_referral";

const COOKIE_FV = "fv_referral";

/** Shared across farmvault.africa and app.farmvault.africa when Domain is set. */
const COOKIE_SHARED = "farmvault_ref";

const COOKIE_MAX_AGE_SEC = 90 * 24 * 60 * 60;

const COOKIE_SHARED_MAX_AGE_SEC = 90 * 24 * 60 * 60;

export const FV_REFERRAL_DEVICE_ID_KEY = "fv_referral_device_id";

function sharedCookieDomain(): string | null {
  if (typeof window === "undefined") return null;
  const h = getHostname();
  if (h === "farmvault.africa" || h === "www.farmvault.africa" || h === "app.farmvault.africa") {
    return ".farmvault.africa";
  }
  return null;
}

function readCookieRaw(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = `; ${document.cookie}`.split(`; ${name}=`);
  if (parts.length < 2) return null;
  return parts.pop()?.split(";").shift()?.trim() || null;
}

function readCookie(name: string): string | null {
  const raw = readCookieRaw(name);
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw).trim();
    return decoded || null;
  } catch {
    return raw.trim() || null;
  }
}

function writeHostCookie(name: string, value: string, maxAgeSec: number): void {
  if (typeof document === "undefined") return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${secure}`;
}

function writeSharedFarmvaultCookie(value: string): void {
  if (typeof document === "undefined") return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  const domain = sharedCookieDomain();
  const domPart = domain ? `; Domain=${domain}` : "";
  document.cookie = `${COOKIE_SHARED}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_SHARED_MAX_AGE_SEC}; SameSite=Lax${domPart}${secure}`;
}

function clearCookie(name: string, domain: string | null): void {
  if (typeof document === "undefined") return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  const domPart = domain ? `; Domain=${domain}` : "";
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${domPart}${secure}`;
}

/**
 * Stable per-browser device id for referral_sessions (not PII; ties pre-signup rows to RPCs).
 */
export function getReferralDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = window.localStorage.getItem(FV_REFERRAL_DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(FV_REFERRAL_DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

/**
 * Read persisted referral: localStorage (farmvault_referral, fv_referral) → shared cookie → host cookies → legacy.
 */
export function getPersistedReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  const tryKeys = [FARMVAULT_REFERRAL_LOCAL_KEY, FV_REFERRAL_LOCAL_KEY];
  for (const k of tryKeys) {
    try {
      const v = window.localStorage.getItem(k)?.trim();
      if (v) return v.toUpperCase();
    } catch {
      /* ignore */
    }
  }

  const shared = readCookie(COOKIE_SHARED);
  if (shared) return shared.toUpperCase();

  const fv = readCookie(COOKIE_FV);
  if (fv) return fv.toUpperCase();

  try {
    const leg = window.localStorage.getItem(AMBASSADOR_REF_STORAGE_KEY)?.trim();
    if (leg) return leg.toUpperCase();
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * If this origin has no localStorage yet but a shared cookie exists (cross-subdomain), copy into localStorage.
 */
export function hydrateReferralFromSharedCookieToLocalStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const has =
      window.localStorage.getItem(FARMVAULT_REFERRAL_LOCAL_KEY)?.trim() ||
      window.localStorage.getItem(FV_REFERRAL_LOCAL_KEY)?.trim();
    if (has) return;
  } catch {
    return;
  }

  const fromCookie = readCookie(COOKIE_SHARED) || readCookie(COOKIE_FV);
  if (!fromCookie?.trim()) return;
  persistReferralCodeIfEmpty(fromCookie.trim());
}

/**
 * Stores referral everywhere (first touch wins). Sets shared cookie on .farmvault.africa in production.
 */
export function persistReferralCodeIfEmpty(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return getPersistedReferralCode();

  const existing = getPersistedReferralCode();
  if (existing) return existing;

  const code = trimmed.toUpperCase();
  if (typeof window === "undefined") return code;

  try {
    window.localStorage.setItem(FARMVAULT_REFERRAL_LOCAL_KEY, code);
    window.localStorage.setItem(FV_REFERRAL_LOCAL_KEY, code);
    window.sessionStorage.setItem(FV_REFERRAL_SESSION_STORAGE_KEY, code);
    window.localStorage.setItem(AMBASSADOR_REF_STORAGE_KEY, code);
    writeHostCookie(COOKIE_FV, code, COOKIE_MAX_AGE_SEC);
    if (isProdLike() && !isLocalhostHost()) {
      writeSharedFarmvaultCookie(code);
    }
  } catch {
    /* ignore */
  }

  return code;
}

/** Clears all farmer referral storage (after successful onboarding). Does not remove ambassador_session. */
export function clearFarmerReferralStorageAfterSuccess(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(FARMVAULT_REFERRAL_LOCAL_KEY);
    window.localStorage.removeItem(FV_REFERRAL_LOCAL_KEY);
    window.sessionStorage.removeItem(FV_REFERRAL_SESSION_STORAGE_KEY);
    window.localStorage.removeItem(AMBASSADOR_REF_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  clearCookie(COOKIE_FV, null);
  clearCookie(COOKIE_SHARED, sharedCookieDomain());
  clearCookie(COOKIE_SHARED, null);
}

/** Legacy name: clears farmer pipeline keys used for attribution. */
export function clearAllPersistedReferralCodes(): void {
  clearFarmerReferralStorageAfterSuccess();
}

/**
 * Fire-and-forget: records a server-side referral_sessions row when the code is valid.
 */
export function recordReferralSessionOnServer(code: string | null | undefined): void {
  const c = code?.trim();
  if (!c || typeof window === "undefined") return;

  const deviceId = getReferralDeviceId();
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;

  void supabase
    .rpc("record_referral_session", {
      p_referral_code: c,
      p_device_id: deviceId,
      p_ip_address: null,
      p_user_agent: userAgent,
    })
    .then(({ error }) => {
      if (error && import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[referral] record_referral_session", error.message);
      }
    });
}

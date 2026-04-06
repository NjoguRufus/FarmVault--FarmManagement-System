/**
 * Legacy localStorage key for referral capture. Canonical key is `fv_referral` (see referralPersistence).
 * Still written when a code is captured so older paths keep working.
 */
export const AMBASSADOR_REF_STORAGE_KEY = "ambassador_ref";

/** After signup, session JSON: { id, referral_code } — used for /ambassador/onboarding and /ambassador/console/dashboard */
export const AMBASSADOR_SESSION_STORAGE_KEY = "ambassador_session";

export type AmbassadorType = "agrovet" | "farmer" | "company";

export type AmbassadorSession = {
  id: string;
  referral_code: string;
};

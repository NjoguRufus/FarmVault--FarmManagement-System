/** localStorage key for ambassador referral code captured from ?ref= */
export const AMBASSADOR_REF_STORAGE_KEY = "ambassador_ref";

/** After signup, session JSON: { id, referral_code } — used for /ambassador/onboarding and /ambassador/console/dashboard */
export const AMBASSADOR_SESSION_STORAGE_KEY = "ambassador_session";

export type AmbassadorType = "agrovet" | "farmer" | "company";

export type AmbassadorSession = {
  id: string;
  referral_code: string;
};

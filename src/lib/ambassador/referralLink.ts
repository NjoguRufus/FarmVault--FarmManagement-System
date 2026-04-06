import { buildUrl, getAppBaseUrl, getPublicBaseUrl, isLocalhostHost, isProdLike } from "@/lib/urls/domains";

/** Marketing scan URL with ref param (production default: https://farmvault.africa/scan?ref=…). */
export function buildAmbassadorReferralScanUrl(referralCode: string): string {
  const code = referralCode.trim();
  const base = getPublicBaseUrl();
  const path = buildUrl(base, "/scan");
  const q = new URLSearchParams({ ref: code });
  return `${path}?${q.toString()}`;
}

/** Short link /r/CODE on the public app origin (captures referral then redirects to sign-up). */
export function buildAmbassadorReferralShortUrl(referralCode: string): string {
  const code = encodeURIComponent(referralCode.trim());
  const base = getPublicBaseUrl();
  return buildUrl(base, `/r/${code}`);
}

/** Farmer sign-up on app host with ref (production: app.farmvault.africa/sign-up?ref=…). */
export function buildFarmerSignupUrlWithRef(referralCode: string): string {
  const q = new URLSearchParams({ ref: referralCode.trim() }).toString();
  if (typeof window !== "undefined" && (!isProdLike() || isLocalhostHost())) {
    const origin = window.location.origin.replace(/\/+$/, "");
    return `${origin}/sign-up?${q}`;
  }
  return buildUrl(getAppBaseUrl(), `/sign-up?${q}`);
}

import { buildUrl, getPublicBaseUrl } from "@/lib/urls/domains";

/** Marketing scan URL with ref param (production default: https://farmvault.africa/scan?ref=…). */
export function buildAmbassadorReferralScanUrl(referralCode: string): string {
  const code = referralCode.trim();
  const base = getPublicBaseUrl();
  const path = buildUrl(base, "/scan");
  const q = new URLSearchParams({ ref: code });
  return `${path}?${q.toString()}`;
}

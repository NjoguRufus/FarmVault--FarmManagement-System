/**
 * Optional “share FarmVault” QR block for branded emails.
 * Default scan target matches the app (`FarmVaultQRGenerator` → FARMVAULT_SCAN_URL).
 * Default QR graphic matches the QR page: `qr-code-styling` + logo, built to `public/email/farmvault-scan-qr.png`
 * (`npm run generate:email-qr`). Custom `qrCodeTargetUrl` values fall back to a plain generated QR (no logo).
 */

import type { FarmVaultEmailQrOptions } from "./types.ts";

/** Public landing URL encoded in the QR and used for tap targets. */
export const FARMVAULT_EMAIL_QR_DEFAULT_TARGET = "https://farmvault.africa/scan";

/** Hosted PNG — same design as `/developer/qr` (see `scripts/generate-email-branded-qr.mjs`). */
export const FARMVAULT_EMAIL_BRANDED_QR_IMAGE_URL =
  "https://farmvault.africa/email/farmvault-scan-qr.png";

function normalizedScanUrl(s: string): string {
  return s.trim().replace(/\/+$/, "") || s.trim();
}

/** HTTPS image URL for the QR `<img>`; branded asset when target is the default scan URL. */
export function farmVaultEmailDefaultQrImageUrl(targetUrl: string): string {
  if (normalizedScanUrl(targetUrl) === normalizedScanUrl(FARMVAULT_EMAIL_QR_DEFAULT_TARGET)) {
    return FARMVAULT_EMAIL_BRANDED_QR_IMAGE_URL;
  }
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(targetUrl.trim())}`;
}

function isValidHttpsUrl(s: string): boolean {
  try {
    return new URL(s.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * - `manual_default_on`: developer / outreach emails — QR on unless `showQrCode === false`.
 * - `transactional_default_off`: welcome, billing, approvals — QR only if `showQrCode === true`.
 */
export function resolveEmailQrShare(
  policy: "manual_default_on" | "transactional_default_off",
  fields: FarmVaultEmailQrOptions,
): { imageUrl: string; targetUrl: string } | null {
  const enabled =
    policy === "manual_default_on"
      ? fields.showQrCode !== false
      : fields.showQrCode === true;
  if (!enabled) return null;

  const target = (fields.qrCodeTargetUrl?.trim() || FARMVAULT_EMAIL_QR_DEFAULT_TARGET);
  if (!isValidHttpsUrl(target)) return null;

  const imageUrl = (fields.qrCodeImageUrl?.trim() || farmVaultEmailDefaultQrImageUrl(target));
  if (!isValidHttpsUrl(imageUrl)) return null;

  return { imageUrl, targetUrl: target.trim() };
}

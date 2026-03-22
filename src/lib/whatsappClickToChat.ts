/**
 * WhatsApp click-to-chat helpers for post-registration activation requests.
 * Set `VITE_FARMVAULT_ACTIVATION_WHATSAPP` (preferred) or `VITE_WHATSAPP_ACTIVATION_NUMBER`
 * to the full international number (digits with optional +), e.g. +254712345678.
 */

/** Used when the env var is unset. Digits only — leave empty to disable auto-redirect. */
export const FARMVAULT_ACTIVATION_WHATSAPP_FALLBACK = '';

const MIN_WHATSAPP_DIGITS = 9;

export function normalizeWhatsAppPhone(input: string): string {
  return input.replace(/\D/g, '');
}

export function getFarmVaultActivationWhatsAppDigits(): string {
  const raw =
    (import.meta.env.VITE_FARMVAULT_ACTIVATION_WHATSAPP as string | undefined)?.trim() ||
    (import.meta.env.VITE_WHATSAPP_ACTIVATION_NUMBER as string | undefined)?.trim() ||
    FARMVAULT_ACTIVATION_WHATSAPP_FALLBACK;
  return normalizeWhatsAppPhone(String(raw));
}

export function hasFarmVaultActivationWhatsApp(): boolean {
  return getFarmVaultActivationWhatsAppDigits().length >= MIN_WHATSAPP_DIGITS;
}

export function buildFarmVaultActivationRequestMessage(params: {
  companyName: string;
  planLabel: string;
  companyEmail: string;
}): string {
  const name = params.companyName.trim() || 'our company';
  const email = params.companyEmail.trim() || '—';
  const plan = params.planLabel.trim() || 'Pro Trial';
  return `Hello, this is ${name}. Kindly activate my FarmVault account. Company email: ${email}. Starting plan: ${plan}.`;
}

export function buildWhatsAppClickToChatUrl(phoneDigits: string, text: string): string {
  const q = new URLSearchParams({ text });
  return `https://wa.me/${phoneDigits}?${q.toString()}`;
}

/** Returns wa.me URL or null if no support number is configured. */
export function buildFarmVaultActivationWhatsAppUrl(prefilledMessage: string): string | null {
  const digits = getFarmVaultActivationWhatsAppDigits();
  if (digits.length < MIN_WHATSAPP_DIGITS) return null;
  return buildWhatsAppClickToChatUrl(digits, prefilledMessage);
}

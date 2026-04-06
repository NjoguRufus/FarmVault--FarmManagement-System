/**
 * Hosted brand assets (HTTPS). Matches transactional email header logo.
 * Override with VITE_FARMVAULT_LOGO_URL if you serve a different CDN path.
 */
export const FARMVAULT_LOGO_URL =
  (import.meta.env.VITE_FARMVAULT_LOGO_URL as string | undefined)?.trim() ||
  'https://farmvault.africa/Logo/FarmVault_Logo%20dark%20mode.png';

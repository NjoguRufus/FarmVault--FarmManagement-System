// FarmVault Companion Email — brand design tokens
// Shared between all email templates and the live preview.

export const C = {
  forestDeep:    '#1e2c21',
  forest:        '#2e4535',
  forestMid:     '#3d5c48',
  vault:         '#3e6b49',
  vaultSoft:     '#5a8a68',
  leaf:          '#6ca870',
  harvest:       '#d4a840',
  harvestDeep:   '#b88530',
  parchment:     '#f7f3e6',
  parchmentWarm: '#f2ead8',
  cream:         '#fdfcf8',
  ink:           '#1c2820',
  inkSoft:       '#2f3d30',
  mute:          '#5e6e5e',
  line:          '#ddd8c4',
  alert:         '#c8594a',
  positive:      '#4a8f54',
} as const;

export const LOGO_URL   = 'https://farmvault.africa/Logo/FarmVault_Logo%20dark%20mode.png';
export const MASCOT_URL = 'https://app.farmvault.africa/mascot/mascot%201.png';
export const APP_URL    = 'https://app.farmvault.africa';

// Display: Bricolage Grotesque (same as in-app banner) with Georgia as email-safe fallback.
// Body: Inter (same as in-app) with Arial as fallback.
// Both load via Google Fonts in the preview iframe; email clients fall back gracefully.
export const DISPLAY = '"Bricolage Grotesque", Georgia, "Times New Roman", serif';
export const BODY    = '"Inter", Arial, Helvetica, sans-serif';
export const MONO    = '"JetBrains Mono", "Courier New", Courier, monospace';

export const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap');`;

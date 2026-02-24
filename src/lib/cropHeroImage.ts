const CROP_HERO_IMAGE_MAP: Record<string, string> = {
  tomatoes: '/cropstage%20images/tomatoes.png',
  frenchbeans: '/cropstage%20images/Frenchbeans.png',
  capsicum: '/cropstage%20images/capsicum.png',
  watermelon: '/cropstage%20images/watermelon.png',
  watermelons: '/cropstage%20images/watermelon.png',
  maize: '/cropstage%20images/maize.png',
  rice: '/cropstage%20images/rice.png',
};

const CROP_HERO_IMAGE_ALIASES: Record<string, string> = {
  'french-beans': 'frenchbeans',
  french_beans: 'frenchbeans',
  'french beans': 'frenchbeans',
};

const FALLBACK_CROP_HERO_IMAGE = '/farm-background-desktop.jpg';

function normalizeCropKey(cropType: string): string {
  return cropType
    .toLowerCase()
    .trim()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z\s]/g, '');
}

export function getCropHeroImage(cropType: string | null | undefined): string {
  const raw = String(cropType || '').trim();
  if (!raw) return FALLBACK_CROP_HERO_IMAGE;

  const normalized = normalizeCropKey(raw);
  const aliasResolved = CROP_HERO_IMAGE_ALIASES[normalized] ?? normalized.replace(/\s/g, '');
  return CROP_HERO_IMAGE_MAP[aliasResolved] ?? FALLBACK_CROP_HERO_IMAGE;
}

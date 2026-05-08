import { EmailShell, BannerPanel, ContentShell, EmailFooter } from './_EmailShared';
import { APP_URL, C } from './tokens';
import type { InactivityTier } from './buildCompanionEmail';

interface TierTheme {
  headlineL1:      string;
  headlineL2:      string;
  headlineL2Color: string;
  subline:         string;
  ctaLabel:        string;
  footerTagline:   string;
}

function getTheme(tier: InactivityTier, farm: string): TierTheme {
  const themes: Record<InactivityTier, TierTheme> = {
    '2d': {
      headlineL1:      "We noticed",
      headlineL2:      "the quiet.",
      headlineL2Color: C.harvest,
      subline:         `${farm} is ready for you, whenever you are.`,
      ctaLabel:        'Return to Your Farm →',
      footerTagline:   "Still here. Always.",
    },
    '5d': {
      headlineL1:      "Your farm",
      headlineL2:      "misses you.",
      headlineL2Color: C.leaf,
      subline:         'FarmVault has been keeping watch.',
      ctaLabel:        'Come Back →',
      footerTagline:   "Still here. Always.",
    },
    '7d': {
      headlineL1:      "We've been",
      headlineL2:      "thinking.",
      headlineL2Color: C.harvest,
      subline:         `A week away from ${farm}. Your records are safe.`,
      ctaLabel:        'Return to FarmVault →',
      footerTagline:   "Still here. Always.",
    },
    '14d': {
      headlineL1:      "We miss you,",
      headlineL2:      `${farm}.`,
      headlineL2Color: C.harvestDeep,
      subline:         'Your farm data is safe. Your journey is still here.',
      ctaLabel:        'I\'m Ready to Return →',
      footerTagline:   "Still here. Always.",
    },
  };
  return themes[tier];
}

export interface InactivityCompanionEmailProps {
  displayName?: string;
  farmName?:    string;
  tier?:        InactivityTier;
  messageText?: string;
}

export function InactivityCompanionEmail({ displayName = 'Farmer', farmName = 'your farm', tier = '2d', messageText }: InactivityCompanionEmailProps) {
  const farm  = farmName || 'your farm';
  const theme = getTheme(tier, farm);
  const text  = messageText ?? "It's been a couple of days since your last visit. Your records are safe and your workspace is exactly as you left it.";

  const preheaders: Record<InactivityTier, string> = {
    '2d':  `${farm} is ready for you, whenever you are.`,
    '5d':  `Your farm journey is still here, ${farm}.`,
    '7d':  `We've been thinking about ${farm} — come back.`,
    '14d': `A message for ${farm} from FarmVault.`,
  };

  return (
    <EmailShell preheader={preheaders[tier]} title="FarmVault Companion">
      <BannerPanel
        headlineL1={theme.headlineL1}
        headlineL2={theme.headlineL2}
        headlineL2Color={theme.headlineL2Color}
        subline={theme.subline}
      />
      <ContentShell
        messageText={text}
        ctaLabel={theme.ctaLabel}
        ctaHref={`${APP_URL}/home`}
        closingLine="FarmVault — walking the journey with you, always."
      />
      <EmailFooter tagline={theme.footerTagline} />
    </EmailShell>
  );
}

import { EmailShell, BannerPanel, ContentShell, EmailFooter } from './_EmailShared';
import { APP_URL } from './tokens';

export interface MorningCompanionEmailProps {
  displayName?: string;
  farmName?:    string;
  messageText?: string;
}

export function MorningCompanionEmail({ displayName = 'Farmer', farmName = 'your farm', messageText }: MorningCompanionEmailProps) {
  const firstName = (displayName.trim() || 'Farmer').split(/[\s,]/)[0] || 'Farmer';
  const farm      = farmName || 'your farm';
  const text      = messageText ?? "A new farming day begins. Check in on your crops, review any pending operations, and log today's progress in FarmVault.";

  return (
    <EmailShell
      preheader={`A new farming day begins — ${farm} is ready for you.`}
      title="Your FarmVault Morning"
    >
      <BannerPanel
        headlineL1="Good morning,"
        headlineL2={`${firstName}.`}
      />
      <ContentShell
        messageText={text}
        ctaLabel="Start Today's Journey →"
        ctaHref={`${APP_URL}/home`}
        closingLine="Your farming companion walks this journey with you."
      />
      <EmailFooter tagline="Every farming day brings new growth." />
    </EmailShell>
  );
}

import { EmailShell, BannerPanel, ContentShell, EmailFooter } from './_EmailShared';
import { APP_URL } from './tokens';

export interface EveningReflectionEmailProps {
  displayName?:    string;
  farmName?:       string;
  messageText?:    string;
  isWeeklySummary?: boolean;
}

export function EveningReflectionEmail({ displayName = 'Farmer', farmName = 'your farm', messageText, isWeeklySummary = false }: EveningReflectionEmailProps) {
  const firstName  = (displayName.trim() || 'Farmer').split(/[\s,]/)[0] || 'Farmer';
  const farm       = farmName || 'your farm';
  const text       = messageText ?? 'Another farming day complete. Take a moment to log any work completed, update your harvest records, or note what needs attention tomorrow.';

  const headlineL1  = isWeeklySummary ? "This week," : 'Good evening,';
  const headlineL2  = isWeeklySummary ? `${farm}.`   : `${firstName}.`;
  const ctaLabel    = isWeeklySummary ? 'View This Week →'        : "Log Today's Progress →";
  const ctaHref     = isWeeklySummary ? `${APP_URL}/home`         : `${APP_URL}/farm-work`;
  const closingLine = isWeeklySummary
    ? "Every week written down becomes next season's wisdom."
    : 'Rest well. Your farm story continues tomorrow.';

  return (
    <EmailShell
      preheader={isWeeklySummary ? `Here is a look back at ${farm} this week.` : `Another farming day complete — ${farm}, you showed up.`}
      title={isWeeklySummary ? 'Your Weekly Farm Summary' : 'Your FarmVault Evening'}
    >
      <BannerPanel
        headlineL1={headlineL1}
        headlineL2={headlineL2}
        subline={isWeeklySummary ? `Another week written into ${farm}'s story.` : undefined}
      />
      <ContentShell
        messageText={text}
        ctaLabel={ctaLabel}
        ctaHref={ctaHref}
        closingLine={closingLine}
      />
      <EmailFooter tagline={isWeeklySummary ? 'Your farm story, written week by week.' : 'Rest well. Your farm story continues tomorrow.'} />
    </EmailShell>
  );
}

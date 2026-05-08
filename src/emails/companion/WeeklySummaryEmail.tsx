import { EmailShell, BannerPanel, ContentShell, EmailFooter } from './_EmailShared';
import { APP_URL, C } from './tokens';

export interface WeeklySummaryEmailProps {
  displayName?: string;
  farmName?:    string;
  messageText?: string;
  weekStart?:   string;
  weekEnd?:     string;
}

export function WeeklySummaryEmail({ displayName = 'Farmer', farmName = 'your farm', messageText, weekStart, weekEnd }: WeeklySummaryEmailProps) {
  const farm  = farmName || 'your farm';
  const text  = messageText ?? `Here is what ${farm} accomplished this week.`;
  const range = weekStart && weekEnd ? `${weekStart} — ${weekEnd}` : '';

  return (
    <EmailShell
      preheader={`Your FarmVault week: see what ${farm} accomplished.`}
      title="Your Weekly FarmVault Summary"
    >
      <BannerPanel
        headlineL1="This week,"
        headlineL2={`${farm}.`}
        headlineL2Color={C.harvest}
        subline={range || `Another week written into ${farm}'s story.`}
      />
      <ContentShell
        messageText={text}
        ctaLabel="View This Week →"
        ctaHref={`${APP_URL}/home`}
        closingLine="Every week you log is a season you'll understand."
      />
      <EmailFooter tagline="Your farm story, written week by week." />
    </EmailShell>
  );
}

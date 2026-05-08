import { EmailShell, BannerPanel, ContentShell, EmailFooter } from '../_EmailShared';
import { C, APP_URL } from '../tokens';

export interface EmployeeEveningReflectionEmailProps {
  displayName?: string;
  farmName?:    string;
  messageText?: string;
}

export function EmployeeEveningReflectionEmail({
  displayName = 'there',
  farmName    = 'the farm',
  messageText,
}: EmployeeEveningReflectionEmailProps) {
  const firstName = (displayName.trim() || 'there').split(/[\s,]/)[0] || 'there';
  const farm      = farmName || 'the farm';
  const text      = messageText ?? `Another farming day done. Whatever today brought — the long rows, the heat, the details — your presence on ${farm} matters.\n\nTake a moment to log any work completed. Your records help the whole farm team stay aligned.`;

  return (
    <EmailShell
      preheader={`${firstName}, your work today made a difference on ${farm}.`}
      title="Your FarmVault Evening"
    >
      <BannerPanel
        headlineL1="Well done"
        headlineL2="today."
        headlineL2Color={C.harvest}
        subline={`${firstName}, your work today made a difference.`}
      />
      <ContentShell
        messageText={text}
        ctaLabel="Log Today's Work →"
        ctaHref={`${APP_URL}/farm-work`}
        closingLine={`Rest well. Your dedication is what keeps ${farm} moving forward.`}
      />
      <EmailFooter tagline="Every day you show up, the farm grows stronger." />
    </EmailShell>
  );
}

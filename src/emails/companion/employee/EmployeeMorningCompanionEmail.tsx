import { EmailShell, BannerPanel, ContentShell, EmailFooter } from '../_EmailShared';
import { C, APP_URL } from '../tokens';

export interface EmployeeMorningCompanionEmailProps {
  displayName?: string;
  farmName?:    string;
  messageText?: string;
  role?:        string | null;
}

export function EmployeeMorningCompanionEmail({
  displayName = 'there',
  farmName    = 'the farm',
  messageText,
}: EmployeeMorningCompanionEmailProps) {
  const firstName = (displayName.trim() || 'there').split(/[\s,]/)[0] || 'there';
  const farm      = farmName || 'the farm';
  const text      = messageText ?? "Another great farming day begins. Your work on the farm makes a real difference — every task completed, every crop checked, helps the whole team succeed.\n\nShow up, do great work, and let FarmVault help you track your progress.";

  return (
    <EmailShell
      preheader={`Ready to make today count on ${farm}?`}
      title="Your FarmVault Morning"
    >
      <BannerPanel
        headlineL1="Good morning,"
        headlineL2={`${firstName}.`}
        headlineL2Color={C.leaf}
        subline={`Ready to make today count on ${farm}?`}
      />
      <ContentShell
        messageText={text}
        ctaLabel="Continue Today's Work →"
        ctaHref={`${APP_URL}/home`}
        closingLine={`Your contribution makes ${farm} thrive every single day.`}
      />
      <EmailFooter tagline="Every task you complete helps the farm grow." />
    </EmailShell>
  );
}

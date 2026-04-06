import { escapeHtml } from "./escapeHtml.ts";

export type DeveloperCompanyRegisteredAmbassador = {
  name: string;
  email: string;
  referralCode: string;
};

export type DeveloperCompanyRegisteredNotifyInput = {
  companyName: string;
  companyId: string;
  createdAt: string;
  plan: string;
  subscriptionStatus: string;
  trialEndsAt: string;
  ambassador: DeveloperCompanyRegisteredAmbassador | null;
};

export function buildDeveloperCompanyRegisteredNotifyEmail(
  input: DeveloperCompanyRegisteredNotifyInput,
): { subject: string; html: string } {
  const subject = "New Company Registered — Pro Trial Activated";
  const amb = input.ambassador;
  const referralBlock = amb
    ? `
      <p><strong>Ambassador:</strong> ${escapeHtml(amb.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(amb.email)}</p>
      <p><strong>Code:</strong> ${escapeHtml(amb.referralCode)}</p>
    `
    : `<p>Direct signup (no ambassador)</p>`;

  const html = `
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111827;">
<h2 style="margin:0 0 12px 0;">New Company Registered</h2>
<p><strong>Company:</strong> ${escapeHtml(input.companyName)}</p>
<p><strong>Company ID:</strong> ${escapeHtml(input.companyId)}</p>
<p><strong>Created at:</strong> ${escapeHtml(input.createdAt)}</p>
<h3 style="margin:20px 0 8px 0;">Subscription</h3>
<p><strong>Plan:</strong> ${escapeHtml(input.plan)}</p>
<p><strong>Status:</strong> ${escapeHtml(input.subscriptionStatus)}</p>
<p><strong>Trial ends:</strong> ${escapeHtml(input.trialEndsAt)}</p>
<h3 style="margin:20px 0 8px 0;">Referral</h3>
${referralBlock}
</body></html>
`.trim();

  return { subject, html };
}

import { escapeHtml } from "./escapeHtml.ts";

export function buildAdminPaymentConfirmedEmail(input: {
  companyName: string;
  amountLabel: string;
  receipt: string;
}): { subject: string; html: string } {
  const company = escapeHtml(input.companyName.trim() || "—");
  const amount = escapeHtml(input.amountLabel.trim() || "—");
  const receipt = escapeHtml(input.receipt.trim() || "—");
  const html = `<p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#1f2937;">A payment has been successfully processed.</p>
<table role="presentation" style="font-size:14px;border-collapse:collapse;">
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Company</td><td style="padding:4px 0;font-weight:600;">${company}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Amount</td><td style="padding:4px 0;font-weight:600;">${amount}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Receipt</td><td style="padding:4px 0;">${receipt}</td></tr>
</table>`;
  return { subject: "Payment Confirmed", html };
}

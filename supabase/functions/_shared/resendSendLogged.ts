import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertEmailLogRow, updateEmailLogRow } from "./emailLogs.ts";

export type SendResendWithEmailLogInput = {
  admin: SupabaseClient | null;
  resendKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  email_type: string;
  /** When set, links the log row to a workspace (developer notifications, tenant mail, etc.). */
  company_id?: string | null;
  company_name: string | null;
  metadata: Record<string, unknown>;
};

async function readResendBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text().catch(() => "");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

/**
 * Single Resend send with email_logs pending → sent/failed (shared by submission and similar flows).
 */
export async function sendResendWithEmailLog(
  input: SendResendWithEmailLogInput,
): Promise<
  { ok: true; resendId?: string; logId: string | null } | { ok: false; error: string }
> {
  const { admin, resendKey, from, to, subject, html, email_type, company_id, company_name, metadata } =
    input;
  const recipientLower = to.trim().toLowerCase();
  const logCompanyId = company_id ?? null;

  let logId: string | null = null;
  if (admin) {
    logId = await insertEmailLogRow(admin, {
      company_id: logCompanyId,
      company_name,
      recipient_email: recipientLower,
      email_type,
      subject,
      status: "pending",
      provider: "resend",
      metadata,
    });
  }

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to.trim()],
        subject,
        html,
      }),
    });
  } catch (fetchErr) {
    const detail = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    if (admin && logId) {
      await updateEmailLogRow(admin, logId, { status: "failed", error_message: detail });
    } else if (admin && !logId) {
      await insertEmailLogRow(admin, {
        company_id: logCompanyId,
        company_name,
        recipient_email: recipientLower,
        email_type,
        subject,
        status: "failed",
        provider: "resend",
        error_message: detail,
        metadata,
      });
    }
    return { ok: false, error: detail };
  }

  const resBody = await readResendBody(res);

  if (!res.ok) {
    const detail =
      typeof resBody.message === "string"
        ? resBody.message
        : typeof resBody.name === "string"
          ? resBody.name
          : `HTTP ${res.status}`;
    if (admin && logId) {
      await updateEmailLogRow(admin, logId, { status: "failed", error_message: detail });
    } else if (admin && !logId) {
      await insertEmailLogRow(admin, {
        company_id: logCompanyId,
        company_name,
        recipient_email: recipientLower,
        email_type,
        subject,
        status: "failed",
        provider: "resend",
        error_message: detail,
        metadata,
      });
    }
    return { ok: false, error: detail };
  }

  const resendId = typeof resBody.id === "string" ? resBody.id : undefined;
  const sentAt = new Date().toISOString();
  if (admin && logId) {
    await updateEmailLogRow(admin, logId, {
      status: "sent",
      provider_message_id: resendId ?? null,
      sent_at: sentAt,
    });
  } else if (admin && !logId) {
    await insertEmailLogRow(admin, {
      company_id: logCompanyId,
      company_name,
      recipient_email: recipientLower,
      email_type,
      subject,
      status: "sent",
      provider: "resend",
      provider_message_id: resendId ?? null,
      sent_at: sentAt,
      metadata,
    });
  }

  return { ok: true, resendId, logId };
}

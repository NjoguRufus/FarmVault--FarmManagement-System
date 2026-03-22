import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type EmailLogRowInsert = {
  company_id?: string | null;
  company_name?: string | null;
  recipient_email: string;
  email_type: string;
  subject: string;
  status: "pending" | "sent" | "failed";
  provider?: string;
  provider_message_id?: string | null;
  triggered_by?: string | null;
  error_message?: string | null;
  metadata?: Record<string, unknown> | null;
  sent_at?: string | null;
};

/**
 * Insert an email_logs row. Used by Edge Functions with the service role client.
 */
export async function insertEmailLogRow(
  client: SupabaseClient,
  row: EmailLogRowInsert,
): Promise<string | null> {
  const { data, error } = await client.from("email_logs").insert(row).select("id").single();
  if (error) {
    console.error("[email_logs] insert failed", error.message, error);
    return null;
  }
  const id = (data as { id?: string } | null)?.id;
  return typeof id === "string" ? id : null;
}

/**
 * Patch an email_logs row by id.
 */
export async function updateEmailLogRow(
  client: SupabaseClient,
  id: string,
  patch: Partial<EmailLogRowInsert> & { status?: "pending" | "sent" | "failed" },
): Promise<boolean> {
  const { error } = await client.from("email_logs").update(patch).eq("id", id);
  if (error) {
    console.error("[email_logs] update failed", error.message, error);
    return false;
  }
  return true;
}

export function buildEmailMetadataSummary(
  extra: Record<string, unknown> | null | undefined,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const keys = Object.keys(data);
  return {
    ...(extra && typeof extra === "object" && !Array.isArray(extra) ? extra : {}),
    templateDataKeys: keys,
  };
}

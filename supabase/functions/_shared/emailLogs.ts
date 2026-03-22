import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createServiceRoleSupabaseClient } from "./supabaseAdmin.ts";

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
 * Service-role client for public.email_logs (Edge Functions only).
 */
export function getServiceRoleClientForEmailLogs(): SupabaseClient | null {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceKey) {
    console.error(
      "[email_logs] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — email_logs writes are disabled. Set the service role secret on the Edge Function.",
    );
    return null;
  }
  return createServiceRoleSupabaseClient(supabaseUrl, serviceKey);
}

/**
 * Insert an email_logs row. Used by Edge Functions with the service role client.
 */
export async function insertEmailLogRow(
  client: SupabaseClient,
  row: EmailLogRowInsert,
): Promise<string | null> {
  const { data, error } = await client.from("email_logs").insert(row).select("id").single();
  // TEMP: pipeline debugging — remove or reduce verbosity once logs page verified in prod
  console.log("[email_logs] insert result", {
    ok: !error,
    id: (data as { id?: string } | null)?.id ?? null,
    error: error?.message ?? null,
    email_type: row.email_type,
    status: row.status,
  });
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
  const { data, error } = await client.from("email_logs").update(patch).eq("id", id).select("id");
  // TEMP: pipeline debugging
  console.log("[email_logs] update result", {
    ok: !error,
    id,
    rowCount: Array.isArray(data) ? data.length : null,
    error: error?.message ?? null,
    patchStatus: patch.status ?? null,
  });
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

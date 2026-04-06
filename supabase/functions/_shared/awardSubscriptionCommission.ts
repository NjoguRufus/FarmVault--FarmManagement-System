// Service-role helper: idempotent flat KES ambassador commission per subscription receipt.
// Mirrors public.award_subscription_commission (company_id, receipt_number).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AwardSubscriptionCommissionResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  amount?: number;
  first_subscription_payment?: boolean;
};

export async function awardSubscriptionCommission(
  admin: SupabaseClient,
  companyId: string,
  receiptNumber: string,
): Promise<AwardSubscriptionCommissionResult> {
  const rid = typeof companyId === "string" ? companyId.trim() : "";
  const rcpt = typeof receiptNumber === "string" ? receiptNumber.trim() : "";
  if (!rid || !rcpt) {
    return { ok: false, error: "company_id_and_receipt_required" };
  }

  const { data, error } = await admin.rpc("award_subscription_commission", {
    p_company_id: rid,
    p_receipt_number: rcpt,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = data as Record<string, unknown> | null;
  if (!row || row.ok !== true) {
    const err = typeof row?.error === "string" ? row.error : "rpc_failed";
    return { ok: false, error: err };
  }

  if (row.skipped === true) {
    return {
      ok: true,
      skipped: true,
      reason: typeof row.reason === "string" ? row.reason : undefined,
    };
  }

  return {
    ok: true,
    amount: typeof row.amount === "number" ? row.amount : Number(row.amount),
    first_subscription_payment: row.first_subscription_payment === true,
  };
}

import { supabase } from "@/lib/supabase";
import {
  AMBASSADOR_REF_STORAGE_KEY,
  AMBASSADOR_SESSION_STORAGE_KEY,
  type AmbassadorSession,
  type AmbassadorType,
} from "@/lib/ambassador/constants";

export function getStoredAmbassadorRef(): string | null {
  try {
    return localStorage.getItem(AMBASSADOR_REF_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearStoredAmbassadorRef(): void {
  try {
    localStorage.removeItem(AMBASSADOR_REF_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getAmbassadorSession(): AmbassadorSession | null {
  try {
    const raw = localStorage.getItem(AMBASSADOR_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "id" in parsed &&
      "referral_code" in parsed &&
      typeof (parsed as AmbassadorSession).id === "string" &&
      typeof (parsed as AmbassadorSession).referral_code === "string"
    ) {
      return parsed as AmbassadorSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function setAmbassadorSession(session: AmbassadorSession): void {
  try {
    localStorage.setItem(AMBASSADOR_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function clearAmbassadorSession(): void {
  try {
    localStorage.removeItem(AMBASSADOR_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export type SubmitAmbassadorInput = {
  name: string;
  phone?: string;
  email?: string;
  type: AmbassadorType;
};

export type SubmitAmbassadorResult = {
  id: string;
  referral_code: string;
};

/**
 * Inserts a new ambassador row. Parent link uses `referred_by` when
 * `AMBASSADOR_REF_STORAGE_KEY` matches an active ambassador `referral_code`.
 * Caller should clear referral storage and set session after success.
 */
export async function submitAmbassadorApplication(
  input: SubmitAmbassadorInput,
): Promise<SubmitAmbassadorResult> {
  const rawCode = getStoredAmbassadorRef();
  let referredBy: string | null = null;

  if (rawCode?.trim()) {
    const { data: parentId, error: rpcError } = await supabase.rpc("get_ambassador_id_by_referral_code", {
      p_code: rawCode.trim(),
    });
    if (rpcError) throw rpcError;
    if (parentId) referredBy = parentId as string;
  }

  const { data, error } = await supabase
    .from("ambassadors")
    .insert({
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      type: input.type,
      referred_by: referredBy,
    })
    .select("id, referral_code")
    .single();

  if (error) throw error;
  if (!data?.referral_code) throw new Error("Missing referral code after signup");

  return { id: data.id, referral_code: data.referral_code };
}

export type AmbassadorDashboardStats = {
  ok: true;
  name: string;
  referral_code: string;
  ambassador_active: boolean;
  onboarding_complete: boolean;
  total_referrals: number;
  active_referrals: number;
  inactive_referrals: number;
  total_earned: number;
  paid: number;
  owed: number;
};

export type AmbassadorDashboardError = { ok: false; error: string };

/**
 * Aggregates `referrals` and `ambassador_earnings` for the ambassador; loads profile from `ambassadors`.
 */
export async function fetchAmbassadorDashboardStats(
  ambassadorId: string,
): Promise<AmbassadorDashboardStats | AmbassadorDashboardError> {
  const { data, error } = await supabase.rpc("fetch_ambassador_dashboard_stats", {
    p_ambassador_id: ambassadorId,
  });

  if (error) throw error;
  return mapDashboardRpcPayload(data);
}

export async function completeAmbassadorOnboarding(ambassadorId: string): Promise<void> {
  const { error } = await supabase.rpc("complete_ambassador_onboarding", {
    p_ambassador_id: ambassadorId,
  });
  if (error) throw error;
}

/** Marks onboarding complete for the signed-in Clerk user (no arbitrary ambassador id). */
export async function completeMyAmbassadorOnboarding(): Promise<void> {
  const { data, error } = await supabase.rpc("complete_my_ambassador_onboarding");
  if (error) throw error;
  const row = data as Record<string, unknown> | null;
  if (!row || row.ok !== true) {
    const err = typeof row?.error === "string" ? row.error : "complete_onboarding_failed";
    throw new Error(err);
  }
}

function mapDashboardRpcPayload(data: unknown): AmbassadorDashboardStats | AmbassadorDashboardError {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "invalid_response" };
  }
  const row = data as Record<string, unknown>;
  if (row.ok !== true) {
    return { ok: false, error: typeof row.error === "string" ? row.error : "unknown" };
  }
  return {
    ok: true,
    name: String(row.name ?? ""),
    referral_code: String(row.referral_code ?? ""),
    ambassador_active: Boolean(row.ambassador_active),
    onboarding_complete: Boolean(row.onboarding_complete),
    total_referrals: Number(row.total_referrals ?? 0),
    active_referrals: Number(row.active_referrals ?? 0),
    inactive_referrals: Number(row.inactive_referrals ?? 0),
    total_earned: Number(row.total_earned ?? 0),
    paid: Number(row.paid ?? 0),
    owed: Number(row.owed ?? 0),
  };
}

/** Dashboard for the signed-in Clerk user (uses `core.current_user_id()` in Postgres). */
export async function fetchMyAmbassadorDashboardStats(): Promise<
  AmbassadorDashboardStats | AmbassadorDashboardError
> {
  const { data, error } = await supabase.rpc("fetch_my_ambassador_dashboard_stats");
  if (error) throw error;
  return mapDashboardRpcPayload(data);
}

/** True when an `ambassadors` row exists for the current JWT (same RPC as dashboard). */
export async function hasAmbassadorRowForCurrentUser(): Promise<boolean> {
  try {
    const r = await fetchMyAmbassadorDashboardStats();
    return r.ok === true;
  } catch {
    return false;
  }
}

export type AmbassadorReferralRow = {
  referral_id: string;
  name: string;
  type: string;
  status: "active" | "inactive";
  date: string;
  commission: number;
};

export type AmbassadorReferralRowsResult =
  | { ok: true; rows: AmbassadorReferralRow[] }
  | { ok: false; error: string };

function mapReferralRowsPayload(data: unknown): AmbassadorReferralRowsResult {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "invalid_response" };
  }
  const row = data as Record<string, unknown>;
  if (row.ok !== true) {
    return { ok: false, error: typeof row.error === "string" ? row.error : "unknown" };
  }
  const rawRows = row.rows;
  if (!Array.isArray(rawRows)) {
    return { ok: true, rows: [] };
  }
  const rows: AmbassadorReferralRow[] = rawRows.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      referral_id: String(o.referral_id ?? ""),
      name: String(o.name ?? ""),
      type: String(o.type ?? ""),
      status: o.status === "inactive" ? "inactive" : "active",
      date: typeof o.date === "string" ? o.date : String(o.date ?? ""),
      commission: Number(o.commission ?? 0),
    };
  });
  return { ok: true, rows };
}

export async function fetchAmbassadorReferralRows(ambassadorId: string): Promise<AmbassadorReferralRowsResult> {
  const { data, error } = await supabase.rpc("fetch_ambassador_referral_rows", {
    p_ambassador_id: ambassadorId,
  });
  if (error) throw error;
  return mapReferralRowsPayload(data);
}

export async function fetchMyAmbassadorReferralRows(): Promise<AmbassadorReferralRowsResult> {
  const { data, error } = await supabase.rpc("fetch_my_ambassador_referral_rows");
  if (error) throw error;
  return mapReferralRowsPayload(data);
}

export type AmbassadorEarningTransactionRow = {
  id: string;
  created_at: string;
  description: string;
  type: string;
  amount: number;
  status: "owed" | "paid";
};

export type AmbassadorEarningsTransactionsResult =
  | { ok: true; rows: AmbassadorEarningTransactionRow[] }
  | { ok: false; error: string };

function mapEarningsTransactionsPayload(data: unknown): AmbassadorEarningsTransactionsResult {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "invalid_response" };
  }
  const row = data as Record<string, unknown>;
  if (row.ok !== true) {
    return { ok: false, error: typeof row.error === "string" ? row.error : "unknown" };
  }
  const rawRows = row.rows;
  if (!Array.isArray(rawRows)) {
    return { ok: true, rows: [] };
  }
  const rows: AmbassadorEarningTransactionRow[] = rawRows.map((r) => {
    const o = r as Record<string, unknown>;
    const st = o.status === "paid" ? "paid" : "owed";
    return {
      id: String(o.id ?? ""),
      created_at: typeof o.created_at === "string" ? o.created_at : String(o.created_at ?? ""),
      description: String(o.description ?? ""),
      type: String(o.type ?? ""),
      amount: Number(o.amount ?? 0),
      status: st,
    };
  });
  return { ok: true, rows };
}

export async function fetchAmbassadorEarningsTransactions(
  ambassadorId: string,
): Promise<AmbassadorEarningsTransactionsResult> {
  const { data, error } = await supabase.rpc("fetch_ambassador_earnings_transactions", {
    p_ambassador_id: ambassadorId,
  });
  if (error) throw error;
  return mapEarningsTransactionsPayload(data);
}

export async function fetchMyAmbassadorEarningsTransactions(): Promise<AmbassadorEarningsTransactionsResult> {
  const { data, error } = await supabase.rpc("fetch_my_ambassador_earnings_transactions");
  if (error) throw error;
  return mapEarningsTransactionsPayload(data);
}

export type RegisterAmbassadorClerkResult = {
  id: string;
  referral_code: string;
  already_registered: boolean;
};

/**
 * Creates (or returns) `ambassadors` row for the current Clerk user.
 * Resolves `referred_by` from `p_referrer_code` via `get_ambassador_id_by_referral_code`.
 */
export async function registerAmbassadorForClerk(input: {
  name: string;
  phone?: string;
  email: string;
  type: AmbassadorType;
  referrerCode?: string | null;
}): Promise<RegisterAmbassadorClerkResult> {
  const { data, error } = await supabase.rpc("register_ambassador_for_clerk", {
    p_name: input.name.trim(),
    p_phone: input.phone?.trim() ?? "",
    p_email: input.email.trim(),
    p_type: input.type,
    p_referrer_code: input.referrerCode?.trim() || null,
  });
  if (error) throw error;
  const row = data as Record<string, unknown> | null;
  if (!row || row.ok !== true) {
    const err = typeof row?.error === "string" ? row.error : "registration_failed";
    throw new Error(err);
  }
  return {
    id: String(row.id),
    referral_code: String(row.referral_code ?? ""),
    already_registered: Boolean(row.already_registered),
  };
}

import { supabase } from "@/lib/supabase";

export type DevGlobalReferralStats = {
  total_ambassadors: number;
  active_ambassadors: number;
  inactive_ambassadors: number;
};

export type DevReferralConversionRow = {
  id: string;
  name: string;
  type: string;
  referral_code: string | null;
  total_referrals: number;
  active_referrals: number;
  inactive_referrals: number;
  conversion_rate: number;
  total_earned: number;
  owed: number;
  paid: number;
};

export type DevReferrerDetailRow = {
  referrer_id: string;
  referral_id: string;
  referred_user_id: string;
  referred_user_type: string;
  level: number;
  is_active: boolean;
  referred_name: string | null;
  created_at: string;
};

export type DevCommissionBreakdownRow = {
  commission_id: string;
  referrer_id: string;
  user_id: string | null;
  amount: number;
  commission_type: string;
  status: string;
  created_at: string;
};

export async function fetchDevGlobalReferralStats(): Promise<DevGlobalReferralStats> {
  const { data, error } = await supabase.from("dev_global_referral_stats").select("*").maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as Record<string, unknown> | null;
  return {
    total_ambassadors: Number(row?.total_ambassadors ?? 0),
    active_ambassadors: Number(row?.active_ambassadors ?? 0),
    inactive_ambassadors: Number(row?.inactive_ambassadors ?? 0),
  };
}

export async function fetchDevReferralConversion(): Promise<DevReferralConversionRow[]> {
  const { data, error } = await supabase
    .from("dev_referral_conversion")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    type: String(r.type ?? ""),
    referral_code: r.referral_code != null ? String(r.referral_code) : null,
    total_referrals: Number(r.total_referrals ?? 0),
    active_referrals: Number(r.active_referrals ?? 0),
    inactive_referrals: Number(r.inactive_referrals ?? 0),
    conversion_rate: Number(r.conversion_rate ?? 0),
    total_earned: Number(r.total_earned ?? 0),
    owed: Number(r.owed ?? 0),
    paid: Number(r.paid ?? 0),
  }));
}

export async function fetchDevReferralConversionById(ambassadorId: string): Promise<DevReferralConversionRow | null> {
  const { data, error } = await supabase
    .from("dev_referral_conversion")
    .select("*")
    .eq("id", ambassadorId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    type: String(r.type ?? ""),
    referral_code: r.referral_code != null ? String(r.referral_code) : null,
    total_referrals: Number(r.total_referrals ?? 0),
    active_referrals: Number(r.active_referrals ?? 0),
    inactive_referrals: Number(r.inactive_referrals ?? 0),
    conversion_rate: Number(r.conversion_rate ?? 0),
    total_earned: Number(r.total_earned ?? 0),
    owed: Number(r.owed ?? 0),
    paid: Number(r.paid ?? 0),
  };
}

export async function fetchDevReferrerDetails(referrerId: string): Promise<DevReferrerDetailRow[]> {
  const { data, error } = await supabase
    .from("dev_referrer_details")
    .select("*")
    .eq("referrer_id", referrerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map((r) => ({
    referrer_id: String(r.referrer_id),
    referral_id: String(r.referral_id),
    referred_user_id: String(r.referred_user_id),
    referred_user_type: String(r.referred_user_type ?? ""),
    level: Number(r.level ?? 1),
    is_active: Boolean(r.is_active),
    referred_name: r.referred_name != null ? String(r.referred_name) : null,
    created_at: String(r.created_at ?? ""),
  }));
}

export async function fetchDevCommissionBreakdown(referrerId: string): Promise<DevCommissionBreakdownRow[]> {
  const { data, error } = await supabase
    .from("dev_commission_breakdown")
    .select("*")
    .eq("referrer_id", referrerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map((r) => ({
    commission_id: String(r.commission_id),
    referrer_id: String(r.referrer_id),
    user_id: r.user_id != null ? String(r.user_id) : null,
    amount: Number(r.amount ?? 0),
    commission_type: String(r.commission_type ?? ""),
    status: String(r.status ?? ""),
    created_at: String(r.created_at ?? ""),
  }));
}

/** Mark every owed commission for this referrer as paid. */
export async function markAmbassadorCommissionsPaid(referrerId: string): Promise<void> {
  const { error } = await supabase
    .from("commissions")
    .update({ status: "paid" })
    .eq("referrer_id", referrerId)
    .eq("status", "owed");
  if (error) throw new Error(error.message);
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { mirrorPublicProfileForClerkUser } from '@/lib/auth/tenantMembershipRecovery';
import { db } from '@/lib/db';
import { logger } from "@/lib/logger";

export type SubscriptionPlan = 'trial' | 'basic' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'expired' | 'grace' | 'paused';

export interface CompanySubscriptionOverride {
  enabled: boolean;
  type?: 'full_free' | 'extended_trial' | 'custom';
  overrideEndsAt?: Date | string | null;
  reason?: string | null;
  grantedBy?: string;
  grantedAt?: Date | string;
}

export interface CompanySubscription {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialStartAt?: Date | string;
  trialEndsAt?: Date | string;
  paidUntil?: Date | string | null;
  billingMode?: PaymentMode;
  override?: CompanySubscriptionOverride;
}

export interface CompanyDoc {
  id: string;
  name?: string;
  email?: string;
  status?: string;
  plan?: string;
  /** PayBill account number (e.g. FV-xxxxxxxx) for STK / manual payments. */
  billingReference?: string | null;
  userCount?: number;
  projectCount?: number;
  revenue?: number;
  createdAt?: unknown;
  nextPaymentAt?: Date | string | null;
  paymentReminderActive?: boolean;
  paymentReminderSetAt?: Date | string | null;
  paymentReminderDismissedAt?: Date | string | null;
  paymentReminderDismissedBy?: string | null;
  subscriptionPlan?: string;
  subscription?: CompanySubscription;
  /** Master push-notification switch. When true, OneSignal will prompt users to subscribe. */
  notifications_enabled?: boolean;
  [key: string]: unknown;
}

export type PaymentMode = 'monthly' | 'seasonal' | 'annual';

function mapRowToCompanyDoc(row: Record<string, unknown>): CompanyDoc {
  const sub = row.subscription as CompanySubscription | undefined;
  return {
    id: String(row.id ?? ''),
    name: row.name != null ? String(row.name) : undefined,
    email: row.email != null ? String(row.email) : undefined,
    status: row.status != null ? String(row.status) : undefined,
    plan: row.plan != null ? String(row.plan) : undefined,
    billingReference: (() => {
      const raw = row.billing_reference ?? row.billingReference;
      if (raw == null) return undefined;
      const s = String(raw).trim();
      return s !== '' ? s : undefined;
    })(),
    userCount: row.user_count != null ? Number(row.user_count) : undefined,
    projectCount: row.project_count != null ? Number(row.project_count) : undefined,
    revenue: row.revenue != null ? Number(row.revenue) : undefined,
    createdAt: row.created_at ?? undefined,
    subscription: sub ?? undefined,
    subscriptionPlan: sub?.plan ?? undefined,
    notifications_enabled: row.notifications_enabled != null ? Boolean(row.notifications_enabled) : false,
  };
}

export async function getCompany(
  companyId: string,
  client?: SupabaseClient,
): Promise<CompanyDoc | null> {
  const from = client ? client.schema('core').from('companies') : db.core().from('companies');
  // `*` ensures `billing_reference` and any env-specific columns are never omitted by a narrow select.
  const { data, error } = await from.select('*').eq('id', companyId).maybeSingle();

  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[getCompany] core.companies load failed', { companyId, message: error.message });
    }
    return null;
  }
  if (!data) return null;
  return mapRowToCompanyDoc(data as Record<string, unknown>);
}

/** List all companies (developer use, e.g. share records). */
export async function listCompanies(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db.core().from('companies').select('id, name, billing_reference');

  if (error || !data) return [];
  return (data as { id: string; name: string }[]).map((r) => ({
    id: r.id,
    name: r.name ?? r.id,
  }));
}

/**
 * All companies for developer tools (ordered by name).
 * Uses `core.companies` via the project DB wrapper (not unqualified `public.companies`).
 */
export async function getAllCompanies(): Promise<{ id: string; name: string | null }[]> {
  const { data, error } = await db.core().from('companies').select('id, name, billing_reference').order('name');

  if (error) {
    throw new Error(error.message ?? 'Failed to load companies');
  }
  return (data ?? []) as { id: string; name: string | null }[];
}

export async function setPaymentReminder(companyId: string, nextPaymentAt?: Date): Promise<void> {
  const { data } = await db
    .core()
    .from('companies')
    .select('subscription, billing_reference')
    .eq('id', companyId)
    .single();
  const subscription = (data?.subscription as Record<string, unknown>) ?? {};
  await db
    .core()
    .from('companies')
    .update({
      subscription: {
        ...subscription,
        paymentReminderActive: true,
        paymentReminderSetAt: new Date().toISOString(),
        ...(nextPaymentAt && { nextPaymentAt: nextPaymentAt.toISOString() }),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', companyId);
}

export async function clearPaymentReminder(companyId: string, dismissedByUserId?: string): Promise<void> {
  const { data } = await db
    .core()
    .from('companies')
    .select('subscription, billing_reference')
    .eq('id', companyId)
    .single();
  const subscription = (data?.subscription as Record<string, unknown>) ?? {};
  const updates: Record<string, unknown> = { ...subscription, paymentReminderActive: false };
  if (dismissedByUserId) {
    updates.paymentReminderDismissedAt = new Date().toISOString();
    updates.paymentReminderDismissedBy = dismissedByUserId;
  }
  await db.core().from('companies').update({ subscription: updates, updated_at: new Date().toISOString() }).eq('id', companyId);
}

export async function setCompanyNextPayment(companyId: string, nextPaymentAt: Date): Promise<void> {
  const { data } = await db
    .core()
    .from('companies')
    .select('subscription, billing_reference')
    .eq('id', companyId)
    .single();
  const subscription = ((data?.subscription as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  await db
    .core()
    .from('companies')
    .update({
      subscription: { ...subscription, nextPaymentAt: nextPaymentAt.toISOString() },
      updated_at: new Date().toISOString(),
    })
    .eq('id', companyId);
}

export async function updateCompany(
  companyId: string,
  data: {
    name?: string;
    email?: string;
    plan?: string;
    status?: string;
    customWorkTypes?: string[];
    notificationsEnabled?: boolean;
  }
): Promise<void> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.email !== undefined) updates.email = data.email;
  if (data.plan !== undefined) updates.plan = data.plan;
  if (data.status !== undefined) updates.status = data.status;
  if (data.customWorkTypes !== undefined) updates.custom_work_types = data.customWorkTypes;
  if (data.notificationsEnabled !== undefined) updates.notifications_enabled = data.notificationsEnabled;
  if (Object.keys(updates).length <= 1) return;
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    logger.log('[CompanyService/updateCompany] Payload', {
      schema: 'core',
      table: 'companies',
      companyId,
      updates,
    });
  }
  const { data: updated, error } = await db
    .core()
    .from('companies')
    .update(updates)
    .eq('id', companyId)
    .select('id, name, email, plan, status, billing_reference')
    .maybeSingle();
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    logger.log('[CompanyService/updateCompany] Supabase response', {
      data: updated,
      error,
    });
  }
  if (error) {
    throw error;
  }
}

export async function createCompany(
  name: string,
  companyEmail: string,
  plan: string = 'starter',
): Promise<string> {
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const companyPlan = ['starter', 'professional', 'enterprise'].includes(plan) ? plan : 'starter';
  const id = crypto.randomUUID();

  await db.core().from('companies').insert({
    id,
    name,
    status: 'active',
    plan: companyPlan,
    user_count: 1,
    project_count: 0,
    revenue: 0,
    subscription: {
      plan: 'trial',
      status: 'active',
      trialStartAt: now.toISOString(),
      trialEndsAt: trialEndsAt.toISOString(),
      paidUntil: null,
      billingMode: 'monthly',
      override: {
        enabled: false,
        type: 'custom',
        overrideEndsAt: null,
        reason: null,
        grantedBy: '',
        grantedAt: now.toISOString(),
      },
    },
  });
  return id;
}

export async function setCompanySubscriptionOverride(
  companyId: string,
  override: CompanySubscriptionOverride | null,
): Promise<void> {
  const { data } = await supabase.from('companies').select('subscription').eq('id', companyId).single();
  const subscription = ((data?.subscription as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const overrideValue = override
    ? {
        ...override,
        grantedAt: override.grantedAt instanceof Date ? override.grantedAt.toISOString() : override.grantedAt ?? new Date().toISOString(),
      }
    : { enabled: false, type: 'custom', overrideEndsAt: null, reason: null, grantedBy: null, grantedAt: new Date().toISOString() };
  await db
    .core()
    .from('companies')
    .update({
      subscription: { ...subscription, override: overrideValue },
      updated_at: new Date().toISOString(),
    })
    .eq('id', companyId);
}

export async function setCompanyPaidPlan(
  companyId: string,
  plan: Exclude<SubscriptionPlan, 'trial'>,
  mode: PaymentMode,
): Promise<void> {
  const now = new Date();
  const daysByMode: Record<PaymentMode, number> = {
    monthly: 30,
    seasonal: 120,
    annual: 365,
  };
  const durationDays = daysByMode[mode] ?? 30;
  const paidUntil = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const legacyPlan = plan === 'basic' ? 'starter' : plan === 'pro' ? 'professional' : 'enterprise';

  const { data } = await db
    .core()
    .from('companies')
    .select('subscription, billing_reference')
    .eq('id', companyId)
    .single();
  const subscription = ((data?.subscription as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  await db
    .core()
    .from('companies')
    .update({
      plan: legacyPlan,
      // Clear trial fields explicitly so pro_trial / isTrial flags never survive a paid activation.
      subscription: {
        ...subscription,
        plan,
        status: 'active',
        billingMode: mode,
        paidUntil: paidUntil.toISOString(),
        isTrial: false,
        trialEndsAt: null,
        trialStartAt: null,
      },
      subscription_status: 'active',
      access_level: plan,
      payment_confirmed: true,
      pending_confirmation: false,
      active_until: paidUntil.toISOString(),
      trial_ends_at: null,
      trial_started_at: null,
      updated_at: now.toISOString(),
    } as Record<string, unknown>)
    .eq('id', companyId);

  // Mirror into public.company_subscriptions so the gate RPC sees is_trial=false immediately.
  await db
    .public()
    .from('company_subscriptions')
    .upsert(
      {
        company_id: companyId,
        plan_id: plan,
        plan_code: plan,
        plan,
        status: 'active',
        billing_mode: 'manual',
        billing_cycle: mode === 'seasonal' ? 'seasonal' : mode === 'annual' ? 'annual' : 'monthly',
        is_trial: false,
        trial_started_at: null,
        trial_starts_at: null,
        trial_ends_at: null,
        current_period_start: now.toISOString(),
        current_period_end: paidUntil.toISOString(),
        active_until: paidUntil.toISOString(),
        updated_at: now.toISOString(),
      } as Record<string, unknown>,
      { onConflict: 'company_id' },
    );
}

/** Create or ensure profile exists in Supabase. Only upserts id so it works when profiles has no company column. */
export async function createCompanyUserProfile(params: {
  uid: string;
  companyId: string;
  name: string;
  email: string;
}): Promise<void> {
  const { uid, companyId, email } = params;
  await db
    .core()
    .from('profiles')
    .upsert(
      {
        clerk_user_id: uid,
        active_company_id: companyId,
      },
      { onConflict: 'clerk_user_id' },
    );
  await mirrorPublicProfileForClerkUser(uid, email || null, companyId);
}

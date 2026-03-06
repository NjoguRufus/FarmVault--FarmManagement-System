import { db } from '@/lib/db';

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
    userCount: row.user_count != null ? Number(row.user_count) : undefined,
    projectCount: row.project_count != null ? Number(row.project_count) : undefined,
    revenue: row.revenue != null ? Number(row.revenue) : undefined,
    createdAt: row.created_at ?? undefined,
    subscription: sub ?? undefined,
    subscriptionPlan: sub?.plan ?? undefined,
  };
}

export async function getCompany(companyId: string): Promise<CompanyDoc | null> {
  const { data, error } = await db
    .core()
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .maybeSingle();

  if (error || !data) return null;
  return mapRowToCompanyDoc(data as Record<string, unknown>);
}

/** List all companies (developer use, e.g. share records). */
export async function listCompanies(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db.core().from('companies').select('id, name');

  if (error || !data) return [];
  return (data as { id: string; name: string }[]).map((r) => ({
    id: r.id,
    name: r.name ?? r.id,
  }));
}

export async function setPaymentReminder(companyId: string, nextPaymentAt?: Date): Promise<void> {
  const { data } = await db.core().from('companies').select('subscription').eq('id', companyId).single();
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
  const { data } = await db.core().from('companies').select('subscription').eq('id', companyId).single();
  const subscription = (data?.subscription as Record<string, unknown>) ?? {};
  const updates: Record<string, unknown> = { ...subscription, paymentReminderActive: false };
  if (dismissedByUserId) {
    updates.paymentReminderDismissedAt = new Date().toISOString();
    updates.paymentReminderDismissedBy = dismissedByUserId;
  }
  await db.core().from('companies').update({ subscription: updates, updated_at: new Date().toISOString() }).eq('id', companyId);
}

export async function setCompanyNextPayment(companyId: string, nextPaymentAt: Date): Promise<void> {
  const { data } = await db.core().from('companies').select('subscription').eq('id', companyId).single();
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
  }
): Promise<void> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.plan !== undefined) updates.plan = data.plan;
  if (data.status !== undefined) updates.status = data.status;
  if (data.customWorkTypes !== undefined) updates.custom_work_types = data.customWorkTypes;
  if (Object.keys(updates).length <= 1) return;
  await db.core().from('companies').update(updates).eq('id', companyId);
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

  const { data } = await db.core().from('companies').select('subscription').eq('id', companyId).single();
  const subscription = ((data?.subscription as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  await db
    .core()
    .from('companies')
    .update({
      plan: legacyPlan,
      subscription: {
        ...subscription,
        plan,
        status: 'active',
        billingMode: mode,
        paidUntil: paidUntil.toISOString(),
      },
      updated_at: now.toISOString(),
    })
    .eq('id', companyId);
}

/** Create or ensure profile exists in Supabase. Only upserts id so it works when profiles has no company column. */
export async function createCompanyUserProfile(params: {
  uid: string;
  companyId: string;
  name: string;
  email: string;
}): Promise<void> {
  const { uid, companyId } = params;
  await db
    .core()
    .from('profiles')
    .upsert(
      {
        id: uid,
        clerk_user_id: uid,
        active_company_id: companyId,
      },
      { onConflict: 'clerk_user_id' },
    );
}

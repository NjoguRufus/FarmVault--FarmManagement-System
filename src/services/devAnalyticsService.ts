import { db } from '@/lib/db';
import { TABLES } from '@/lib/tables';
import { supabase } from '@/lib/supabase';

export interface PlatformStats {
  companies: number;
  users: number;
  employees: number;
  activeSubscriptions: number;
  trialUsers: number;
  pendingPayments: number;
  monthlyRevenue: number;
}

type FilterBuilder = (q: any) => any;

async function countExact(
  table: string,
  options: { filter?: FilterBuilder } = {},
): Promise<number> {
  const { filter } = options;
  try {
    let query;
    // Billing schema: use .schema('billing').from('company_subscriptions'); never supabase.from('billing.*')
    if (table === 'billing.company_subscriptions') {
      query = supabase.schema('billing').from('company_subscriptions').select('*', {
        count: 'exact',
        head: true,
      });
    } else if (table.includes('.')) {
      query = supabase.from(table).select('*', {
        count: 'exact',
        head: true,
      });
    } else {
      query = db.public().from(table).select('*', {
        count: 'exact',
        head: true,
      });
    }
    if (filter) {
      query = filter(query);
    }
    const { count, error } = await query;
    if (error) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[devAnalytics] countExact error', { table, error });
      }
      return 0;
    }
    return count ?? 0;
  } catch (e) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[devAnalytics] countExact exception', { table, error: e });
    }
    return 0;
  }
}

async function countEmployees(): Promise<number> {
  // Primary: public.employees (canonical employees table).
  try {
    const count = await countExact(TABLES.EMPLOYEES);
    // If table exists and query succeeded, return it (0 is valid).
    return count;
  } catch {
    // fallthrough to fallback below
  }

  // Fallback: core.company_members excluding company_admins.
  const fallback = await countExact(TABLES.COMPANY_MEMBERS, {
    filter: (q) => q.neq('role', 'company_admin'),
  });
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn('[devAnalytics] Falling back to core.company_members for employees count');
  }
  return fallback;
}

async function computeMonthlyRevenue(): Promise<number> {
  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));

    const { data, error } = await supabase
      .from(TABLES.SUBSCRIPTION_PAYMENTS)
      .select('amount, status, created_at')
      .eq('status', 'paid')
      .gte('created_at', monthStart.toISOString())
      .lt('created_at', monthEnd.toISOString());

    if (error) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[devAnalytics] monthlyRevenue query error', error);
      }
      return 0;
    }

    const payments = (data ?? []) as { amount: unknown }[];
    return payments.reduce((sum, row) => {
      const n = Number((row as any).amount ?? 0);
      return Number.isFinite(n) ? sum + n : sum;
    }, 0);
  } catch (e) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[devAnalytics] monthlyRevenue exception', e);
    }
    return 0;
  }
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const now = new Date();

  const [
    companies,
    users,
    employees,
    activeSubscriptions,
    trialUsers,
    pendingPayments,
    monthlyRevenue,
  ] = await Promise.all([
    // Total companies – public.companies.
    countExact(TABLES.COMPANIES),

    // Total users – public.profiles.
    countExact(TABLES.PROFILES),

    // Employees – public.employees or core.company_members fallback.
    countEmployees(),

    // Active subscriptions – company_subscriptions with status = 'active'.
    countExact(TABLES.COMPANY_SUBSCRIPTIONS, {
      filter: (q) => q.eq('status', 'active'),
    }),

    // Trial users – company_subscriptions with non-expired trial_ends_at.
    countExact(TABLES.COMPANY_SUBSCRIPTIONS, {
      filter: (q) => q.gte('trial_ends_at', now.toISOString()),
    }),

    // Pending payments – subscription_payments with status = 'pending'.
    countExact(TABLES.SUBSCRIPTION_PAYMENTS, {
      filter: (q) => q.eq('status', 'pending'),
    }),

    // Monthly revenue – sum of paid subscription_payments for current month.
    computeMonthlyRevenue(),
  ]);

  return {
    companies,
    users,
    employees,
    activeSubscriptions,
    trialUsers,
    pendingPayments,
    monthlyRevenue,
  };
}


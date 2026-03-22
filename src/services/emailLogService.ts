import { supabase } from '@/lib/supabase';

export type EmailLogStatus = 'pending' | 'sent' | 'failed';

export type EmailLogRow = {
  id: string;
  company_id: string | null;
  company_name: string | null;
  recipient_email: string;
  email_type: string;
  subject: string;
  status: EmailLogStatus;
  provider: string;
  provider_message_id: string | null;
  triggered_by: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  sent_at: string | null;
};

export const FARMVAULT_EMAIL_TYPES = [
  'welcome',
  'subscription_activated',
  'trial_ending',
  'company_approved',
] as const;

export type FarmVaultEmailTypeFilter = (typeof FARMVAULT_EMAIL_TYPES)[number] | 'all';

export type EmailLogListFilters = {
  search?: string;
  emailType?: FarmVaultEmailTypeFilter;
  status?: EmailLogStatus | 'all';
  dateFrom?: string | null;
  dateTo?: string | null;
  limit?: number;
};

export async function fetchEmailLogs(filters: EmailLogListFilters): Promise<EmailLogRow[]> {
  const limit = Math.min(filters.limit ?? 100, 500);
  let q = supabase.from('email_logs').select('*').order('created_at', { ascending: false }).limit(limit);

  if (filters.emailType && filters.emailType !== 'all') {
    q = q.eq('email_type', filters.emailType);
  }
  if (filters.status && filters.status !== 'all') {
    q = q.eq('status', filters.status);
  }
  if (filters.dateFrom) {
    q = q.gte('created_at', filters.dateFrom);
  }
  if (filters.dateTo) {
    q = q.lte('created_at', filters.dateTo);
  }

  const search = filters.search?.trim();
  if (search) {
    q = q.or(
      [`recipient_email.ilike.%${search}%`, `company_name.ilike.%${search}%`].join(','),
    );
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as EmailLogRow[]) ?? [];
}

export type EmailLogStats = {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  today: number;
};

export async function fetchEmailLogStats(): Promise<EmailLogStats> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const iso = start.toISOString();

  const [total, sent, failed, pending, today] = await Promise.all([
    supabase.from('email_logs').select('id', { count: 'exact', head: true }),
    supabase.from('email_logs').select('id', { count: 'exact', head: true }).eq('status', 'sent'),
    supabase.from('email_logs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    supabase.from('email_logs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('email_logs').select('id', { count: 'exact', head: true }).gte('created_at', iso),
  ]);

  const firstErr = [total, sent, failed, pending, today].find((r) => r.error);
  if (firstErr?.error) throw new Error(firstErr.error.message);

  return {
    total: total.count ?? 0,
    sent: sent.count ?? 0,
    failed: failed.count ?? 0,
    pending: pending.count ?? 0,
    today: today.count ?? 0,
  };
}

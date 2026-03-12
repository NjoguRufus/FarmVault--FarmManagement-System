-- Create admin_alerts table and enable real-time for it
-- This is required for Supabase real-time subscriptions to work

BEGIN;

-- Create admin_alerts table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  severity text not null default 'normal' check (severity in ('normal', 'high', 'critical')),
  module text not null,
  action text not null,
  actor_user_id text,
  actor_name text,
  target_id text,
  target_label text,
  metadata jsonb,
  detail_path text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_admin_alerts_company_created
  ON public.admin_alerts (company_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_company_read
  ON public.admin_alerts (company_id, read) WHERE read = false;

-- Enable RLS
ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid errors on re-run)
DROP POLICY IF EXISTS admin_alerts_select ON public.admin_alerts;
DROP POLICY IF EXISTS admin_alerts_insert ON public.admin_alerts;

-- Create RLS policies
CREATE POLICY admin_alerts_select ON public.admin_alerts FOR SELECT
  USING (true);

CREATE POLICY admin_alerts_insert ON public.admin_alerts FOR INSERT
  WITH CHECK (true);

-- Create alert_recipients table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.alert_recipients (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  clerk_user_id text not null,
  receive_in_app boolean not null default true,
  receive_push boolean not null default false,
  created_at timestamptz not null default now(),
  unique(company_id, clerk_user_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_recipients_company
  ON public.alert_recipients (company_id);

ALTER TABLE public.alert_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS alert_recipients_select ON public.alert_recipients;
DROP POLICY IF EXISTS alert_recipients_insert ON public.alert_recipients;
DROP POLICY IF EXISTS alert_recipients_update ON public.alert_recipients;
DROP POLICY IF EXISTS alert_recipients_delete ON public.alert_recipients;

CREATE POLICY alert_recipients_select ON public.alert_recipients FOR SELECT USING (true);
CREATE POLICY alert_recipients_insert ON public.alert_recipients FOR INSERT WITH CHECK (true);
CREATE POLICY alert_recipients_update ON public.alert_recipients FOR UPDATE USING (true);
CREATE POLICY alert_recipients_delete ON public.alert_recipients FOR DELETE USING (true);

COMMIT;

-- Enable real-time for admin_alerts (must be outside transaction)
-- This allows Supabase real-time subscriptions to receive INSERT events
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_alerts;

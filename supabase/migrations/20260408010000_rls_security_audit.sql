-- =============================================================================
-- FarmVault Security Audit: Enable RLS on tables missing row-level security.
-- Migration: 20260408010000_rls_security_audit
-- =============================================================================
-- SCOPE
--   Identified 11 tables with RLS disabled across 3 schemas.
--   All policies are additive (DROP POLICY IF EXISTS before CREATE POLICY).
--   Existing policies are NOT removed.
--   Service role bypasses RLS natively in Supabase (BYPASSRLS privilege) —
--   no explicit service_role policies are needed unless FORCE ROW LEVEL SECURITY
--   is applied (it is not used anywhere in this project).
--
-- TABLES SECURED
--   Schema core  (1 table)
--     1. core.companies                       — member/developer access
--   Schema public (7 tables, UUID company_id)
--     2. public.employee_project_access       — company isolation
--     3. public.employee_activity_logs        — company isolation, append-only
--     4. public.harvest_picker_entries        — company isolation
--     5. public.harvest_picker_totals         — company isolation
--     6. public.harvest_collection_totals     — company isolation
--     7. public.picker_payments               — company isolation
--     8. public.harvest_entry_events          — company isolation, append-only
--   Schema harvest (1 table)
--     9. harvest.harvest_collection_sequence_counters — project/company member
--   Schema admin (2 tables)
--    10. admin.subscription_overrides         — developer-only
--    11. admin.subscription_override_audit    — developer-only, read-only
--
-- TABLES SKIPPED (already have RLS + correct policies)
--   public: companies, profiles, employees, projects, project_stages, stage_notes,
--           project_blocks, work_logs, operations_work_cards, expenses,
--           season_challenges, needed_items, inventory_*, suppliers, harvests,
--           harvest_collections, harvest_pickers, picker_weigh_entries,
--           harvest_payment_batches, harvest_wallets, collection_cash_usage,
--           project_wallet_ledger, project_wallet_meta, sales, feedback,
--           audit_logs, activity_logs, crop_catalog, challenge_templates,
--           budget_pools, subscription_payments, company_subscriptions,
--           developer_actions_log, platform_expenses, code_red, code_red_messages,
--           developer_backups, developer_backup_snapshots, records_library,
--           company_records, company_record_shares, crops, deliveries,
--           custom_roles, harvest_cash_pools, company_members, subscriptions,
--           admin_alerts, alert_recipients, email_logs, push_subscriptions,
--           notifications, farm_notebook_entries, record_crop_catalog,
--           ambassadors, referrals, commissions, mpesa_stk_callbacks,
--           mpesa_payments, ambassador_earnings, billing_receipts,
--           referral_sessions, farmer_smart_messaging_state, farmer_smart_inbox,
--           ambassador_transactions, company_record_crops,
--           company_record_attachments, developer_crop_record_templates,
--           crop_knowledge_profiles, crop_knowledge_challenges,
--           crop_knowledge_practices, crop_knowledge_chemicals,
--           crop_knowledge_timing_windows, farm_notebook_admin_notes
--   core:   profiles, company_members, device_app_locks, billing_prices
--   admin:  developers, company_migrations, company_migration_items,
--           developer_delete_audit, reset_users
--   developer: farmvault_expenses, system_backups, code_red_incidents,
--              code_red_notes, company_records_outbox
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. core.companies
-- =============================================================================
-- No authenticated table-level grant exists today; this policy is preventive.
-- All create/update/delete flows go through SECURITY DEFINER functions which
-- bypass RLS, so this does not break onboarding, company creation, or settings.
-- Developers see all companies; regular users see only their own company.

ALTER TABLE core.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_select ON core.companies;
CREATE POLICY companies_select ON core.companies
  FOR SELECT TO authenticated
  USING (
    admin.is_developer()
    OR core.is_company_member(id)
  );

DROP POLICY IF EXISTS companies_insert ON core.companies;
CREATE POLICY companies_insert ON core.companies
  FOR INSERT TO authenticated
  WITH CHECK (core.current_user_id() IS NOT NULL);

DROP POLICY IF EXISTS companies_update ON core.companies;
CREATE POLICY companies_update ON core.companies
  FOR UPDATE TO authenticated
  USING (
    admin.is_developer()
    OR core.is_company_admin(id)
  );

DROP POLICY IF EXISTS companies_delete ON core.companies;
CREATE POLICY companies_delete ON core.companies
  FOR DELETE TO authenticated
  USING (admin.is_developer());

-- =============================================================================
-- 2. public.employee_project_access (UUID company_id)
-- =============================================================================
-- Controls which projects an employee can access.
-- All members of a company can read/write their company's access records.
-- Managers and admins insert/delete via SECURITY DEFINER functions which
-- bypass these policies; regular employees only need SELECT.

ALTER TABLE public.employee_project_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_project_access_select ON public.employee_project_access;
CREATE POLICY employee_project_access_select ON public.employee_project_access
  FOR SELECT TO authenticated
  USING (
    admin.is_developer()
    OR company_id = core.current_company_id()
  );

DROP POLICY IF EXISTS employee_project_access_insert ON public.employee_project_access;
CREATE POLICY employee_project_access_insert ON public.employee_project_access
  FOR INSERT TO authenticated
  WITH CHECK (
    admin.is_developer()
    OR company_id = core.current_company_id()
  );

DROP POLICY IF EXISTS employee_project_access_update ON public.employee_project_access;
CREATE POLICY employee_project_access_update ON public.employee_project_access
  FOR UPDATE TO authenticated
  USING (
    admin.is_developer()
    OR company_id = core.current_company_id()
  );

DROP POLICY IF EXISTS employee_project_access_delete ON public.employee_project_access;
CREATE POLICY employee_project_access_delete ON public.employee_project_access
  FOR DELETE TO authenticated
  USING (
    admin.is_developer()
    OR company_id = core.current_company_id()
  );

-- =============================================================================
-- 3. public.employee_activity_logs (UUID company_id, append-only audit log)
-- =============================================================================
-- Audit trail for employee management actions.
-- SELECT: company members; INSERT: company members (trigger/function driven);
-- No UPDATE or DELETE — this is an append-only audit table.

ALTER TABLE public.employee_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_activity_logs_select ON public.employee_activity_logs;
CREATE POLICY employee_activity_logs_select ON public.employee_activity_logs
  FOR SELECT TO authenticated
  USING (
    admin.is_developer()
    OR company_id = core.current_company_id()
  );

DROP POLICY IF EXISTS employee_activity_logs_insert ON public.employee_activity_logs;
CREATE POLICY employee_activity_logs_insert ON public.employee_activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    admin.is_developer()
    OR company_id = core.current_company_id()
  );

-- Intentionally no UPDATE or DELETE policies (append-only).

-- =============================================================================
-- 4. public.harvest_picker_entries (UUID company_id, high-volume)
-- =============================================================================
-- Individual picker weigh entries per harvest collection session.
-- All CRUD operations go through harvest workforce functions; direct
-- table access is also allowed for company members (offline sync writes).

ALTER TABLE public.harvest_picker_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS harvest_picker_entries_policy ON public.harvest_picker_entries;
CREATE POLICY harvest_picker_entries_policy ON public.harvest_picker_entries
  FOR ALL TO authenticated
  USING (
    admin.is_developer()
    OR company_id = core.current_company_id()
  )
  WITH CHECK (
    admin.is_developer()
    OR company_id = core.current_company_id()
  );

-- =============================================================================
-- 5. public.harvest_picker_totals (UUID company_id)
-- =============================================================================
-- Materialized totals per picker per collection (updated by triggers/functions).

ALTER TABLE public.harvest_picker_totals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS harvest_picker_totals_policy ON public.harvest_picker_totals;
CREATE POLICY harvest_picker_totals_policy ON public.harvest_picker_totals
  FOR ALL TO authenticated
  USING (
    admin.is_developer()
    OR company_id = core.current_company_id()
  )
  WITH CHECK (
    admin.is_developer()
    OR company_id = core.current_company_id()
  );

-- =============================================================================
-- 6. public.harvest_collection_totals (UUID company_id)
-- =============================================================================
-- Materialized collection-wide summary totals.

ALTER TABLE public.harvest_collection_totals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS harvest_collection_totals_policy ON public.harvest_collection_totals;
CREATE POLICY harvest_collection_totals_policy ON public.harvest_collection_totals
  FOR ALL TO authenticated
  USING (
    admin.is_developer()
    OR company_id = core.current_company_id()
  )
  WITH CHECK (
    admin.is_developer()
    OR company_id = core.current_company_id()
  );

-- =============================================================================
-- 7. public.picker_payments (UUID company_id)
-- =============================================================================
-- Cash/M-Pesa payments disbursed to pickers.

ALTER TABLE public.picker_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS picker_payments_policy ON public.picker_payments;
CREATE POLICY picker_payments_policy ON public.picker_payments
  FOR ALL TO authenticated
  USING (
    admin.is_developer()
    OR company_id = core.current_company_id()
  )
  WITH CHECK (
    admin.is_developer()
    OR company_id = core.current_company_id()
  );

-- =============================================================================
-- 8. public.harvest_entry_events (UUID company_id, append-only audit trail)
-- =============================================================================
-- Event log for corrections, syncs, and state changes on picker entries.
-- INSERT allowed for company members; no UPDATE or DELETE.

ALTER TABLE public.harvest_entry_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS harvest_entry_events_select ON public.harvest_entry_events;
CREATE POLICY harvest_entry_events_select ON public.harvest_entry_events
  FOR SELECT TO authenticated
  USING (
    admin.is_developer()
    OR company_id = core.current_company_id()
  );

DROP POLICY IF EXISTS harvest_entry_events_insert ON public.harvest_entry_events;
CREATE POLICY harvest_entry_events_insert ON public.harvest_entry_events
  FOR INSERT TO authenticated
  WITH CHECK (
    admin.is_developer()
    OR company_id = core.current_company_id()
  );

-- Intentionally no UPDATE or DELETE policies (append-only audit trail).

-- =============================================================================
-- 9. harvest.harvest_collection_sequence_counters (project_id FK only)
-- =============================================================================
-- Per-project forward-only sequence counter for harvest collection naming.
-- Has no company_id column; company membership is resolved via project ownership.
-- All normal access goes through SECURITY DEFINER RPCs (harvest.allocate_next_*
-- and harvest.preview_next_*) which bypass RLS. Direct table access is
-- restricted to company members who own the referenced project.

ALTER TABLE harvest.harvest_collection_sequence_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS harvest_seq_counters_select ON harvest.harvest_collection_sequence_counters;
CREATE POLICY harvest_seq_counters_select ON harvest.harvest_collection_sequence_counters
  FOR SELECT TO authenticated
  USING (
    admin.is_developer()
    OR core.is_company_member(
      (SELECT p.company_id FROM projects.projects p
       WHERE p.id = project_id
       LIMIT 1)
    )
  );

DROP POLICY IF EXISTS harvest_seq_counters_insert ON harvest.harvest_collection_sequence_counters;
CREATE POLICY harvest_seq_counters_insert ON harvest.harvest_collection_sequence_counters
  FOR INSERT TO authenticated
  WITH CHECK (
    admin.is_developer()
    OR core.is_company_member(
      (SELECT p.company_id FROM projects.projects p
       WHERE p.id = project_id
       LIMIT 1)
    )
  );

DROP POLICY IF EXISTS harvest_seq_counters_update ON harvest.harvest_collection_sequence_counters;
CREATE POLICY harvest_seq_counters_update ON harvest.harvest_collection_sequence_counters
  FOR UPDATE TO authenticated
  USING (
    admin.is_developer()
    OR core.is_company_member(
      (SELECT p.company_id FROM projects.projects p
       WHERE p.id = project_id
       LIMIT 1)
    )
  );

DROP POLICY IF EXISTS harvest_seq_counters_delete ON harvest.harvest_collection_sequence_counters;
CREATE POLICY harvest_seq_counters_delete ON harvest.harvest_collection_sequence_counters
  FOR DELETE TO authenticated
  USING (admin.is_developer());

-- =============================================================================
-- 10. admin.subscription_overrides (developer-only)
-- =============================================================================
-- Developer-managed subscription override records.
-- No table-level grant exists for authenticated today (defense-in-depth).
-- All writes go through the override_subscription() SECURITY DEFINER RPC.

ALTER TABLE admin.subscription_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_overrides_policy ON admin.subscription_overrides;
CREATE POLICY subscription_overrides_policy ON admin.subscription_overrides
  FOR ALL TO authenticated
  USING (admin.is_developer())
  WITH CHECK (admin.is_developer());

-- =============================================================================
-- 11. admin.subscription_override_audit (developer read-only, append-only)
-- =============================================================================
-- Immutable audit log for all subscription override actions.
-- Inserts happen via the override_subscription() SECURITY DEFINER RPC
-- (service role context); authenticated may only read if developer.

ALTER TABLE admin.subscription_override_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_override_audit_select ON admin.subscription_override_audit;
CREATE POLICY subscription_override_audit_select ON admin.subscription_override_audit
  FOR SELECT TO authenticated
  USING (admin.is_developer());

-- Intentionally no INSERT / UPDATE / DELETE for authenticated (service role only).

-- =============================================================================
-- VERIFICATION QUERIES (run manually in Supabase SQL editor to confirm)
-- =============================================================================
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname IN ('core', 'public', 'harvest', 'admin')
--   AND tablename IN (
--     'companies', 'employee_project_access', 'employee_activity_logs',
--     'harvest_picker_entries', 'harvest_picker_totals', 'harvest_collection_totals',
--     'picker_payments', 'harvest_entry_events',
--     'harvest_collection_sequence_counters',
--     'subscription_overrides', 'subscription_override_audit'
--   )
-- ORDER BY schemaname, tablename;
--
-- Expected: rowsecurity = true for all rows above.
--
-- SELECT schemaname, tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname IN ('core', 'public', 'harvest', 'admin')
--   AND tablename IN (
--     'companies', 'employee_project_access', 'employee_activity_logs',
--     'harvest_picker_entries', 'harvest_picker_totals', 'harvest_collection_totals',
--     'picker_payments', 'harvest_entry_events',
--     'harvest_collection_sequence_counters',
--     'subscription_overrides', 'subscription_override_audit'
--   )
-- ORDER BY schemaname, tablename, policyname;
-- =============================================================================

COMMIT;

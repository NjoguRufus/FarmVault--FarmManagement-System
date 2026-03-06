-- FarmVault RLS policies — production-grade tenant isolation.
-- Depends on 0001_farmvault_schema.sql. No app code changes.

-- ============== RLS HELPER FUNCTIONS ==============

-- Current user's company_id from profiles (null if not set or no profile).
CREATE OR REPLACE FUNCTION current_company_id()
RETURNS TEXT AS $$
  SELECT company_id FROM profiles WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- True if current user has role 'developer' in profiles or JWT claim (optional later).
CREATE OR REPLACE FUNCTION is_developer()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
      AND (role = 'developer' OR role = 'company_admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- True if current user is company-admin for their company.
CREATE OR REPLACE FUNCTION is_company_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
      AND (role = 'company-admin' OR role = 'company_admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- True if current user is manager (role or employee_role).
CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    LEFT JOIN employees e ON e.auth_user_id = p.user_id AND e.company_id = p.company_id
    WHERE p.user_id = auth.uid()
      AND (
        p.role = 'manager'
        OR p.employee_role IN ('manager', 'operations-manager')
        OR e.employee_role IN ('manager', 'operations-manager')
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Row belongs to current user's company (or user has no company for onboarding).
CREATE OR REPLACE FUNCTION row_company_matches_user(row_company_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT row_company_id IS NOT NULL AND row_company_id = current_company_id()
     OR (current_company_id() IS NULL AND row_company_id IS NULL);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============== ENABLE RLS ON ALL TENANT TABLES ==============

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations_work_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE needed_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE harvests ENABLE ROW LEVEL SECURITY;
ALTER TABLE harvest_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE harvest_pickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE picker_weigh_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE harvest_payment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE harvest_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_cash_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_wallet_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crop_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE developer_actions_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_red ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_red_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE developer_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE developer_backup_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE records_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_record_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE crops ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE harvest_cash_pools ENABLE ROW LEVEL SECURITY;

-- ============== POLICIES: companies ==============
-- Create: any signed-in (onboarding). Read/update/delete: own company or developer.
CREATE POLICY companies_select ON companies FOR SELECT
  USING (is_developer() OR id = current_company_id());
CREATE POLICY companies_insert ON companies FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY companies_update ON companies FOR UPDATE
  USING (is_developer() OR id = current_company_id());
CREATE POLICY companies_delete ON companies FOR DELETE
  USING (is_developer() OR id = current_company_id());

-- ============== POLICIES: profiles ==============
-- Users can read/update own profile; company-admin/developer can read same-company; developer all.
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (
    auth.uid() = user_id
    OR (current_company_id() IS NOT NULL AND company_id = current_company_id())
    OR is_developer()
  );
CREATE POLICY profiles_insert ON profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_developer());
CREATE POLICY profiles_update ON profiles FOR UPDATE
  USING (auth.uid() = user_id OR (is_company_admin() AND company_id = current_company_id()) OR is_developer());
CREATE POLICY profiles_delete ON profiles FOR DELETE
  USING (auth.uid() = user_id OR is_developer());

-- ============== POLICIES: employees ==============
CREATE POLICY employees_select ON employees FOR SELECT
  USING (
    is_developer()
    OR row_company_matches_user(company_id)
    OR auth_user_id = auth.uid()
  );
CREATE POLICY employees_insert ON employees FOR INSERT
  WITH CHECK (
    is_developer()
    OR (is_company_admin() AND company_id = current_company_id())
    OR (is_manager() AND company_id = current_company_id())
  );
CREATE POLICY employees_update ON employees FOR UPDATE
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY employees_delete ON employees FOR DELETE
  USING (is_developer() OR row_company_matches_user(company_id));

-- ============== POLICIES: projects ==============
CREATE POLICY projects_select ON projects FOR SELECT
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY projects_insert ON projects FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));
CREATE POLICY projects_update ON projects FOR UPDATE
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY projects_delete ON projects FOR DELETE
  USING (is_developer() OR row_company_matches_user(company_id));

-- ============== POLICIES: project_stages ==============
CREATE POLICY project_stages_select ON project_stages FOR SELECT
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY project_stages_insert ON project_stages FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));
CREATE POLICY project_stages_update ON project_stages FOR UPDATE
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY project_stages_delete ON project_stages FOR DELETE
  USING (is_developer() OR row_company_matches_user(company_id));

-- ============== POLICIES: stage_notes ==============
CREATE POLICY stage_notes_select ON stage_notes FOR SELECT
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY stage_notes_insert ON stage_notes FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));
CREATE POLICY stage_notes_update ON stage_notes FOR UPDATE
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY stage_notes_delete ON stage_notes FOR DELETE
  USING (is_developer() OR row_company_matches_user(company_id));

-- ============== POLICIES: project_blocks ==============
CREATE POLICY project_blocks_select ON project_blocks FOR SELECT
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY project_blocks_insert ON project_blocks FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));
CREATE POLICY project_blocks_update ON project_blocks FOR UPDATE
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY project_blocks_delete ON project_blocks FOR DELETE
  USING (is_developer() OR row_company_matches_user(company_id));

-- ============== POLICIES: work_logs ==============
CREATE POLICY work_logs_select ON work_logs FOR SELECT
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY work_logs_insert ON work_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));
CREATE POLICY work_logs_update ON work_logs FOR UPDATE
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY work_logs_delete ON work_logs FOR DELETE
  USING (is_developer() OR row_company_matches_user(company_id));

-- ============== POLICIES: operations_work_cards ==============
CREATE POLICY operations_work_cards_select ON operations_work_cards FOR SELECT
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY operations_work_cards_insert ON operations_work_cards FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));
CREATE POLICY operations_work_cards_update ON operations_work_cards FOR UPDATE
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY operations_work_cards_delete ON operations_work_cards FOR DELETE
  USING (is_developer() OR row_company_matches_user(company_id));

-- ============== POLICIES: expenses ==============
CREATE POLICY expenses_select ON expenses FOR SELECT
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY expenses_insert ON expenses FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));
CREATE POLICY expenses_update ON expenses FOR UPDATE
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY expenses_delete ON expenses FOR DELETE
  USING (is_developer() OR row_company_matches_user(company_id));

-- ============== POLICIES: season_challenges, needed_items ==============
CREATE POLICY season_challenges_select ON season_challenges FOR SELECT
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY season_challenges_insert ON season_challenges FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));
CREATE POLICY season_challenges_update ON season_challenges FOR UPDATE
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY season_challenges_delete ON season_challenges FOR DELETE
  USING (is_developer() OR row_company_matches_user(company_id));

CREATE POLICY needed_items_select ON needed_items FOR SELECT
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY needed_items_insert ON needed_items FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));
CREATE POLICY needed_items_update ON needed_items FOR UPDATE
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY needed_items_delete ON needed_items FOR DELETE
  USING (is_developer() OR row_company_matches_user(company_id));

-- ============== POLICIES: inventory_* ==============
CREATE POLICY inventory_categories_policy ON inventory_categories FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

CREATE POLICY inventory_items_policy ON inventory_items FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

CREATE POLICY inventory_purchases_policy ON inventory_purchases FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

CREATE POLICY inventory_usage_policy ON inventory_usage FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

CREATE POLICY inventory_audit_logs_select ON inventory_audit_logs FOR SELECT
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY inventory_audit_logs_insert ON inventory_audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));
-- No update/delete (append-only)

-- ============== POLICIES: suppliers ==============
CREATE POLICY suppliers_policy ON suppliers FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

-- ============== POLICIES: harvests, harvest_collections, harvest_pickers, etc. ==============
CREATE POLICY harvests_policy ON harvests FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

CREATE POLICY harvest_collections_policy ON harvest_collections FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

CREATE POLICY harvest_pickers_policy ON harvest_pickers FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

CREATE POLICY picker_weigh_entries_policy ON picker_weigh_entries FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

CREATE POLICY harvest_payment_batches_policy ON harvest_payment_batches FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

CREATE POLICY harvest_wallets_policy ON harvest_wallets FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

CREATE POLICY collection_cash_usage_policy ON collection_cash_usage FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

-- ============== POLICIES: project_wallet_ledger (append-only: no update/delete) ==============
CREATE POLICY project_wallet_ledger_select ON project_wallet_ledger FOR SELECT
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY project_wallet_ledger_insert ON project_wallet_ledger FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));
-- No update/delete

CREATE POLICY project_wallet_meta_policy ON project_wallet_meta FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

-- ============== POLICIES: sales, feedback ==============
CREATE POLICY sales_policy ON sales FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

CREATE POLICY feedback_policy ON feedback FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============== POLICIES: audit_logs (append-only; read developer-only) ==============
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT
  USING (is_developer());
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
-- No update/delete

-- ============== POLICIES: activity_logs (append-only) ==============
CREATE POLICY activity_logs_select ON activity_logs FOR SELECT
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY activity_logs_insert ON activity_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));
-- No update/delete

-- ============== POLICIES: crop_catalog, challenge_templates, budget_pools ==============
CREATE POLICY crop_catalog_policy ON crop_catalog FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

CREATE POLICY challenge_templates_policy ON challenge_templates FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

CREATE POLICY budget_pools_policy ON budget_pools FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

-- ============== POLICIES: subscription_payments ==============
CREATE POLICY subscription_payments_select ON subscription_payments FOR SELECT
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY subscription_payments_insert ON subscription_payments FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND company_id = current_company_id());
CREATE POLICY subscription_payments_update ON subscription_payments FOR UPDATE
  USING (is_developer());
-- No delete

-- ============== POLICIES: company_subscriptions ==============
CREATE POLICY company_subscriptions_select ON company_subscriptions FOR SELECT
  USING (is_developer() OR company_id = current_company_id());
CREATE POLICY company_subscriptions_insert ON company_subscriptions FOR INSERT
  WITH CHECK (is_developer());
CREATE POLICY company_subscriptions_update ON company_subscriptions FOR UPDATE
  USING (is_developer());

-- ============== POLICIES: developer-only tables ==============
CREATE POLICY developer_actions_log_policy ON developer_actions_log FOR ALL
  USING (is_developer())
  WITH CHECK (is_developer());

CREATE POLICY platform_expenses_policy ON platform_expenses FOR ALL
  USING (is_developer())
  WITH CHECK (is_developer());

-- ============== POLICIES: code_red, code_red_messages ==============
CREATE POLICY code_red_policy ON code_red FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

CREATE POLICY code_red_messages_policy ON code_red_messages FOR ALL
  USING (
    is_developer()
    OR EXISTS (
      SELECT 1 FROM code_red cr
      WHERE cr.id = code_red_messages.code_red_id
        AND cr.company_id = current_company_id()
    )
  )
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============== POLICIES: developer_backups, developer_backup_snapshots ==============
CREATE POLICY developer_backups_policy ON developer_backups FOR ALL
  USING (is_developer() OR company_id = current_company_id())
  WITH CHECK (is_developer() OR company_id = current_company_id());

CREATE POLICY developer_backup_snapshots_policy ON developer_backup_snapshots FOR ALL
  USING (
    is_developer()
    OR EXISTS (
      SELECT 1 FROM developer_backups db
      WHERE db.company_id = developer_backup_snapshots.backup_id
        AND db.company_id = current_company_id()
    )
  )
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============== POLICIES: records_library (developer-only; no company_id) ==============
CREATE POLICY records_library_policy ON records_library FOR ALL
  USING (is_developer())
  WITH CHECK (is_developer());

-- ============== POLICIES: company_records ==============
CREATE POLICY company_records_select ON company_records FOR SELECT
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY company_records_insert ON company_records FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND company_id = current_company_id());
CREATE POLICY company_records_update ON company_records FOR UPDATE
  USING (is_developer() OR (row_company_matches_user(company_id) AND created_by = auth.uid()::TEXT));
CREATE POLICY company_records_delete ON company_records FOR DELETE
  USING (is_developer() OR (row_company_matches_user(company_id) AND created_by = auth.uid()::TEXT));

-- ============== POLICIES: company_record_shares (developer write; company read) ==============
CREATE POLICY company_record_shares_select ON company_record_shares FOR SELECT
  USING (is_developer() OR row_company_matches_user(company_id));
CREATE POLICY company_record_shares_insert ON company_record_shares FOR INSERT
  WITH CHECK (is_developer());
CREATE POLICY company_record_shares_update ON company_record_shares FOR UPDATE
  WITH CHECK (is_developer());
CREATE POLICY company_record_shares_delete ON company_record_shares FOR DELETE
  USING (is_developer());

-- ============== POLICIES: crops (all read; developer write) ==============
CREATE POLICY crops_select ON crops FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY crops_insert ON crops FOR INSERT
  WITH CHECK (is_developer());
CREATE POLICY crops_update ON crops FOR UPDATE
  USING (is_developer());
CREATE POLICY crops_delete ON crops FOR DELETE
  USING (is_developer());

-- ============== POLICIES: deliveries, custom_roles, harvest_cash_pools ==============
CREATE POLICY deliveries_policy ON deliveries FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

CREATE POLICY custom_roles_policy ON custom_roles FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

CREATE POLICY harvest_cash_pools_policy ON harvest_cash_pools FOR ALL
  USING (is_developer() OR row_company_matches_user(company_id))
  WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

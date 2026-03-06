-- FarmVault indexes for all known query patterns (from Firebase audit).
-- Depends on 0001_farmvault_schema.sql. Safe to run after 0002.

-- ============== subscription_payments ==============
CREATE INDEX IF NOT EXISTS idx_subscription_payments_status_created_at
  ON subscription_payments (status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_company_status_created
  ON subscription_payments (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_billing_plan_created
  ON subscription_payments (company_id, billing_mode, plan_id, created_at DESC);

-- ============== code_red ==============
CREATE INDEX IF NOT EXISTS idx_code_red_company_updated
  ON code_red (company_id, updated_at DESC);

-- ============== work_logs ==============
CREATE INDEX IF NOT EXISTS idx_work_logs_company_project_date_paid_rate
  ON work_logs (company_id, project_id, date ASC, paid, rate_per_person);
CREATE INDEX IF NOT EXISTS idx_work_logs_company_project_date
  ON work_logs (company_id, project_id, date DESC);

-- ============== project_blocks ==============
CREATE INDEX IF NOT EXISTS idx_project_blocks_company_project_created_asc
  ON project_blocks (company_id, project_id, created_at ASC);

-- ============== budget_pools ==============
CREATE INDEX IF NOT EXISTS idx_budget_pools_company_created_desc
  ON budget_pools (company_id, created_at DESC);

-- ============== records_library ==============
CREATE INDEX IF NOT EXISTS idx_records_library_crop_created_desc
  ON records_library (crop_id, created_at DESC);

-- ============== company_records ==============
CREATE INDEX IF NOT EXISTS idx_company_records_company_crop_created_desc
  ON company_records (company_id, crop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_records_crop_created_desc
  ON company_records (crop_id, created_at DESC);

-- ============== company_record_shares ==============
CREATE INDEX IF NOT EXISTS idx_company_record_shares_company_crop_visibility_shared
  ON company_record_shares (company_id, crop_id, visibility, shared_at DESC);

-- ============== activity_logs ==============
CREATE INDEX IF NOT EXISTS idx_activity_logs_company_project_created_desc
  ON activity_logs (company_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_company_created_desc
  ON activity_logs (company_id, created_at DESC);

-- ============== stage_notes ==============
CREATE INDEX IF NOT EXISTS idx_stage_notes_company_project_stage_created_desc
  ON stage_notes (company_id, project_id, stage_id, created_at DESC);

-- ============== harvest_pickers ==============
CREATE INDEX IF NOT EXISTS idx_harvest_pickers_company_collection
  ON harvest_pickers (company_id, collection_id);

-- ============== picker_weigh_entries ==============
CREATE INDEX IF NOT EXISTS idx_picker_weigh_entries_collection_picker
  ON picker_weigh_entries (collection_id, picker_id);

-- ============== operations_work_cards ==============
CREATE INDEX IF NOT EXISTS idx_operations_work_cards_company_allocated_manager
  ON operations_work_cards (company_id, allocated_manager_id);
CREATE INDEX IF NOT EXISTS idx_operations_work_cards_company_project
  ON operations_work_cards (company_id, project_id);

-- ============== project_wallet_ledger ==============
CREATE INDEX IF NOT EXISTS idx_project_wallet_ledger_company_project_created_desc
  ON project_wallet_ledger (company_id, project_id, created_at DESC);

-- ============== expenses ==============
CREATE INDEX IF NOT EXISTS idx_expenses_company_project_date
  ON expenses (company_id, project_id, date DESC);

-- ============== harvest_collections ==============
CREATE INDEX IF NOT EXISTS idx_harvest_collections_company_project_status
  ON harvest_collections (company_id, project_id, status);

-- ============== harvest_payment_batches ==============
CREATE INDEX IF NOT EXISTS idx_harvest_payment_batches_collection_created
  ON harvest_payment_batches (collection_id, created_at DESC);

-- ============== audit_logs ==============
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created
  ON audit_logs (company_id, created_at DESC);

-- ============== inventory_audit_logs ==============
CREATE INDEX IF NOT EXISTS idx_inventory_audit_logs_company_created
  ON inventory_audit_logs (company_id, created_at DESC);

-- ============== feedback ==============
CREATE INDEX IF NOT EXISTS idx_feedback_created_desc
  ON feedback (created_at DESC);

-- ============== projects (common list queries) ==============
CREATE INDEX IF NOT EXISTS idx_projects_company_status
  ON projects (company_id, status);

-- ============== employees (lookup by company) ==============
CREATE INDEX IF NOT EXISTS idx_employees_company_status
  ON employees (company_id, status);

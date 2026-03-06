-- FarmVault Supabase schema — mirrors Firebase/Firestore data model.
-- Run after Supabase project is created. No app code changes.

-- Extensions (Supabase usually has these)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============== ENUMS ==============
CREATE TYPE app_user_role AS ENUM (
  'developer', 'company-admin', 'company_admin', 'manager', 'broker', 'employee'
);

CREATE TYPE company_status AS ENUM ('active', 'inactive', 'pending');

CREATE TYPE company_plan AS ENUM ('starter', 'professional', 'enterprise');

CREATE TYPE project_status AS ENUM ('planning', 'active', 'completed', 'archived');

CREATE TYPE environment_type AS ENUM ('open_field', 'greenhouse');

CREATE TYPE stage_status AS ENUM ('pending', 'in-progress', 'completed');

CREATE TYPE expense_category AS ENUM (
  'labour', 'fertilizer', 'chemical', 'fuel', 'other',
  'space', 'watchman', 'ropes', 'carton', 'offloading_labour', 'onloading_labour', 'broker_payment'
);

CREATE TYPE inventory_category AS ENUM (
  'fertilizer', 'chemical', 'fuel', 'diesel', 'materials', 'sacks', 'ropes', 'wooden-crates', 'seeds'
);

CREATE TYPE harvest_collection_status AS ENUM ('collecting', 'closed');

CREATE TYPE record_category AS ENUM (
  'Timing', 'Fertilizer', 'Pests & Diseases', 'Sprays', 'Yield', 'General'
);

CREATE TYPE record_status AS ENUM ('draft', 'published');

CREATE TYPE employee_status AS ENUM ('active', 'inactive', 'on-leave');

CREATE TYPE subscription_payment_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE ledger_entry_type AS ENUM ('credit', 'debit');

-- ============== TENANT: companies ==============
CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status company_status NOT NULL DEFAULT 'active',
  plan company_plan NOT NULL DEFAULT 'starter',
  user_count INT DEFAULT 0,
  project_count INT DEFAULT 0,
  revenue NUMERIC(14,2) DEFAULT 0,
  custom_work_types TEXT[],
  subscription JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============== AUTH: profiles (1:1 with auth.users) ==============
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  employee_role TEXT,
  permissions JSONB,
  name TEXT,
  email TEXT,
  avatar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_company_id ON profiles(company_id);

-- ============== employees ==============
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  contact TEXT,
  role TEXT,
  employee_role TEXT,
  department TEXT,
  status employee_status NOT NULL DEFAULT 'active',
  permissions JSONB,
  join_date DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employees_company_id ON employees(company_id);
CREATE INDEX idx_employees_auth_user_id ON employees(auth_user_id);

-- ============== projects ==============
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  crop_type TEXT NOT NULL,
  crop_type_key TEXT,
  environment_type environment_type,
  status project_status NOT NULL DEFAULT 'planning',
  start_date DATE NOT NULL,
  end_date DATE,
  location TEXT,
  acreage NUMERIC(10,2) DEFAULT 0,
  budget NUMERIC(14,2) DEFAULT 0,
  planting_date DATE,
  starting_stage_index INT,
  current_stage TEXT,
  stage_selected TEXT,
  stage_auto_detected TEXT,
  stage_was_manually_overridden BOOLEAN DEFAULT FALSE,
  days_since_planting INT,
  seed_variety TEXT,
  plan_notes TEXT,
  setup_complete BOOLEAN DEFAULT FALSE,
  use_blocks BOOLEAN DEFAULT FALSE,
  budget_pool_id UUID,
  planning JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_company_id ON projects(company_id);

-- ============== project_stages ==============
CREATE TABLE project_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  crop_type TEXT NOT NULL,
  stage_name TEXT NOT NULL,
  stage_index INT NOT NULL,
  start_date DATE,
  end_date DATE,
  planned_start_date DATE,
  planned_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  status stage_status DEFAULT 'pending',
  notes TEXT,
  recalculated BOOLEAN DEFAULT FALSE,
  recalculated_at TIMESTAMPTZ,
  recalculation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_stages_project_id ON project_stages(project_id);
CREATE INDEX idx_project_stages_company_project_crop ON project_stages(company_id, project_id, crop_type);

-- ============== stage_notes ==============
CREATE TABLE stage_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES project_stages(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stage_notes_stage_id ON stage_notes(stage_id);
CREATE INDEX idx_stage_notes_company_project_stage ON stage_notes(company_id, project_id, stage_id);

-- ============== project_blocks ==============
CREATE TABLE project_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  block_name TEXT NOT NULL,
  acreage NUMERIC(10,2) NOT NULL,
  planting_date DATE,
  expected_end_date DATE,
  current_stage TEXT,
  season_progress NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_blocks_company_project ON project_blocks(company_id, project_id);

-- ============== work_logs ==============
CREATE TABLE work_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  crop_type TEXT NOT NULL,
  stage_index INT NOT NULL,
  stage_name TEXT NOT NULL,
  date DATE NOT NULL,
  work_category TEXT NOT NULL,
  work_type TEXT,
  number_of_people INT NOT NULL DEFAULT 0,
  rate_per_person NUMERIC(12,2),
  total_price NUMERIC(14,2),
  employee_id UUID REFERENCES employees(id),
  employee_ids UUID[],
  employee_name TEXT,
  chemicals JSONB,
  fertilizer JSONB,
  fuel JSONB,
  notes TEXT,
  inputs_used TEXT,
  watering_containers_used INT,
  tying_used_type TEXT,
  change_reason TEXT,
  manager_id TEXT,
  manager_name TEXT,
  admin_name TEXT,
  paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  paid_by TEXT,
  origin TEXT,
  parent_work_log_id UUID,
  manager_submission_status TEXT,
  manager_submitted_at TIMESTAMPTZ,
  manager_submitted_number_of_people INT,
  manager_submitted_rate_per_person NUMERIC(12,2),
  manager_submitted_total_price NUMERIC(14,2),
  manager_submitted_notes TEXT,
  manager_submitted_inputs_used TEXT,
  manager_submitted_work_type TEXT,
  approved_by TEXT,
  approved_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_work_logs_company_project ON work_logs(company_id, project_id);
CREATE INDEX idx_work_logs_date ON work_logs(date);

-- ============== operations_work_cards ==============
CREATE TABLE operations_work_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  allocated_manager_id UUID REFERENCES employees(id),
  status TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_operations_work_cards_company ON operations_work_cards(company_id);
CREATE INDEX idx_operations_work_cards_allocated_manager ON operations_work_cards(allocated_manager_id);

-- ============== expenses ==============
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  crop_type TEXT,
  harvest_id UUID,
  category expense_category NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  date DATE NOT NULL,
  stage_index INT,
  stage_name TEXT,
  synced_from_work_log_id UUID REFERENCES work_logs(id),
  synced BOOLEAN DEFAULT FALSE,
  work_card_id UUID REFERENCES operations_work_cards(id),
  paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  paid_by TEXT,
  paid_by_name TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_company_id ON expenses(company_id);
CREATE INDEX idx_expenses_project_id ON expenses(project_id);
CREATE INDEX idx_expenses_date ON expenses(date);

-- ============== season_challenges ==============
CREATE TABLE season_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  crop_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  challenge_type TEXT,
  stage_index INT,
  stage_name TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'identified',
  date_identified DATE NOT NULL,
  date_resolved DATE,
  what_was_done TEXT,
  items_used JSONB,
  plan2_if_fails TEXT,
  source TEXT,
  source_plan_challenge_id TEXT,
  created_by TEXT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_season_challenges_company_project ON season_challenges(company_id, project_id);

-- ============== needed_items ==============
CREATE TABLE needed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id),
  item_name TEXT NOT NULL,
  category inventory_category NOT NULL,
  quantity NUMERIC(12,2) NOT NULL,
  unit TEXT NOT NULL,
  source_challenge_id UUID REFERENCES season_challenges(id),
  source_challenge_title TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_needed_items_company_id ON needed_items(company_id);

-- ============== inventory_categories ==============
CREATE TABLE inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_categories_company_id ON inventory_categories(company_id);

-- ============== suppliers ==============
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact TEXT,
  email TEXT,
  category TEXT,
  categories TEXT[],
  rating INT DEFAULT 0,
  status TEXT DEFAULT 'active',
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_suppliers_company_id ON suppliers(company_id);

-- ============== inventory_items ==============
CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category inventory_category NOT NULL,
  quantity NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  price_per_unit NUMERIC(12,2),
  packaging_type TEXT,
  units_per_box INT,
  fuel_type TEXT,
  containers INT,
  litres NUMERIC(10,2),
  bags INT,
  kgs NUMERIC(10,2),
  box_size TEXT,
  scope TEXT,
  crop_type TEXT,
  crop_types TEXT[],
  supplier_id UUID REFERENCES suppliers(id),
  supplier_name TEXT,
  pickup_date DATE,
  min_threshold NUMERIC(12,2),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_items_company_id ON inventory_items(company_id);

-- ============== inventory_purchases ==============
CREATE TABLE inventory_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity_added NUMERIC(14,2) NOT NULL,
  unit TEXT NOT NULL,
  total_cost NUMERIC(14,2) NOT NULL,
  price_per_unit NUMERIC(12,2),
  project_id UUID REFERENCES projects(id),
  date DATE NOT NULL,
  expense_id UUID REFERENCES expenses(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_purchases_company_id ON inventory_purchases(company_id);
CREATE INDEX idx_inventory_purchases_item_id ON inventory_purchases(inventory_item_id);

-- ============== inventory_usage ==============
CREATE TABLE inventory_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  category inventory_category NOT NULL,
  quantity NUMERIC(14,2) NOT NULL,
  unit TEXT NOT NULL,
  source TEXT NOT NULL,
  work_log_id UUID REFERENCES work_logs(id),
  work_card_id UUID REFERENCES operations_work_cards(id),
  harvest_id UUID,
  manager_name TEXT,
  stage_index INT,
  stage_name TEXT,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_usage_company_project ON inventory_usage(company_id, project_id);

-- ============== inventory_audit_logs ==============
CREATE TABLE inventory_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  inventory_item_id UUID REFERENCES inventory_items(id),
  quantity NUMERIC(14,2),
  metadata JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_audit_logs_company_id ON inventory_audit_logs(company_id);

-- ============== harvests ==============
CREATE TABLE harvests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  crop_type TEXT NOT NULL,
  harvest_date DATE NOT NULL,
  quantity NUMERIC(14,2) NOT NULL,
  unit TEXT NOT NULL,
  location TEXT,
  notes TEXT,
  quality TEXT,
  destination TEXT,
  farm_pricing_mode TEXT,
  farm_price_unit_type TEXT,
  farm_unit_price NUMERIC(12,2),
  farm_total_price NUMERIC(14,2),
  market_name TEXT,
  broker_id TEXT,
  broker_name TEXT,
  lorry_plate TEXT,
  lorry_plates TEXT[],
  driver_id TEXT,
  driver_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_harvests_company_project ON harvests(company_id, project_id);

-- ============== harvest_collections ==============
CREATE TABLE harvest_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  crop_type TEXT NOT NULL,
  name TEXT NOT NULL,
  harvest_date DATE NOT NULL,
  price_per_kg_picker NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_harvest_kg NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_picker_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  status harvest_collection_status NOT NULL DEFAULT 'collecting',
  buyer_paid_at TIMESTAMPTZ,
  harvest_id UUID REFERENCES harvests(id),
  sale_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at_local BIGINT
);

CREATE INDEX idx_harvest_collections_company_project ON harvest_collections(company_id, project_id);

-- ============== harvest_pickers ==============
CREATE TABLE harvest_pickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES harvest_collections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  total_kg NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_pay NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  payment_batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_harvest_pickers_collection_id ON harvest_pickers(collection_id);
CREATE INDEX idx_harvest_pickers_company_collection ON harvest_pickers(company_id, collection_id);

-- ============== picker_weigh_entries ==============
CREATE TABLE picker_weigh_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES harvest_collections(id) ON DELETE CASCADE,
  picker_id UUID NOT NULL REFERENCES harvest_pickers(id) ON DELETE CASCADE,
  weight_kg NUMERIC(12,2) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_picker_weigh_entries_collection_id ON picker_weigh_entries(collection_id);

-- ============== harvest_payment_batches ==============
CREATE TABLE harvest_payment_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES harvest_collections(id) ON DELETE CASCADE,
  picker_ids UUID[] NOT NULL,
  total_amount NUMERIC(14,2) NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_harvest_payment_batches_company_collection ON harvest_payment_batches(company_id, collection_id);

-- ============== harvest_wallets (natural key) ==============
CREATE TABLE harvest_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  crop_type TEXT NOT NULL,
  cash_received_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  cash_paid_out_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT,
  UNIQUE(company_id, project_id, crop_type)
);

CREATE INDEX idx_harvest_wallets_company_project ON harvest_wallets(company_id, project_id);

-- ============== collection_cash_usage ==============
CREATE TABLE collection_cash_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  crop_type TEXT NOT NULL,
  wallet_id UUID NOT NULL REFERENCES harvest_wallets(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES harvest_collections(id) ON DELETE CASCADE,
  total_deducted NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(wallet_id, collection_id)
);

CREATE INDEX idx_collection_cash_usage_wallet ON collection_cash_usage(wallet_id);

-- ============== project_wallet_ledger (append-only) ==============
CREATE TABLE project_wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type ledger_entry_type NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  description TEXT,
  migrated_from TEXT,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_wallet_ledger_company_project ON project_wallet_ledger(company_id, project_id);

-- ============== project_wallet_meta (one per company+project) ==============
CREATE TABLE project_wallet_meta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  migrated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, project_id)
);

CREATE INDEX idx_project_wallet_meta_company_project ON project_wallet_meta(company_id, project_id);

-- ============== sales ==============
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  crop_type TEXT NOT NULL,
  harvest_id UUID REFERENCES harvests(id),
  buyer_name TEXT NOT NULL,
  quantity NUMERIC(14,2) NOT NULL,
  unit TEXT,
  unit_price NUMERIC(12,2) NOT NULL,
  total_amount NUMERIC(14,2) NOT NULL,
  date DATE NOT NULL,
  status TEXT DEFAULT 'pending',
  broker_id TEXT,
  amount_paid NUMERIC(14,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_company_project ON sales(company_id, project_id);

-- Optional FK: harvest_collections.sale_id -> sales.id (added after sales exists)
ALTER TABLE harvest_collections
  ADD CONSTRAINT fk_harvest_collections_sale
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL;

-- ============== feedback ==============
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reply_at TIMESTAMPTZ,
  reply_text TEXT
);

CREATE INDEX idx_feedback_company_id ON feedback(company_id);

-- ============== audit_logs (append-only; developer read) ==============
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_company_id ON audit_logs(company_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ============== activity_logs (append-only) ==============
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_logs_company_project ON activity_logs(company_id, project_id);

-- ============== crop_catalog ==============
CREATE TABLE crop_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  crop_type TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crop_catalog_company_id ON crop_catalog(company_id);

-- ============== challenge_templates ==============
CREATE TABLE challenge_templates (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  crop_type TEXT NOT NULL,
  phase TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT,
  default_due_offset_days INT,
  is_reusable BOOLEAN DEFAULT TRUE,
  what_was_done TEXT,
  plan2_if_fails TEXT,
  items_used_summary TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_challenge_templates_company_crop_phase ON challenge_templates(company_id, crop_type, phase);

-- ============== budget_pools ==============
CREATE TABLE budget_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  total_amount NUMERIC(14,2) NOT NULL,
  remaining_amount NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_budget_pools_company_id ON budget_pools(company_id);

-- ============== subscription_payments ==============
CREATE TABLE subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  status subscription_payment_status NOT NULL DEFAULT 'pending',
  billing_mode TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);

CREATE INDEX idx_subscription_payments_company_status ON subscription_payments(company_id, status);
CREATE INDEX idx_subscription_payments_created_at ON subscription_payments(created_at);

-- ============== company_subscriptions (one row per company) ==============
CREATE TABLE company_subscriptions (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  plan_id TEXT,
  status TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  override JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============== developer_actions_log (developer-only) ==============
CREATE TABLE developer_actions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============== platform_expenses (developer-only) ==============
CREATE TABLE platform_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(14,2) NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============== code_red ==============
CREATE TABLE code_red (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_code_red_company_id ON code_red(company_id);
CREATE INDEX idx_code_red_updated_at ON code_red(updated_at);

-- ============== code_red_messages ==============
CREATE TABLE code_red_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_red_id UUID NOT NULL REFERENCES code_red(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_code_red_messages_code_red_id ON code_red_messages(code_red_id);

-- ============== developer_backups ==============
CREATE TABLE developer_backups (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  company_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============== developer_backup_snapshots ==============
CREATE TABLE developer_backup_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_id TEXT NOT NULL REFERENCES developer_backups(company_id) ON DELETE CASCADE,
  snapshot_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_developer_backup_snapshots_backup_id ON developer_backup_snapshots(backup_id);

-- ============== records_library (developer-only; no company_id) ==============
CREATE TABLE records_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_id TEXT NOT NULL,
  category record_category NOT NULL DEFAULT 'General',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  highlights TEXT[],
  tags TEXT[],
  status record_status NOT NULL DEFAULT 'draft',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_records_library_crop_id ON records_library(crop_id);

-- ============== company_records ==============
CREATE TABLE company_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  crop_id TEXT NOT NULL,
  category record_category NOT NULL DEFAULT 'General',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  highlights TEXT[],
  tags TEXT[],
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_records_company_crop ON company_records(company_id, crop_id);

-- ============== company_record_shares ==============
CREATE TABLE company_record_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  record_id UUID NOT NULL REFERENCES company_records(id) ON DELETE CASCADE,
  crop_id TEXT NOT NULL,
  title TEXT,
  category record_category,
  highlights TEXT[],
  content TEXT,
  shared_by TEXT NOT NULL,
  shared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  visibility TEXT NOT NULL DEFAULT 'visible',
  pinned BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_company_record_shares_company_crop ON company_record_shares(company_id, crop_id);
CREATE INDEX idx_company_record_shares_visibility ON company_record_shares(visibility);

-- ============== crops (reference; id = crop key) ==============
CREATE TABLE crops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============== deliveries ==============
CREATE TABLE deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id),
  harvest_id UUID REFERENCES harvests(id),
  driver_id UUID REFERENCES employees(id),
  from_location TEXT NOT NULL,
  to_location TEXT NOT NULL,
  quantity NUMERIC(14,2) NOT NULL,
  unit TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  distance_km NUMERIC(10,2),
  fuel_used_liters NUMERIC(10,2),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deliveries_company_id ON deliveries(company_id);

-- ============== custom_roles ==============
CREATE TABLE custom_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  definition JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_custom_roles_company_id ON custom_roles(company_id);

-- ============== harvest_cash_pools (legacy; optional) ==============
CREATE TABLE harvest_cash_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  collection_id UUID REFERENCES harvest_collections(id) ON DELETE SET NULL,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_harvest_cash_pools_company_id ON harvest_cash_pools(company_id);

-- ============== updated_at triggers ==============
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at (only on tables that have the column)
CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_employees BEFORE UPDATE ON employees FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_companies BEFORE UPDATE ON companies FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_projects BEFORE UPDATE ON projects FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_project_stages BEFORE UPDATE ON project_stages FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_work_logs BEFORE UPDATE ON work_logs FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_operations_work_cards BEFORE UPDATE ON operations_work_cards FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_expenses BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_season_challenges BEFORE UPDATE ON season_challenges FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_needed_items BEFORE UPDATE ON needed_items FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_inventory_items BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_suppliers BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_harvest_pickers BEFORE UPDATE ON harvest_pickers FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_harvest_wallets BEFORE UPDATE ON harvest_wallets FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_project_wallet_meta BEFORE UPDATE ON project_wallet_meta FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_crop_catalog BEFORE UPDATE ON crop_catalog FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_challenge_templates BEFORE UPDATE ON challenge_templates FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_company_subscriptions BEFORE UPDATE ON company_subscriptions FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_code_red BEFORE UPDATE ON code_red FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_company_records BEFORE UPDATE ON company_records FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_records_library BEFORE UPDATE ON records_library FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_updated_at_custom_roles BEFORE UPDATE ON custom_roles FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

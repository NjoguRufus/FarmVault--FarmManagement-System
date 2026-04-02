-- =============================================================================
-- Developer Company Migrations Feature
-- Allows developers to migrate all tenant data from a source company to a target company
-- =============================================================================

-- ============== MIGRATION TRACKING TABLES ==============

-- Drop existing tables if they exist (to handle schema changes)
DROP TABLE IF EXISTS admin.company_migration_items CASCADE;
DROP TABLE IF EXISTS admin.company_migrations CASCADE;

-- Main migration log table
CREATE TABLE admin.company_migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_company_id TEXT NOT NULL,
  source_company_name TEXT,
  target_company_id TEXT NOT NULL,
  target_company_name TEXT,
  target_admin_user_id TEXT,
  target_admin_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, failed, rolled_back
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  source_archived BOOLEAN DEFAULT FALSE,
  migration_summary JSONB, -- { tables: { employees: { moved: 10, skipped: 2 }, ... } }
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_migrations_source ON admin.company_migrations(source_company_id);
CREATE INDEX idx_company_migrations_target ON admin.company_migrations(target_company_id);
CREATE INDEX idx_company_migrations_status ON admin.company_migrations(status);

-- Individual item/table migration log
CREATE TABLE admin.company_migration_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_id UUID NOT NULL REFERENCES admin.company_migrations(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  source_record_id TEXT,
  target_record_id TEXT,
  migration_action TEXT NOT NULL, -- migrated, skipped, conflict, error
  conflict_reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_migration_items_migration ON admin.company_migration_items(migration_id);
CREATE INDEX idx_company_migration_items_table ON admin.company_migration_items(table_name);
CREATE INDEX idx_company_migration_items_action ON admin.company_migration_items(migration_action);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION admin.set_company_migrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_company_migrations ON admin.company_migrations;
CREATE TRIGGER set_updated_at_company_migrations 
  BEFORE UPDATE ON admin.company_migrations 
  FOR EACH ROW EXECUTE FUNCTION admin.set_company_migrations_updated_at();

-- ============== HELPER FUNCTIONS ==============

-- Get all base tables with company_id column (excludes views)
CREATE OR REPLACE FUNCTION admin.get_migrateable_tables()
RETURNS TABLE(table_schema TEXT, table_name TEXT, has_company_id BOOLEAN) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.table_schema::TEXT,
    c.table_name::TEXT,
    TRUE AS has_company_id
  FROM information_schema.columns c
  JOIN information_schema.tables t 
    ON c.table_schema = t.table_schema 
    AND c.table_name = t.table_name
  WHERE c.column_name = 'company_id'
    AND t.table_type = 'BASE TABLE'
    AND c.table_schema IN ('public', 'core')
    -- Exclude admin/system tables
    AND c.table_name NOT IN (
      'company_migrations', 
      'company_migration_items',
      'developer_backups',
      'developer_backup_snapshots',
      'developer_actions_log',
      'platform_expenses',
      'records_library',
      'crops'
    )
  ORDER BY c.table_schema, c.table_name;
END;
$$;

-- Get company info with admin details
CREATE OR REPLACE FUNCTION admin.get_company_with_admin(_company_id TEXT)
RETURNS TABLE(
  company_id TEXT,
  company_name TEXT,
  created_at TIMESTAMPTZ,
  admin_user_id TEXT,
  admin_email TEXT,
  admin_full_name TEXT,
  has_migrated_data BOOLEAN,
  migration_count BIGINT
) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id AS company_id,
    c.name AS company_name,
    c.created_at,
    cm.user_id AS admin_user_id,
    COALESCE(p.email, '')::TEXT AS admin_email,
    COALESCE(p.full_name, '')::TEXT AS admin_full_name,
    EXISTS(
      SELECT 1 FROM admin.company_migrations m 
      WHERE m.target_company_id = c.id AND m.status = 'completed'
    ) AS has_migrated_data,
    (
      SELECT COUNT(*) FROM admin.company_migrations m 
      WHERE m.target_company_id = c.id AND m.status = 'completed'
    ) AS migration_count
  FROM public.companies c
  LEFT JOIN public.company_members cm 
    ON cm.company_id::TEXT = c.id 
    AND cm.role IN ('company-admin', 'company_admin')
  LEFT JOIN public.profiles p 
    ON p.id = cm.user_id
  WHERE c.id = _company_id
  LIMIT 1;
END;
$$;

-- List all companies with admin info for migration UI
CREATE OR REPLACE FUNCTION admin.list_companies_for_migration()
RETURNS TABLE(
  company_id TEXT,
  company_name TEXT,
  created_at TIMESTAMPTZ,
  admin_user_id TEXT,
  admin_email TEXT,
  admin_full_name TEXT,
  has_migrated_data BOOLEAN,
  migration_count BIGINT,
  is_new BOOLEAN,
  record_counts JSONB
) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_threshold INTERVAL := INTERVAL '7 days';
  is_service_role BOOLEAN;
BEGIN
  -- Allow service role (postgres) or developers
  is_service_role := (SELECT current_user = 'postgres' OR current_setting('role', true) = 'service_role');
  IF NOT is_service_role AND NOT admin.is_developer(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: developer only';
  END IF;

  RETURN QUERY
  SELECT 
    c.id AS company_id,
    c.name AS company_name,
    c.created_at,
    cm.user_id AS admin_user_id,
    COALESCE(p.email, '')::TEXT AS admin_email,
    COALESCE(p.full_name, '')::TEXT AS admin_full_name,
    EXISTS(
      SELECT 1 FROM admin.company_migrations m 
      WHERE m.target_company_id = c.id AND m.status = 'completed'
    ) AS has_migrated_data,
    (
      SELECT COUNT(*) FROM admin.company_migrations m 
      WHERE m.target_company_id = c.id AND m.status = 'completed'
    ) AS migration_count,
    -- Is "new" if created recently AND has not received migrated data
    (
      c.created_at > (now() - new_threshold)
      AND NOT EXISTS(
        SELECT 1 FROM admin.company_migrations m 
        WHERE m.target_company_id = c.id AND m.status = 'completed'
      )
    ) AS is_new,
    -- Quick record counts for preview
    jsonb_build_object(
      'employees', (SELECT COUNT(*) FROM public.employees e WHERE e.company_id = c.id),
      'projects', (SELECT COUNT(*) FROM public.projects pr WHERE pr.company_id = c.id),
      'expenses', (SELECT COUNT(*) FROM public.expenses ex WHERE ex.company_id = c.id),
      'harvests', (SELECT COUNT(*) FROM public.harvests h WHERE h.company_id = c.id),
      'harvest_collections', (SELECT COUNT(*) FROM public.harvest_collections hc WHERE hc.company_id = c.id),
      'inventory_items', (SELECT COUNT(*) FROM public.inventory_items ii WHERE ii.company_id = c.id),
      'suppliers', (SELECT COUNT(*) FROM public.suppliers s WHERE s.company_id = c.id)
    ) AS record_counts
  FROM public.companies c
  LEFT JOIN public.company_members cm 
    ON cm.company_id::TEXT = c.id 
    AND cm.role IN ('company-admin', 'company_admin')
  LEFT JOIN public.profiles p 
    ON p.id = cm.user_id
  ORDER BY c.created_at DESC;
END;
$$;

-- ============== MIGRATION PREVIEW FUNCTION ==============

CREATE OR REPLACE FUNCTION admin.preview_company_migration(
  _source_company_id TEXT,
  _target_company_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSONB;
  source_info RECORD;
  target_info RECORD;
  table_counts JSONB := '{}';
  conflicts JSONB := '[]';
  warnings JSONB := '[]';
  rec RECORD;
  conflict_count INT;
  is_service_role BOOLEAN;
BEGIN
  -- Allow service role (postgres) or developers
  is_service_role := (SELECT current_user = 'postgres' OR current_setting('role', true) = 'service_role');
  IF NOT is_service_role AND NOT admin.is_developer(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: developer only';
  END IF;

  -- Validate companies exist
  SELECT * INTO source_info FROM admin.get_company_with_admin(_source_company_id);
  SELECT * INTO target_info FROM admin.get_company_with_admin(_target_company_id);

  IF source_info.company_id IS NULL THEN
    RAISE EXCEPTION 'Source company not found: %', _source_company_id;
  END IF;

  IF target_info.company_id IS NULL THEN
    RAISE EXCEPTION 'Target company not found: %', _target_company_id;
  END IF;

  IF _source_company_id = _target_company_id THEN
    RAISE EXCEPTION 'Source and target company cannot be the same';
  END IF;

  -- Count records in each table for source company
  -- Employees
  SELECT COUNT(*) INTO rec FROM public.employees WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('employees', rec.count);
  
  -- Check for employee email conflicts
  SELECT COUNT(*) INTO conflict_count
  FROM public.employees src
  JOIN public.employees tgt ON LOWER(src.email) = LOWER(tgt.email)
  WHERE src.company_id = _source_company_id 
    AND tgt.company_id = _target_company_id
    AND src.email IS NOT NULL;
  IF conflict_count > 0 THEN
    conflicts := conflicts || jsonb_build_array(jsonb_build_object(
      'table', 'employees',
      'type', 'duplicate_email',
      'count', conflict_count,
      'resolution', 'Target employee records will be kept, source duplicates will be skipped'
    ));
  END IF;

  -- Projects
  SELECT COUNT(*) INTO rec FROM public.projects WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('projects', rec.count);

  -- Project stages
  SELECT COUNT(*) INTO rec FROM public.project_stages WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('project_stages', rec.count);

  -- Expenses
  SELECT COUNT(*) INTO rec FROM public.expenses WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('expenses', rec.count);

  -- Harvests
  SELECT COUNT(*) INTO rec FROM public.harvests WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('harvests', rec.count);

  -- Harvest collections
  SELECT COUNT(*) INTO rec FROM public.harvest_collections WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('harvest_collections', rec.count);

  -- Harvest pickers
  SELECT COUNT(*) INTO rec FROM public.harvest_pickers WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('harvest_pickers', rec.count);

  -- Picker weigh entries
  SELECT COUNT(*) INTO rec FROM public.picker_weigh_entries WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('picker_weigh_entries', rec.count);

  -- Harvest payment batches
  SELECT COUNT(*) INTO rec FROM public.harvest_payment_batches WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('harvest_payment_batches', rec.count);

  -- Suppliers
  SELECT COUNT(*) INTO rec FROM public.suppliers WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('suppliers', rec.count);

  -- Inventory items
  SELECT COUNT(*) INTO rec FROM public.inventory_items WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('inventory_items', rec.count);

  -- Inventory categories
  SELECT COUNT(*) INTO rec FROM public.inventory_categories WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('inventory_categories', rec.count);

  -- Inventory purchases
  SELECT COUNT(*) INTO rec FROM public.inventory_purchases WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('inventory_purchases', rec.count);

  -- Inventory usage
  SELECT COUNT(*) INTO rec FROM public.inventory_usage WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('inventory_usage', rec.count);

  -- Work logs
  SELECT COUNT(*) INTO rec FROM public.work_logs WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('work_logs', rec.count);

  -- Operations work cards
  SELECT COUNT(*) INTO rec FROM public.operations_work_cards WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('operations_work_cards', rec.count);

  -- Season challenges
  SELECT COUNT(*) INTO rec FROM public.season_challenges WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('season_challenges', rec.count);

  -- Needed items
  SELECT COUNT(*) INTO rec FROM public.needed_items WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('needed_items', rec.count);

  -- Sales
  SELECT COUNT(*) INTO rec FROM public.sales WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('sales', rec.count);

  -- Budget pools
  SELECT COUNT(*) INTO rec FROM public.budget_pools WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('budget_pools', rec.count);

  -- Crop catalog
  SELECT COUNT(*) INTO rec FROM public.crop_catalog WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('crop_catalog', rec.count);

  -- Challenge templates
  SELECT COUNT(*) INTO rec FROM public.challenge_templates WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('challenge_templates', rec.count);

  -- Company records
  SELECT COUNT(*) INTO rec FROM public.company_records WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('company_records', rec.count);

  -- Deliveries
  SELECT COUNT(*) INTO rec FROM public.deliveries WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('deliveries', rec.count);

  -- Custom roles
  SELECT COUNT(*) INTO rec FROM public.custom_roles WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('custom_roles', rec.count);

  -- Harvest wallets
  SELECT COUNT(*) INTO rec FROM public.harvest_wallets WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('harvest_wallets', rec.count);

  -- Project wallet ledger
  SELECT COUNT(*) INTO rec FROM public.project_wallet_ledger WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('project_wallet_ledger', rec.count);

  -- Project wallet meta
  SELECT COUNT(*) INTO rec FROM public.project_wallet_meta WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('project_wallet_meta', rec.count);

  -- Collection cash usage
  SELECT COUNT(*) INTO rec FROM public.collection_cash_usage WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('collection_cash_usage', rec.count);

  -- Code red
  SELECT COUNT(*) INTO rec FROM public.code_red WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('code_red', rec.count);

  -- Feedback
  SELECT COUNT(*) INTO rec FROM public.feedback WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('feedback', rec.count);

  -- Activity logs
  SELECT COUNT(*) INTO rec FROM public.activity_logs WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('activity_logs', rec.count);

  -- Audit logs
  SELECT COUNT(*) INTO rec FROM public.audit_logs WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('audit_logs', rec.count);

  -- Company members (excluding admin)
  SELECT COUNT(*) INTO rec FROM public.company_members 
  WHERE company_id::TEXT = _source_company_id 
    AND role NOT IN ('company-admin', 'company_admin');
  table_counts := table_counts || jsonb_build_object('company_members', rec.count);

  -- Profiles with active_company_id pointing to source
  SELECT COUNT(*) INTO rec FROM public.profiles 
  WHERE active_company_id::TEXT = _source_company_id;
  table_counts := table_counts || jsonb_build_object('profiles_to_update', rec.count);

  -- Check for subscription conflict
  IF EXISTS(SELECT 1 FROM public.company_subscriptions WHERE company_id = _target_company_id) THEN
    warnings := warnings || jsonb_build_array(jsonb_build_object(
      'type', 'subscription_exists',
      'message', 'Target company already has a subscription. Source subscription will NOT be migrated.'
    ));
  END IF;

  -- Check if target has any existing data
  IF (SELECT COUNT(*) FROM public.projects WHERE company_id = _target_company_id) > 0 THEN
    warnings := warnings || jsonb_build_array(jsonb_build_object(
      'type', 'target_has_data',
      'message', 'Target company already has some project data. New data will be added alongside existing data.'
    ));
  END IF;

  result := jsonb_build_object(
    'source', jsonb_build_object(
      'company_id', source_info.company_id,
      'company_name', source_info.company_name,
      'created_at', source_info.created_at,
      'admin_email', source_info.admin_email,
      'admin_full_name', source_info.admin_full_name
    ),
    'target', jsonb_build_object(
      'company_id', target_info.company_id,
      'company_name', target_info.company_name,
      'created_at', target_info.created_at,
      'admin_user_id', target_info.admin_user_id,
      'admin_email', target_info.admin_email,
      'admin_full_name', target_info.admin_full_name,
      'has_migrated_data', target_info.has_migrated_data
    ),
    'table_counts', table_counts,
    'conflicts', conflicts,
    'warnings', warnings,
    'total_records', (
      SELECT SUM(value::INT) FROM jsonb_each_text(table_counts)
    )
  );

  RETURN result;
END;
$$;

-- ============== MAIN MIGRATION FUNCTION ==============

CREATE OR REPLACE FUNCTION admin.execute_company_migration(
  _source_company_id TEXT,
  _target_company_id TEXT,
  _archive_source BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  migration_id UUID;
  source_info RECORD;
  target_info RECORD;
  summary JSONB := '{}';
  moved_counts JSONB := '{}';
  skipped_counts JSONB := '{}';
  current_user_id TEXT;
  old_id UUID;
  new_id UUID;
  rec RECORD;
  id_map JSONB := '{}'; -- Maps old IDs to new IDs for FK updates
  project_id_map JSONB := '{}';
  employee_id_map JSONB := '{}';
  supplier_id_map JSONB := '{}';
  inventory_item_id_map JSONB := '{}';
  harvest_id_map JSONB := '{}';
  collection_id_map JSONB := '{}';
  picker_id_map JSONB := '{}';
  wallet_id_map JSONB := '{}';
  work_log_id_map JSONB := '{}';
  work_card_id_map JSONB := '{}';
  expense_id_map JSONB := '{}';
  challenge_id_map JSONB := '{}';
  project_stage_id_map JSONB := '{}';
  sale_id_map JSONB := '{}';
  budget_pool_id_map JSONB := '{}';
  category_id_map JSONB := '{}';
  moved INT;
  skipped INT;
  is_service_role BOOLEAN;
BEGIN
  -- Allow service role (postgres) or developers
  is_service_role := (SELECT current_user = 'postgres' OR current_setting('role', true) = 'service_role');
  IF NOT is_service_role AND NOT admin.is_developer(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: developer only';
  END IF;

  -- Get current developer user
  current_user_id := COALESCE(
    current_setting('request.jwt.claims', true)::json->>'sub',
    'system'
  );

  -- Validate companies
  SELECT * INTO source_info FROM admin.get_company_with_admin(_source_company_id);
  SELECT * INTO target_info FROM admin.get_company_with_admin(_target_company_id);

  IF source_info.company_id IS NULL THEN
    RAISE EXCEPTION 'Source company not found: %', _source_company_id;
  END IF;

  IF target_info.company_id IS NULL THEN
    RAISE EXCEPTION 'Target company not found: %', _target_company_id;
  END IF;

  IF _source_company_id = _target_company_id THEN
    RAISE EXCEPTION 'Source and target company cannot be the same';
  END IF;

  -- Create migration record
  INSERT INTO admin.company_migrations (
    source_company_id,
    source_company_name,
    target_company_id,
    target_company_name,
    target_admin_user_id,
    target_admin_email,
    status,
    started_at,
    created_by
  ) VALUES (
    _source_company_id,
    source_info.company_name,
    _target_company_id,
    target_info.company_name,
    target_info.admin_user_id,
    target_info.admin_email,
    'in_progress',
    now(),
    current_user_id
  ) RETURNING id INTO migration_id;

  BEGIN
    -- ===== PHASE 1: Migrate independent tables first =====

    -- 1. Employees (handle email conflicts)
    moved := 0;
    skipped := 0;
    FOR rec IN 
      SELECT * FROM public.employees WHERE company_id = _source_company_id
    LOOP
      -- Check for email conflict
      IF rec.email IS NOT NULL AND EXISTS(
        SELECT 1 FROM public.employees 
        WHERE company_id = _target_company_id AND LOWER(email) = LOWER(rec.email)
      ) THEN
        INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, migration_action, conflict_reason)
        VALUES (migration_id, 'employees', rec.id::TEXT, 'skipped', 'Duplicate email in target');
        skipped := skipped + 1;
        CONTINUE;
      END IF;

      new_id := gen_random_uuid();
      INSERT INTO public.employees (
        id, company_id, auth_user_id, name, full_name, email, phone, contact,
        role, employee_role, department, status, permissions, join_date,
        created_by, created_at, updated_at
      ) VALUES (
        new_id, _target_company_id, rec.auth_user_id, rec.name, rec.full_name, 
        rec.email, rec.phone, rec.contact, rec.role, rec.employee_role, 
        rec.department, rec.status, rec.permissions, rec.join_date,
        rec.created_by, rec.created_at, rec.updated_at
      );
      employee_id_map := employee_id_map || jsonb_build_object(rec.id::TEXT, new_id::TEXT);
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'employees', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('employees', moved);
    skipped_counts := skipped_counts || jsonb_build_object('employees', skipped);

    -- 2. Suppliers
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.suppliers WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.suppliers (
        id, company_id, name, contact, email, category, categories,
        rating, status, review_notes, created_at, updated_at
      ) VALUES (
        new_id, _target_company_id, rec.name, rec.contact, rec.email,
        rec.category, rec.categories, rec.rating, rec.status, 
        rec.review_notes, rec.created_at, rec.updated_at
      );
      supplier_id_map := supplier_id_map || jsonb_build_object(rec.id::TEXT, new_id::TEXT);
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'suppliers', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('suppliers', moved);

    -- 3. Inventory categories
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.inventory_categories WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.inventory_categories (id, company_id, name, created_at)
      VALUES (new_id, _target_company_id, rec.name, rec.created_at);
      category_id_map := category_id_map || jsonb_build_object(rec.id::TEXT, new_id::TEXT);
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'inventory_categories', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('inventory_categories', moved);

    -- 4. Budget pools
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.budget_pools WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.budget_pools (id, company_id, name, total_amount, remaining_amount, created_at)
      VALUES (new_id, _target_company_id, rec.name, rec.total_amount, rec.remaining_amount, rec.created_at);
      budget_pool_id_map := budget_pool_id_map || jsonb_build_object(rec.id::TEXT, new_id::TEXT);
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'budget_pools', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('budget_pools', moved);

    -- 5. Projects (with budget_pool_id mapping)
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.projects WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.projects (
        id, company_id, name, crop_type, crop_type_key, environment_type, status,
        start_date, end_date, location, acreage, budget, planting_date,
        starting_stage_index, current_stage, stage_selected, stage_auto_detected,
        stage_was_manually_overridden, days_since_planting, seed_variety,
        plan_notes, setup_complete, use_blocks, budget_pool_id, planning,
        created_at, updated_at
      ) VALUES (
        new_id, _target_company_id, rec.name, rec.crop_type, rec.crop_type_key,
        rec.environment_type, rec.status, rec.start_date, rec.end_date, rec.location,
        rec.acreage, rec.budget, rec.planting_date, rec.starting_stage_index,
        rec.current_stage, rec.stage_selected, rec.stage_auto_detected,
        rec.stage_was_manually_overridden, rec.days_since_planting, rec.seed_variety,
        rec.plan_notes, rec.setup_complete, rec.use_blocks,
        CASE WHEN rec.budget_pool_id IS NOT NULL 
             THEN (budget_pool_id_map->>rec.budget_pool_id::TEXT)::UUID 
             ELSE NULL END,
        rec.planning, rec.created_at, rec.updated_at
      );
      project_id_map := project_id_map || jsonb_build_object(rec.id::TEXT, new_id::TEXT);
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'projects', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('projects', moved);

    -- 6. Project stages
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.project_stages WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.project_stages (
        id, company_id, project_id, crop_type, stage_name, stage_index,
        start_date, end_date, planned_start_date, planned_end_date,
        actual_start_date, actual_end_date, status, notes,
        recalculated, recalculated_at, recalculation_reason,
        created_at, updated_at
      ) VALUES (
        new_id, _target_company_id, 
        (project_id_map->>rec.project_id::TEXT)::UUID,
        rec.crop_type, rec.stage_name, rec.stage_index,
        rec.start_date, rec.end_date, rec.planned_start_date, rec.planned_end_date,
        rec.actual_start_date, rec.actual_end_date, rec.status, rec.notes,
        rec.recalculated, rec.recalculated_at, rec.recalculation_reason,
        rec.created_at, rec.updated_at
      );
      project_stage_id_map := project_stage_id_map || jsonb_build_object(rec.id::TEXT, new_id::TEXT);
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'project_stages', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('project_stages', moved);

    -- 7. Stage notes
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.stage_notes WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.stage_notes (
        id, company_id, project_id, stage_id, text, created_by, created_at
      ) VALUES (
        new_id, _target_company_id,
        (project_id_map->>rec.project_id::TEXT)::UUID,
        (project_stage_id_map->>rec.stage_id::TEXT)::UUID,
        rec.text, rec.created_by, rec.created_at
      );
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'stage_notes', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('stage_notes', moved);

    -- 8. Project blocks
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.project_blocks WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.project_blocks (
        id, company_id, project_id, block_name, acreage, planting_date,
        expected_end_date, current_stage, season_progress, created_at
      ) VALUES (
        new_id, _target_company_id,
        (project_id_map->>rec.project_id::TEXT)::UUID,
        rec.block_name, rec.acreage, rec.planting_date,
        rec.expected_end_date, rec.current_stage, rec.season_progress, rec.created_at
      );
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'project_blocks', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('project_blocks', moved);

    -- 9. Inventory items (with supplier mapping)
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.inventory_items WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.inventory_items (
        id, company_id, name, category, quantity, unit, price_per_unit,
        packaging_type, units_per_box, fuel_type, containers, litres,
        bags, kgs, box_size, scope, crop_type, crop_types, supplier_id,
        supplier_name, pickup_date, min_threshold, last_updated, created_at
      ) VALUES (
        new_id, _target_company_id, rec.name, rec.category, rec.quantity,
        rec.unit, rec.price_per_unit, rec.packaging_type, rec.units_per_box,
        rec.fuel_type, rec.containers, rec.litres, rec.bags, rec.kgs,
        rec.box_size, rec.scope, rec.crop_type, rec.crop_types,
        CASE WHEN rec.supplier_id IS NOT NULL 
             THEN (supplier_id_map->>rec.supplier_id::TEXT)::UUID 
             ELSE NULL END,
        rec.supplier_name, rec.pickup_date, rec.min_threshold,
        rec.last_updated, rec.created_at
      );
      inventory_item_id_map := inventory_item_id_map || jsonb_build_object(rec.id::TEXT, new_id::TEXT);
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'inventory_items', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('inventory_items', moved);

    -- 10. Season challenges
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.season_challenges WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.season_challenges (
        id, company_id, project_id, crop_type, title, description,
        challenge_type, stage_index, stage_name, severity, status,
        date_identified, date_resolved, what_was_done, items_used,
        plan2_if_fails, source, source_plan_challenge_id,
        created_by, created_by_name, created_at, updated_at
      ) VALUES (
        new_id, _target_company_id,
        (project_id_map->>rec.project_id::TEXT)::UUID,
        rec.crop_type, rec.title, rec.description, rec.challenge_type,
        rec.stage_index, rec.stage_name, rec.severity, rec.status,
        rec.date_identified, rec.date_resolved, rec.what_was_done,
        rec.items_used, rec.plan2_if_fails, rec.source,
        rec.source_plan_challenge_id, rec.created_by, rec.created_by_name,
        rec.created_at, rec.updated_at
      );
      challenge_id_map := challenge_id_map || jsonb_build_object(rec.id::TEXT, new_id::TEXT);
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'season_challenges', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('season_challenges', moved);

    -- 11. Needed items
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.needed_items WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.needed_items (
        id, company_id, project_id, item_name, category, quantity, unit,
        source_challenge_id, source_challenge_title, status, created_at, updated_at
      ) VALUES (
        new_id, _target_company_id,
        CASE WHEN rec.project_id IS NOT NULL 
             THEN (project_id_map->>rec.project_id::TEXT)::UUID 
             ELSE NULL END,
        rec.item_name, rec.category, rec.quantity, rec.unit,
        CASE WHEN rec.source_challenge_id IS NOT NULL 
             THEN (challenge_id_map->>rec.source_challenge_id::TEXT)::UUID 
             ELSE NULL END,
        rec.source_challenge_title, rec.status, rec.created_at, rec.updated_at
      );
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'needed_items', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('needed_items', moved);

    -- 12. Operations work cards
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.operations_work_cards WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.operations_work_cards (
        id, company_id, project_id, allocated_manager_id, status, payload,
        created_at, updated_at
      ) VALUES (
        new_id, _target_company_id,
        CASE WHEN rec.project_id IS NOT NULL 
             THEN (project_id_map->>rec.project_id::TEXT)::UUID 
             ELSE NULL END,
        CASE WHEN rec.allocated_manager_id IS NOT NULL 
             THEN (employee_id_map->>rec.allocated_manager_id::TEXT)::UUID 
             ELSE NULL END,
        rec.status, rec.payload, rec.created_at, rec.updated_at
      );
      work_card_id_map := work_card_id_map || jsonb_build_object(rec.id::TEXT, new_id::TEXT);
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'operations_work_cards', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('operations_work_cards', moved);

    -- 13. Work logs
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.work_logs WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.work_logs (
        id, company_id, project_id, crop_type, stage_index, stage_name, date,
        work_category, work_type, number_of_people, rate_per_person, total_price,
        employee_id, employee_ids, employee_name, chemicals, fertilizer, fuel,
        notes, inputs_used, watering_containers_used, tying_used_type, change_reason,
        manager_id, manager_name, admin_name, paid, paid_at, paid_by, origin,
        parent_work_log_id, manager_submission_status, manager_submitted_at,
        manager_submitted_number_of_people, manager_submitted_rate_per_person,
        manager_submitted_total_price, manager_submitted_notes,
        manager_submitted_inputs_used, manager_submitted_work_type,
        approved_by, approved_by_name, created_at, updated_at
      ) VALUES (
        new_id, _target_company_id,
        (project_id_map->>rec.project_id::TEXT)::UUID,
        rec.crop_type, rec.stage_index, rec.stage_name, rec.date,
        rec.work_category, rec.work_type, rec.number_of_people, rec.rate_per_person,
        rec.total_price,
        CASE WHEN rec.employee_id IS NOT NULL 
             THEN (employee_id_map->>rec.employee_id::TEXT)::UUID 
             ELSE NULL END,
        -- Map employee_ids array
        CASE WHEN rec.employee_ids IS NOT NULL 
             THEN (SELECT array_agg((employee_id_map->>eid::TEXT)::UUID) 
                   FROM unnest(rec.employee_ids) AS eid 
                   WHERE employee_id_map ? eid::TEXT)
             ELSE NULL END,
        rec.employee_name, rec.chemicals, rec.fertilizer, rec.fuel,
        rec.notes, rec.inputs_used, rec.watering_containers_used, rec.tying_used_type,
        rec.change_reason, rec.manager_id, rec.manager_name, rec.admin_name,
        rec.paid, rec.paid_at, rec.paid_by, rec.origin,
        CASE WHEN rec.parent_work_log_id IS NOT NULL AND work_log_id_map ? rec.parent_work_log_id::TEXT
             THEN (work_log_id_map->>rec.parent_work_log_id::TEXT)::UUID 
             ELSE NULL END,
        rec.manager_submission_status, rec.manager_submitted_at,
        rec.manager_submitted_number_of_people, rec.manager_submitted_rate_per_person,
        rec.manager_submitted_total_price, rec.manager_submitted_notes,
        rec.manager_submitted_inputs_used, rec.manager_submitted_work_type,
        rec.approved_by, rec.approved_by_name, rec.created_at, rec.updated_at
      );
      work_log_id_map := work_log_id_map || jsonb_build_object(rec.id::TEXT, new_id::TEXT);
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'work_logs', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('work_logs', moved);

    -- 14. Expenses
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.expenses WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.expenses (
        id, company_id, project_id, crop_type, harvest_id, category, description,
        amount, date, stage_index, stage_name, synced_from_work_log_id, synced,
        work_card_id, paid, paid_at, paid_by, paid_by_name, meta, created_at, updated_at
      ) VALUES (
        new_id, _target_company_id,
        CASE WHEN rec.project_id IS NOT NULL 
             THEN (project_id_map->>rec.project_id::TEXT)::UUID 
             ELSE NULL END,
        rec.crop_type,
        CASE WHEN rec.harvest_id IS NOT NULL AND harvest_id_map ? rec.harvest_id::TEXT
             THEN (harvest_id_map->>rec.harvest_id::TEXT)::UUID 
             ELSE NULL END,
        rec.category, rec.description, rec.amount, rec.date,
        rec.stage_index, rec.stage_name,
        CASE WHEN rec.synced_from_work_log_id IS NOT NULL 
             THEN (work_log_id_map->>rec.synced_from_work_log_id::TEXT)::UUID 
             ELSE NULL END,
        rec.synced,
        CASE WHEN rec.work_card_id IS NOT NULL 
             THEN (work_card_id_map->>rec.work_card_id::TEXT)::UUID 
             ELSE NULL END,
        rec.paid, rec.paid_at, rec.paid_by, rec.paid_by_name, rec.meta,
        rec.created_at, rec.updated_at
      );
      expense_id_map := expense_id_map || jsonb_build_object(rec.id::TEXT, new_id::TEXT);
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'expenses', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('expenses', moved);

    -- 15. Harvests
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.harvests WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.harvests (
        id, company_id, project_id, crop_type, harvest_date, quantity, unit,
        location, notes, quality, destination, farm_pricing_mode, farm_price_unit_type,
        farm_unit_price, farm_total_price, market_name, broker_id, broker_name,
        lorry_plate, lorry_plates, driver_id, driver_name, created_at
      ) VALUES (
        new_id, _target_company_id,
        (project_id_map->>rec.project_id::TEXT)::UUID,
        rec.crop_type, rec.harvest_date, rec.quantity, rec.unit,
        rec.location, rec.notes, rec.quality, rec.destination,
        rec.farm_pricing_mode, rec.farm_price_unit_type, rec.farm_unit_price,
        rec.farm_total_price, rec.market_name, rec.broker_id, rec.broker_name,
        rec.lorry_plate, rec.lorry_plates, rec.driver_id, rec.driver_name, rec.created_at
      );
      harvest_id_map := harvest_id_map || jsonb_build_object(rec.id::TEXT, new_id::TEXT);
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'harvests', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('harvests', moved);

    -- Update expenses that reference harvests
    UPDATE public.expenses e
    SET harvest_id = (harvest_id_map->>e.harvest_id::TEXT)::UUID
    WHERE e.company_id = _target_company_id
      AND e.harvest_id IS NOT NULL
      AND NOT (harvest_id_map ? e.harvest_id::TEXT);

    -- 16. Sales
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.sales WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.sales (
        id, company_id, project_id, crop_type, harvest_id, buyer_name, quantity,
        unit, unit_price, total_amount, date, status, broker_id, amount_paid, created_at
      ) VALUES (
        new_id, _target_company_id,
        (project_id_map->>rec.project_id::TEXT)::UUID,
        rec.crop_type,
        CASE WHEN rec.harvest_id IS NOT NULL 
             THEN (harvest_id_map->>rec.harvest_id::TEXT)::UUID 
             ELSE NULL END,
        rec.buyer_name, rec.quantity, rec.unit, rec.unit_price, rec.total_amount,
        rec.date, rec.status, rec.broker_id, rec.amount_paid, rec.created_at
      );
      sale_id_map := sale_id_map || jsonb_build_object(rec.id::TEXT, new_id::TEXT);
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'sales', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('sales', moved);

    -- 17. Harvest collections
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.harvest_collections WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.harvest_collections (
        id, company_id, project_id, crop_type, name, harvest_date, price_per_kg_picker,
        total_harvest_kg, total_picker_cost, status, buyer_paid_at, harvest_id, sale_id,
        created_at, created_at_local
      ) VALUES (
        new_id, _target_company_id,
        (project_id_map->>rec.project_id::TEXT)::UUID,
        rec.crop_type, rec.name, rec.harvest_date, rec.price_per_kg_picker,
        rec.total_harvest_kg, rec.total_picker_cost, rec.status, rec.buyer_paid_at,
        CASE WHEN rec.harvest_id IS NOT NULL 
             THEN (harvest_id_map->>rec.harvest_id::TEXT)::UUID 
             ELSE NULL END,
        CASE WHEN rec.sale_id IS NOT NULL 
             THEN (sale_id_map->>rec.sale_id::TEXT)::UUID 
             ELSE NULL END,
        rec.created_at, rec.created_at_local
      );
      collection_id_map := collection_id_map || jsonb_build_object(rec.id::TEXT, new_id::TEXT);
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'harvest_collections', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('harvest_collections', moved);

    -- 18. Harvest pickers
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.harvest_pickers WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.harvest_pickers (
        id, company_id, collection_id, name, total_kg, total_pay, is_paid,
        paid_at, payment_batch_id, created_at, updated_at
      ) VALUES (
        new_id, _target_company_id,
        (collection_id_map->>rec.collection_id::TEXT)::UUID,
        rec.name, rec.total_kg, rec.total_pay, rec.is_paid,
        rec.paid_at, rec.payment_batch_id, rec.created_at, rec.updated_at
      );
      picker_id_map := picker_id_map || jsonb_build_object(rec.id::TEXT, new_id::TEXT);
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'harvest_pickers', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('harvest_pickers', moved);

    -- 19. Picker weigh entries
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.picker_weigh_entries WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.picker_weigh_entries (
        id, company_id, collection_id, picker_id, weight_kg, recorded_at, created_at
      ) VALUES (
        new_id, _target_company_id,
        (collection_id_map->>rec.collection_id::TEXT)::UUID,
        (picker_id_map->>rec.picker_id::TEXT)::UUID,
        rec.weight_kg, rec.recorded_at, rec.created_at
      );
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'picker_weigh_entries', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('picker_weigh_entries', moved);

    -- 20. Harvest payment batches
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.harvest_payment_batches WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.harvest_payment_batches (
        id, company_id, collection_id, picker_ids, total_amount, created_by, created_at
      ) VALUES (
        new_id, _target_company_id,
        (collection_id_map->>rec.collection_id::TEXT)::UUID,
        (SELECT array_agg((picker_id_map->>pid::TEXT)::UUID) 
         FROM unnest(rec.picker_ids) AS pid 
         WHERE picker_id_map ? pid::TEXT),
        rec.total_amount, rec.created_by, rec.created_at
      );
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'harvest_payment_batches', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('harvest_payment_batches', moved);

    -- 21. Harvest wallets (unique constraint handling)
    moved := 0;
    skipped := 0;
    FOR rec IN 
      SELECT * FROM public.harvest_wallets WHERE company_id = _source_company_id
    LOOP
      -- Check for unique constraint conflict
      IF EXISTS(
        SELECT 1 FROM public.harvest_wallets 
        WHERE company_id = _target_company_id 
          AND project_id = (project_id_map->>rec.project_id::TEXT)::UUID
          AND crop_type = rec.crop_type
      ) THEN
        INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, migration_action, conflict_reason)
        VALUES (migration_id, 'harvest_wallets', rec.id::TEXT, 'skipped', 'Duplicate project/crop_type in target');
        skipped := skipped + 1;
        CONTINUE;
      END IF;

      new_id := gen_random_uuid();
      INSERT INTO public.harvest_wallets (
        id, company_id, project_id, crop_type, cash_received_total, cash_paid_out_total,
        current_balance, last_updated_at, created_at, created_by, updated_by
      ) VALUES (
        new_id, _target_company_id,
        (project_id_map->>rec.project_id::TEXT)::UUID,
        rec.crop_type, rec.cash_received_total, rec.cash_paid_out_total,
        rec.current_balance, rec.last_updated_at, rec.created_at, rec.created_by, rec.updated_by
      );
      wallet_id_map := wallet_id_map || jsonb_build_object(rec.id::TEXT, new_id::TEXT);
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'harvest_wallets', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('harvest_wallets', moved);
    skipped_counts := skipped_counts || jsonb_build_object('harvest_wallets', skipped);

    -- 22. Collection cash usage
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.collection_cash_usage WHERE company_id = _source_company_id
    LOOP
      -- Skip if wallet wasn't migrated
      IF NOT (wallet_id_map ? rec.wallet_id::TEXT) THEN
        INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, migration_action, conflict_reason)
        VALUES (migration_id, 'collection_cash_usage', rec.id::TEXT, 'skipped', 'Wallet not migrated');
        CONTINUE;
      END IF;

      new_id := gen_random_uuid();
      INSERT INTO public.collection_cash_usage (
        id, company_id, project_id, crop_type, wallet_id, collection_id, 
        total_deducted, created_at, last_updated_at
      ) VALUES (
        new_id, _target_company_id,
        (project_id_map->>rec.project_id::TEXT)::UUID,
        rec.crop_type,
        (wallet_id_map->>rec.wallet_id::TEXT)::UUID,
        (collection_id_map->>rec.collection_id::TEXT)::UUID,
        rec.total_deducted, rec.created_at, rec.last_updated_at
      );
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'collection_cash_usage', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('collection_cash_usage', moved);

    -- 23. Project wallet meta (unique constraint handling)
    moved := 0;
    skipped := 0;
    FOR rec IN 
      SELECT * FROM public.project_wallet_meta WHERE company_id = _source_company_id
    LOOP
      IF EXISTS(
        SELECT 1 FROM public.project_wallet_meta 
        WHERE company_id = _target_company_id 
          AND project_id = (project_id_map->>rec.project_id::TEXT)::UUID
      ) THEN
        INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, migration_action, conflict_reason)
        VALUES (migration_id, 'project_wallet_meta', rec.id::TEXT, 'skipped', 'Duplicate project in target');
        skipped := skipped + 1;
        CONTINUE;
      END IF;

      new_id := gen_random_uuid();
      INSERT INTO public.project_wallet_meta (
        id, company_id, project_id, migrated_at, created_at, updated_at
      ) VALUES (
        new_id, _target_company_id,
        (project_id_map->>rec.project_id::TEXT)::UUID,
        rec.migrated_at, rec.created_at, rec.updated_at
      );
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'project_wallet_meta', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('project_wallet_meta', moved);
    skipped_counts := skipped_counts || jsonb_build_object('project_wallet_meta', skipped);

    -- 24. Project wallet ledger
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.project_wallet_ledger WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.project_wallet_ledger (
        id, company_id, project_id, type, amount, description, migrated_from, reference_id, created_at
      ) VALUES (
        new_id, _target_company_id,
        (project_id_map->>rec.project_id::TEXT)::UUID,
        rec.type, rec.amount, rec.description, rec.migrated_from, rec.reference_id, rec.created_at
      );
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'project_wallet_ledger', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('project_wallet_ledger', moved);

    -- 25. Inventory purchases
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.inventory_purchases WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.inventory_purchases (
        id, company_id, inventory_item_id, quantity_added, unit, total_cost,
        price_per_unit, project_id, date, expense_id, created_at
      ) VALUES (
        new_id, _target_company_id,
        (inventory_item_id_map->>rec.inventory_item_id::TEXT)::UUID,
        rec.quantity_added, rec.unit, rec.total_cost, rec.price_per_unit,
        CASE WHEN rec.project_id IS NOT NULL 
             THEN (project_id_map->>rec.project_id::TEXT)::UUID 
             ELSE NULL END,
        rec.date,
        CASE WHEN rec.expense_id IS NOT NULL 
             THEN (expense_id_map->>rec.expense_id::TEXT)::UUID 
             ELSE NULL END,
        rec.created_at
      );
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'inventory_purchases', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('inventory_purchases', moved);

    -- 26. Inventory usage
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.inventory_usage WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.inventory_usage (
        id, company_id, project_id, inventory_item_id, category, quantity, unit,
        source, work_log_id, work_card_id, harvest_id, manager_name,
        stage_index, stage_name, date, created_at
      ) VALUES (
        new_id, _target_company_id,
        (project_id_map->>rec.project_id::TEXT)::UUID,
        (inventory_item_id_map->>rec.inventory_item_id::TEXT)::UUID,
        rec.category, rec.quantity, rec.unit, rec.source,
        CASE WHEN rec.work_log_id IS NOT NULL 
             THEN (work_log_id_map->>rec.work_log_id::TEXT)::UUID 
             ELSE NULL END,
        CASE WHEN rec.work_card_id IS NOT NULL 
             THEN (work_card_id_map->>rec.work_card_id::TEXT)::UUID 
             ELSE NULL END,
        CASE WHEN rec.harvest_id IS NOT NULL 
             THEN (harvest_id_map->>rec.harvest_id::TEXT)::UUID 
             ELSE NULL END,
        rec.manager_name, rec.stage_index, rec.stage_name, rec.date, rec.created_at
      );
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'inventory_usage', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('inventory_usage', moved);

    -- 27. Inventory audit logs
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.inventory_audit_logs WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.inventory_audit_logs (
        id, company_id, action, inventory_item_id, quantity, metadata, created_by, created_at
      ) VALUES (
        new_id, _target_company_id, rec.action,
        CASE WHEN rec.inventory_item_id IS NOT NULL 
             THEN (inventory_item_id_map->>rec.inventory_item_id::TEXT)::UUID 
             ELSE NULL END,
        rec.quantity, rec.metadata, rec.created_by, rec.created_at
      );
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'inventory_audit_logs', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('inventory_audit_logs', moved);

    -- 28. Crop catalog
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.crop_catalog WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.crop_catalog (
        id, company_id, crop_type, data, created_at, updated_at
      ) VALUES (
        new_id, _target_company_id, rec.crop_type, rec.data, rec.created_at, rec.updated_at
      );
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'crop_catalog', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('crop_catalog', moved);

    -- 29. Challenge templates (TEXT primary key)
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.challenge_templates WHERE company_id = _source_company_id
    LOOP
      INSERT INTO public.challenge_templates (
        id, company_id, crop_type, phase, title, description, priority,
        default_due_offset_days, is_reusable, what_was_done, plan2_if_fails,
        items_used_summary, created_by, created_at, updated_at
      ) VALUES (
        'migrated_' || rec.id, _target_company_id, rec.crop_type, rec.phase,
        rec.title, rec.description, rec.priority, rec.default_due_offset_days,
        rec.is_reusable, rec.what_was_done, rec.plan2_if_fails,
        rec.items_used_summary, rec.created_by, rec.created_at, rec.updated_at
      );
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'challenge_templates', rec.id, 'migrated_' || rec.id, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('challenge_templates', moved);

    -- 30. Company records
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.company_records WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.company_records (
        id, company_id, crop_id, category, title, content, highlights, tags,
        created_by, created_at, updated_at
      ) VALUES (
        new_id, _target_company_id, rec.crop_id, rec.category, rec.title,
        rec.content, rec.highlights, rec.tags, rec.created_by, rec.created_at, rec.updated_at
      );
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'company_records', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('company_records', moved);

    -- 31. Deliveries
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.deliveries WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.deliveries (
        id, company_id, project_id, harvest_id, driver_id, from_location, to_location,
        quantity, unit, status, distance_km, fuel_used_liters, started_at,
        completed_at, date, notes, created_at
      ) VALUES (
        new_id, _target_company_id,
        CASE WHEN rec.project_id IS NOT NULL 
             THEN (project_id_map->>rec.project_id::TEXT)::UUID 
             ELSE NULL END,
        CASE WHEN rec.harvest_id IS NOT NULL 
             THEN (harvest_id_map->>rec.harvest_id::TEXT)::UUID 
             ELSE NULL END,
        CASE WHEN rec.driver_id IS NOT NULL 
             THEN (employee_id_map->>rec.driver_id::TEXT)::UUID 
             ELSE NULL END,
        rec.from_location, rec.to_location, rec.quantity, rec.unit, rec.status,
        rec.distance_km, rec.fuel_used_liters, rec.started_at, rec.completed_at,
        rec.date, rec.notes, rec.created_at
      );
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'deliveries', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('deliveries', moved);

    -- 32. Custom roles
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.custom_roles WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.custom_roles (
        id, company_id, name, definition, created_at, updated_at
      ) VALUES (
        new_id, _target_company_id, rec.name, rec.definition, rec.created_at, rec.updated_at
      );
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'custom_roles', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('custom_roles', moved);

    -- 33. Harvest cash pools
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.harvest_cash_pools WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.harvest_cash_pools (
        id, company_id, collection_id, balance, created_at, updated_at
      ) VALUES (
        new_id, _target_company_id,
        CASE WHEN rec.collection_id IS NOT NULL 
             THEN (collection_id_map->>rec.collection_id::TEXT)::UUID 
             ELSE NULL END,
        rec.balance, rec.created_at, rec.updated_at
      );
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'harvest_cash_pools', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('harvest_cash_pools', moved);

    -- 34. Code red
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.code_red WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.code_red (id, company_id, status, updated_at)
      VALUES (new_id, _target_company_id, rec.status, rec.updated_at);
      
      -- Migrate code red messages
      INSERT INTO public.code_red_messages (id, code_red_id, text, created_by, created_at)
      SELECT gen_random_uuid(), new_id, text, created_by, created_at
      FROM public.code_red_messages
      WHERE code_red_id = rec.id;
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'code_red', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('code_red', moved);

    -- 35. Feedback
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.feedback WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.feedback (id, company_id, message, created_at, reply_at, reply_text)
      VALUES (new_id, _target_company_id, rec.message, rec.created_at, rec.reply_at, rec.reply_text);
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'feedback', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('feedback', moved);

    -- 36. Activity logs
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.activity_logs WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.activity_logs (id, company_id, project_id, action, metadata, created_at)
      VALUES (
        new_id, _target_company_id,
        CASE WHEN rec.project_id IS NOT NULL 
             THEN (project_id_map->>rec.project_id::TEXT)::UUID 
             ELSE NULL END,
        rec.action, rec.metadata, rec.created_at
      );
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'activity_logs', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('activity_logs', moved);

    -- 37. Audit logs (copy with new company_id)
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.audit_logs WHERE company_id = _source_company_id
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO public.audit_logs (id, company_id, action, entity_type, entity_id, metadata, created_at)
      VALUES (new_id, _target_company_id, rec.action, rec.entity_type, rec.entity_id, rec.metadata, rec.created_at);
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'audit_logs', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('audit_logs', moved);

    -- ===== PHASE 2: Migrate memberships (excluding admin) =====
    moved := 0;
    skipped := 0;
    FOR rec IN 
      SELECT * FROM public.company_members 
      WHERE company_id::TEXT = _source_company_id 
        AND role NOT IN ('company-admin', 'company_admin')
    LOOP
      -- Check if user already has membership in target
      IF EXISTS(
        SELECT 1 FROM public.company_members 
        WHERE company_id::TEXT = _target_company_id AND user_id = rec.user_id
      ) THEN
        INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, migration_action, conflict_reason)
        VALUES (migration_id, 'company_members', rec.id::TEXT, 'skipped', 'User already member of target company');
        skipped := skipped + 1;
        CONTINUE;
      END IF;

      new_id := gen_random_uuid();
      INSERT INTO public.company_members (id, company_id, user_id, role, created_at)
      VALUES (new_id, _target_company_id::UUID, rec.user_id, rec.role, rec.created_at);
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, target_record_id, migration_action)
      VALUES (migration_id, 'company_members', rec.id::TEXT, new_id::TEXT, 'migrated');
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('company_members', moved);
    skipped_counts := skipped_counts || jsonb_build_object('company_members', skipped);

    -- ===== PHASE 3: Update profiles pointing to source =====
    moved := 0;
    FOR rec IN 
      SELECT * FROM public.profiles 
      WHERE active_company_id::TEXT = _source_company_id
    LOOP
      -- Don't update if they are the target admin
      IF rec.id = target_info.admin_user_id THEN
        INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, migration_action, conflict_reason)
        VALUES (migration_id, 'profiles', rec.id, 'skipped', 'Target admin profile unchanged');
        CONTINUE;
      END IF;

      UPDATE public.profiles 
      SET active_company_id = _target_company_id::UUID
      WHERE id = rec.id;
      
      INSERT INTO admin.company_migration_items (migration_id, table_name, source_record_id, migration_action, metadata)
      VALUES (migration_id, 'profiles', rec.id, 'migrated', jsonb_build_object('updated_active_company_id', TRUE));
      moved := moved + 1;
    END LOOP;
    moved_counts := moved_counts || jsonb_build_object('profiles_updated', moved);

    -- NOTE: Subscriptions are NOT migrated - target keeps its own subscription

    -- ===== PHASE 4: Archive source company if requested =====
    IF _archive_source THEN
      UPDATE public.companies 
      SET status = 'inactive', name = name || ' [ARCHIVED - Migrated to ' || target_info.company_name || ']'
      WHERE id = _source_company_id;

      UPDATE admin.company_migrations
      SET source_archived = TRUE
      WHERE id = migration_id;
    END IF;

    -- Build summary
    summary := jsonb_build_object(
      'source_company', jsonb_build_object(
        'id', _source_company_id,
        'name', source_info.company_name,
        'archived', _archive_source
      ),
      'target_company', jsonb_build_object(
        'id', _target_company_id,
        'name', target_info.company_name,
        'admin_user_id', target_info.admin_user_id,
        'admin_email', target_info.admin_email
      ),
      'moved_counts', moved_counts,
      'skipped_counts', skipped_counts,
      'total_moved', (SELECT SUM(value::INT) FROM jsonb_each_text(moved_counts)),
      'total_skipped', (SELECT SUM(value::INT) FROM jsonb_each_text(skipped_counts))
    );

    -- Mark migration as completed
    UPDATE admin.company_migrations
    SET 
      status = 'completed',
      completed_at = now(),
      migration_summary = summary
    WHERE id = migration_id;

    RETURN jsonb_build_object(
      'success', TRUE,
      'migration_id', migration_id,
      'summary', summary
    );

  EXCEPTION WHEN OTHERS THEN
    -- Mark migration as failed
    UPDATE admin.company_migrations
    SET 
      status = 'failed',
      completed_at = now(),
      error_message = SQLERRM
    WHERE id = migration_id;

    RETURN jsonb_build_object(
      'success', FALSE,
      'migration_id', migration_id,
      'error', SQLERRM
    );
  END;
END;
$$;

-- ============== GET MIGRATION HISTORY ==============

CREATE OR REPLACE FUNCTION admin.get_migration_history(_limit INT DEFAULT 50)
RETURNS TABLE(
  id UUID,
  source_company_id TEXT,
  source_company_name TEXT,
  target_company_id TEXT,
  target_company_name TEXT,
  target_admin_email TEXT,
  status TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  source_archived BOOLEAN,
  migration_summary JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  is_service_role BOOLEAN;
BEGIN
  -- Allow service role (postgres) or developers
  is_service_role := (SELECT current_user = 'postgres' OR current_setting('role', true) = 'service_role');
  IF NOT is_service_role AND NOT admin.is_developer(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: developer only';
  END IF;

  RETURN QUERY
  SELECT 
    m.id,
    m.source_company_id,
    m.source_company_name,
    m.target_company_id,
    m.target_company_name,
    m.target_admin_email,
    m.status,
    m.started_at,
    m.completed_at,
    m.error_message,
    m.source_archived,
    m.migration_summary,
    m.created_by,
    m.created_at
  FROM admin.company_migrations m
  ORDER BY m.created_at DESC
  LIMIT _limit;
END;
$$;

-- ============== GET MIGRATION DETAILS ==============

CREATE OR REPLACE FUNCTION admin.get_migration_details(_migration_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  migration RECORD;
  items JSONB;
  is_service_role BOOLEAN;
BEGIN
  -- Allow service role (postgres) or developers
  is_service_role := (SELECT current_user = 'postgres' OR current_setting('role', true) = 'service_role');
  IF NOT is_service_role AND NOT admin.is_developer(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: developer only';
  END IF;

  SELECT * INTO migration FROM admin.company_migrations WHERE id = _migration_id;

  IF migration.id IS NULL THEN
    RAISE EXCEPTION 'Migration not found: %', _migration_id;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id', i.id,
    'table_name', i.table_name,
    'source_record_id', i.source_record_id,
    'target_record_id', i.target_record_id,
    'action', i.migration_action,
    'conflict_reason', i.conflict_reason,
    'metadata', i.metadata,
    'created_at', i.created_at
  ) ORDER BY i.created_at)
  INTO items
  FROM admin.company_migration_items i
  WHERE i.migration_id = _migration_id;

  RETURN jsonb_build_object(
    'migration', jsonb_build_object(
      'id', migration.id,
      'source_company_id', migration.source_company_id,
      'source_company_name', migration.source_company_name,
      'target_company_id', migration.target_company_id,
      'target_company_name', migration.target_company_name,
      'target_admin_user_id', migration.target_admin_user_id,
      'target_admin_email', migration.target_admin_email,
      'status', migration.status,
      'started_at', migration.started_at,
      'completed_at', migration.completed_at,
      'error_message', migration.error_message,
      'source_archived', migration.source_archived,
      'migration_summary', migration.migration_summary,
      'created_by', migration.created_by,
      'created_at', migration.created_at
    ),
    'items', COALESCE(items, '[]'::jsonb),
    'item_summary', (
      SELECT jsonb_object_agg(table_name, jsonb_build_object(
        'migrated', SUM(CASE WHEN migration_action = 'migrated' THEN 1 ELSE 0 END),
        'skipped', SUM(CASE WHEN migration_action = 'skipped' THEN 1 ELSE 0 END),
        'error', SUM(CASE WHEN migration_action = 'error' THEN 1 ELSE 0 END)
      ))
      FROM admin.company_migration_items
      WHERE migration_id = _migration_id
      GROUP BY table_name
    )
  );
END;
$$;

-- ============== GRANT PERMISSIONS ==============

GRANT EXECUTE ON FUNCTION admin.get_migrateable_tables() TO authenticated;
GRANT EXECUTE ON FUNCTION admin.get_company_with_admin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin.list_companies_for_migration() TO authenticated;
GRANT EXECUTE ON FUNCTION admin.preview_company_migration(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin.execute_company_migration(TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION admin.get_migration_history(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin.get_migration_details(UUID) TO authenticated;

-- RLS for migration tables (developer-only)
ALTER TABLE admin.company_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.company_migration_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dev_read_company_migrations ON admin.company_migrations;
CREATE POLICY dev_read_company_migrations ON admin.company_migrations
  FOR SELECT USING (admin.is_developer(auth.uid()));

DROP POLICY IF EXISTS dev_insert_company_migrations ON admin.company_migrations;
CREATE POLICY dev_insert_company_migrations ON admin.company_migrations
  FOR INSERT WITH CHECK (admin.is_developer(auth.uid()));

DROP POLICY IF EXISTS dev_update_company_migrations ON admin.company_migrations;
CREATE POLICY dev_update_company_migrations ON admin.company_migrations
  FOR UPDATE USING (admin.is_developer(auth.uid()));

DROP POLICY IF EXISTS dev_read_company_migration_items ON admin.company_migration_items;
CREATE POLICY dev_read_company_migration_items ON admin.company_migration_items
  FOR SELECT USING (admin.is_developer(auth.uid()));

DROP POLICY IF EXISTS dev_insert_company_migration_items ON admin.company_migration_items;
CREATE POLICY dev_insert_company_migration_items ON admin.company_migration_items
  FOR INSERT WITH CHECK (admin.is_developer(auth.uid()));

GRANT SELECT, INSERT, UPDATE ON admin.company_migrations TO authenticated;
GRANT SELECT, INSERT ON admin.company_migration_items TO authenticated;

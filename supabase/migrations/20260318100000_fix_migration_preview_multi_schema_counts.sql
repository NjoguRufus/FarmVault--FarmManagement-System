-- =============================================================================
-- Fix Migration Preview Counts to Use Canonical Tables Only
-- 
-- IMPORTANT: This migration uses CANONICAL source tables only.
-- 
-- Key distinctions:
-- 1. projects.projects and public.projects = SAME shape, SAME data (mirrored)
-- 2. finance.expenses and public.expenses = SAME shape, SAME data (mirrored)
-- 3. harvest.harvest_collections and public.harvest_collections = DIFFERENT tables!
-- 4. harvest.harvest_pickers and public.harvest_pickers = DIFFERENT tables!
--
-- Canonical sources (the real operational data):
-- - projects.projects (canonical for projects)
-- - finance.expenses (canonical for expenses)
-- - harvest.harvest_collections (canonical for harvest collections)
-- - harvest.harvest_pickers (canonical for harvest pickers)
-- - harvest.picker_intake_entries (canonical for picker intake)
-- - harvest.picker_payment_entries (canonical for picker payments)
--
-- Active company with real data: db043ec3-f686-403e-a3cb-65173b8b234f
-- =============================================================================

-- ============== UPDATED MIGRATION PREVIEW FUNCTION ==============

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
  row_count INT;
  source_uuid UUID;
  target_uuid UUID;
BEGIN
  -- Allow service role (postgres) or developers
  is_service_role := (SELECT current_user = 'postgres' OR current_setting('role', true) = 'service_role');
  IF NOT is_service_role AND NOT admin.is_developer() THEN
    RAISE EXCEPTION 'Access denied: developer only';
  END IF;

  -- Convert TEXT to UUID for schema table comparisons
  BEGIN
    source_uuid := _source_company_id::UUID;
    target_uuid := _target_company_id::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid company ID format';
  END;

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

  -- =====================================================================
  -- Count from CANONICAL source tables only (no double-counting)
  -- =====================================================================

  -- Employees (public.employees - canonical)
  SELECT COUNT(*) INTO row_count FROM public.employees WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('employees', row_count);
  
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

  -- =================================================================
  -- PROJECTS: Canonical source is projects.projects
  -- (public.projects is a mirror with same data, so only count once)
  -- =================================================================
  row_count := 0;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'projects' AND table_name = 'projects'
  ) THEN
    SELECT COUNT(*) INTO row_count 
    FROM projects.projects 
    WHERE company_id = source_uuid;
  ELSE
    -- Fallback to public if schema table doesn't exist
    SELECT COUNT(*) INTO row_count FROM public.projects WHERE company_id = _source_company_id;
  END IF;
  table_counts := table_counts || jsonb_build_object('projects', row_count);

  -- Project stages (public.project_stages - no schema version)
  SELECT COUNT(*) INTO row_count FROM public.project_stages WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('project_stages', row_count);

  -- =================================================================
  -- EXPENSES: Canonical source is finance.expenses
  -- (public.expenses is a mirror with same data, so only count once)
  -- =================================================================
  row_count := 0;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'finance' AND table_name = 'expenses'
  ) THEN
    SELECT COUNT(*) INTO row_count 
    FROM finance.expenses 
    WHERE company_id = source_uuid;
  ELSE
    SELECT COUNT(*) INTO row_count FROM public.expenses WHERE company_id = _source_company_id;
  END IF;
  table_counts := table_counts || jsonb_build_object('expenses', row_count);

  -- =================================================================
  -- HARVESTS: Canonical source is harvest.harvests
  -- =================================================================
  row_count := 0;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'harvest' AND table_name = 'harvests'
  ) THEN
    SELECT COUNT(*) INTO row_count 
    FROM harvest.harvests 
    WHERE company_id = source_uuid;
  ELSE
    SELECT COUNT(*) INTO row_count FROM public.harvests WHERE company_id = _source_company_id;
  END IF;
  table_counts := table_counts || jsonb_build_object('harvests', row_count);

  -- =================================================================
  -- HARVEST COLLECTIONS: Canonical source is harvest.harvest_collections
  -- NOTE: harvest.harvest_collections and public.harvest_collections are 
  -- DIFFERENT tables with different shapes! Use harvest schema only.
  -- =================================================================
  row_count := 0;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'harvest' AND table_name = 'harvest_collections'
  ) THEN
    SELECT COUNT(*) INTO row_count 
    FROM harvest.harvest_collections 
    WHERE company_id = source_uuid;
  END IF;
  table_counts := table_counts || jsonb_build_object('harvest_collections', row_count);

  -- =================================================================
  -- HARVEST PICKERS: Canonical source is harvest.harvest_pickers
  -- NOTE: harvest.harvest_pickers and public.harvest_pickers are 
  -- DIFFERENT tables with different shapes! Use harvest schema only.
  -- =================================================================
  row_count := 0;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'harvest' AND table_name = 'harvest_pickers'
  ) THEN
    SELECT COUNT(*) INTO row_count 
    FROM harvest.harvest_pickers 
    WHERE company_id = source_uuid;
  END IF;
  table_counts := table_counts || jsonb_build_object('harvest_pickers', row_count);

  -- =================================================================
  -- PICKER INTAKE ENTRIES: Canonical source is harvest.picker_intake_entries
  -- =================================================================
  row_count := 0;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'harvest' AND table_name = 'picker_intake_entries'
  ) THEN
    SELECT COUNT(*) INTO row_count 
    FROM harvest.picker_intake_entries 
    WHERE company_id = source_uuid;
  END IF;
  table_counts := table_counts || jsonb_build_object('picker_intake_entries', row_count);

  -- =================================================================
  -- PICKER PAYMENT ENTRIES: Canonical source is harvest.picker_payment_entries
  -- =================================================================
  row_count := 0;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'harvest' AND table_name = 'picker_payment_entries'
  ) THEN
    SELECT COUNT(*) INTO row_count 
    FROM harvest.picker_payment_entries 
    WHERE company_id = source_uuid;
  END IF;
  table_counts := table_counts || jsonb_build_object('picker_payment_entries', row_count);

  -- Harvest payment batches (public - different from picker_payment_entries)
  SELECT COUNT(*) INTO row_count FROM public.harvest_payment_batches WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('harvest_payment_batches', row_count);

  -- Suppliers (public.suppliers - canonical)
  SELECT COUNT(*) INTO row_count FROM public.suppliers WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('suppliers', row_count);

  -- Inventory items (public.inventory_items - canonical)
  SELECT COUNT(*) INTO row_count FROM public.inventory_items WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('inventory_items', row_count);

  -- Inventory categories
  SELECT COUNT(*) INTO row_count FROM public.inventory_categories WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('inventory_categories', row_count);

  -- Inventory purchases
  SELECT COUNT(*) INTO row_count FROM public.inventory_purchases WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('inventory_purchases', row_count);

  -- Inventory usage
  SELECT COUNT(*) INTO row_count FROM public.inventory_usage WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('inventory_usage', row_count);

  -- Work logs
  SELECT COUNT(*) INTO row_count FROM public.work_logs WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('work_logs', row_count);

  -- Operations work cards
  SELECT COUNT(*) INTO row_count FROM public.operations_work_cards WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('operations_work_cards', row_count);

  -- Season challenges
  SELECT COUNT(*) INTO row_count FROM public.season_challenges WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('season_challenges', row_count);

  -- Needed items
  SELECT COUNT(*) INTO row_count FROM public.needed_items WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('needed_items', row_count);

  -- Sales
  SELECT COUNT(*) INTO row_count FROM public.sales WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('sales', row_count);

  -- Budget pools
  SELECT COUNT(*) INTO row_count FROM public.budget_pools WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('budget_pools', row_count);

  -- Crop catalog
  SELECT COUNT(*) INTO row_count FROM public.crop_catalog WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('crop_catalog', row_count);

  -- Challenge templates
  SELECT COUNT(*) INTO row_count FROM public.challenge_templates WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('challenge_templates', row_count);

  -- Company records
  SELECT COUNT(*) INTO row_count FROM public.company_records WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('company_records', row_count);

  -- Deliveries
  SELECT COUNT(*) INTO row_count FROM public.deliveries WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('deliveries', row_count);

  -- Custom roles
  SELECT COUNT(*) INTO row_count FROM public.custom_roles WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('custom_roles', row_count);

  -- Harvest wallets
  SELECT COUNT(*) INTO row_count FROM public.harvest_wallets WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('harvest_wallets', row_count);

  -- Project wallet ledger
  SELECT COUNT(*) INTO row_count FROM public.project_wallet_ledger WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('project_wallet_ledger', row_count);

  -- Project wallet meta
  SELECT COUNT(*) INTO row_count FROM public.project_wallet_meta WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('project_wallet_meta', row_count);

  -- Collection cash usage
  SELECT COUNT(*) INTO row_count FROM public.collection_cash_usage WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('collection_cash_usage', row_count);

  -- Code red
  SELECT COUNT(*) INTO row_count FROM public.code_red WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('code_red', row_count);

  -- Feedback
  SELECT COUNT(*) INTO row_count FROM public.feedback WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('feedback', row_count);

  -- Activity logs
  SELECT COUNT(*) INTO row_count FROM public.activity_logs WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('activity_logs', row_count);

  -- Audit logs
  SELECT COUNT(*) INTO row_count FROM public.audit_logs WHERE company_id = _source_company_id;
  table_counts := table_counts || jsonb_build_object('audit_logs', row_count);

  -- Company members (excluding admin)
  SELECT COUNT(*) INTO row_count FROM public.company_members 
  WHERE company_id::TEXT = _source_company_id 
    AND role NOT IN ('company-admin', 'company_admin');
  table_counts := table_counts || jsonb_build_object('company_members', row_count);

  -- Profiles with active_company_id pointing to source
  SELECT COUNT(*) INTO row_count FROM public.profiles 
  WHERE active_company_id::TEXT = _source_company_id;
  table_counts := table_counts || jsonb_build_object('profiles_to_update', row_count);

  -- Check for subscription conflict
  IF EXISTS(SELECT 1 FROM public.company_subscriptions WHERE company_id = _target_company_id) THEN
    warnings := warnings || jsonb_build_array(jsonb_build_object(
      'type', 'subscription_exists',
      'message', 'Target company already has a subscription. Source subscription will NOT be migrated.'
    ));
  END IF;

  -- Check if target has any existing data (check canonical source)
  row_count := 0;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'projects' AND table_name = 'projects'
  ) THEN
    SELECT COUNT(*) INTO row_count 
    FROM projects.projects 
    WHERE company_id = target_uuid;
  ELSE
    SELECT COUNT(*) INTO row_count FROM public.projects WHERE company_id = _target_company_id;
  END IF;
  
  IF row_count > 0 THEN
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

-- ============== UPDATE list_companies_for_migration TO USE CANONICAL TABLES ==============

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
  IF NOT is_service_role AND NOT admin.is_developer() THEN
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
    -- Record counts from CANONICAL source tables only (no double-counting)
    -- Use c.id::UUID for schema tables that have UUID company_id
    jsonb_build_object(
      'employees', (SELECT COUNT(*) FROM public.employees e WHERE e.company_id = c.id),
      'projects', COALESCE((
        SELECT COUNT(*) FROM projects.projects pr 
        WHERE pr.company_id = c.id::UUID
      ), 0),
      'expenses', COALESCE((
        SELECT COUNT(*) FROM finance.expenses ex 
        WHERE ex.company_id = c.id::UUID
      ), 0),
      'harvests', COALESCE((
        SELECT COUNT(*) FROM harvest.harvests h 
        WHERE h.company_id = c.id::UUID
      ), 0),
      'harvest_collections', COALESCE((
        SELECT COUNT(*) FROM harvest.harvest_collections hc 
        WHERE hc.company_id = c.id::UUID
      ), 0),
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

-- Ensure public wrapper is updated too
CREATE OR REPLACE FUNCTION public.list_companies_for_migration()
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
BEGIN
  RETURN QUERY SELECT * FROM admin.list_companies_for_migration();
END;
$$;

-- Update public wrapper for preview
CREATE OR REPLACE FUNCTION public.preview_company_migration(
  _source_company_id TEXT,
  _target_company_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN admin.preview_company_migration(_source_company_id, _target_company_id);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.list_companies_for_migration() TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_company_migration(TEXT, TEXT) TO authenticated;

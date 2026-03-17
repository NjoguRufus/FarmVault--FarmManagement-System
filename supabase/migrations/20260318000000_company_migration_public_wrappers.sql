-- =============================================================================
-- Public RPC Wrappers for Company Migration Functions
-- These wrappers delegate to admin schema functions while maintaining the public RPC interface
-- =============================================================================

-- ============== LIST COMPANIES FOR MIGRATION ==============
-- Returns all companies with admin info for migration UI
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
  -- Delegate to admin function (which checks developer access)
  RETURN QUERY SELECT * FROM admin.list_companies_for_migration();
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_companies_for_migration() TO authenticated;

-- ============== PREVIEW COMPANY MIGRATION ==============
-- Returns migration preview with counts, conflicts, and warnings
CREATE OR REPLACE FUNCTION public.preview_company_migration(
  _source_company_id TEXT,
  _target_company_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Delegate to admin function
  RETURN admin.preview_company_migration(_source_company_id, _target_company_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_company_migration(TEXT, TEXT) TO authenticated;

-- ============== EXECUTE COMPANY MIGRATION ==============
-- Executes the company migration
CREATE OR REPLACE FUNCTION public.execute_company_migration(
  _source_company_id TEXT,
  _target_company_id TEXT,
  _archive_source BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Delegate to admin function
  RETURN admin.execute_company_migration(_source_company_id, _target_company_id, _archive_source);
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_company_migration(TEXT, TEXT, BOOLEAN) TO authenticated;

-- ============== GET MIGRATION HISTORY ==============
-- Returns migration history for the developer dashboard
CREATE OR REPLACE FUNCTION public.get_migration_history(_limit INT DEFAULT 50)
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
BEGIN
  RETURN QUERY SELECT * FROM admin.get_migration_history(_limit);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_migration_history(INT) TO authenticated;

-- ============== GET MIGRATION DETAILS ==============
-- Returns detailed information about a specific migration
CREATE OR REPLACE FUNCTION public.get_migration_details(_migration_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN admin.get_migration_details(_migration_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_migration_details(UUID) TO authenticated;

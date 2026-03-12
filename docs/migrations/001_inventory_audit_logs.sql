-- ============================================================================
-- INVENTORY AUDIT LOGS TABLE MIGRATION
-- ============================================================================
-- This migration creates a dedicated audit logs table for inventory actions.
-- 
-- Root Cause: The code was querying public.inventory_audit_logs which does not
-- exist in the live schema. This migration creates the table with proper
-- structure and RLS policies.
--
-- Run this in Supabase SQL Editor.
-- ============================================================================

-- ============================================================================
-- STEP 1: Create the inventory_audit_logs table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES public.inventory_item_master(id) ON DELETE SET NULL,
    
    -- Action details
    action_type TEXT NOT NULL CHECK (action_type IN (
        'ITEM_CREATED',
        'ITEM_EDITED', 
        'STOCK_IN',
        'STOCK_DEDUCTED',
        'USAGE_RECORDED',
        'ITEM_ARCHIVED',
        'ITEM_RESTORED',
        'ITEM_DELETED'
    )),
    
    -- Snapshot data (preserved even if item is deleted)
    item_name TEXT,
    quantity NUMERIC,
    unit TEXT,
    
    -- Actor information (TEXT because Clerk user IDs are not UUIDs)
    actor_user_id TEXT,
    actor_name TEXT,
    actor_role TEXT,
    
    -- Additional context
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON TABLE public.inventory_audit_logs IS 'Audit trail for all inventory actions including create, edit, stock changes, archive, and restore';

-- ============================================================================
-- STEP 2: Create indexes for efficient querying
-- ============================================================================

-- Index for company-scoped queries (most common)
CREATE INDEX IF NOT EXISTS idx_inventory_audit_logs_company_created 
ON public.inventory_audit_logs (company_id, created_at DESC);

-- Index for item-specific audit trail
CREATE INDEX IF NOT EXISTS idx_inventory_audit_logs_item 
ON public.inventory_audit_logs (inventory_item_id, created_at DESC)
WHERE inventory_item_id IS NOT NULL;

-- Index for action type filtering
CREATE INDEX IF NOT EXISTS idx_inventory_audit_logs_action 
ON public.inventory_audit_logs (company_id, action_type, created_at DESC);

-- Index for actor queries
CREATE INDEX IF NOT EXISTS idx_inventory_audit_logs_actor 
ON public.inventory_audit_logs (company_id, actor_user_id, created_at DESC)
WHERE actor_user_id IS NOT NULL;

-- ============================================================================
-- STEP 3: Enable Row Level Security (RLS)
-- ============================================================================
-- Note: Using permissive policies compatible with Clerk authentication.
-- The app enforces company scoping at the application layer via company_id filters.

ALTER TABLE public.inventory_audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running migration)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory_audit_logs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory_audit_logs', pol.policyname);
  END LOOP;
END $$;

-- Policy: Authenticated users can view audit logs
-- Company scoping is enforced at the application layer
CREATE POLICY "Users can view inventory audit logs"
ON public.inventory_audit_logs
FOR SELECT
TO authenticated
USING (true);

-- Policy: Authenticated users can insert audit logs
CREATE POLICY "Users can insert inventory audit logs"
ON public.inventory_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Service role can do everything (for server-side operations)
CREATE POLICY "Service role has full access to inventory audit logs"
ON public.inventory_audit_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- STEP 4: Grant permissions
-- ============================================================================

GRANT SELECT, INSERT ON public.inventory_audit_logs TO authenticated;
GRANT ALL ON public.inventory_audit_logs TO service_role;

-- ============================================================================
-- STEP 5: Add archive fields to inventory_item_master (if not exists)
-- ============================================================================

-- Add is_archived column
ALTER TABLE public.inventory_item_master 
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- Add archived_at timestamp
ALTER TABLE public.inventory_item_master 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

-- Add archived_by (stores actor name since Clerk user IDs are not UUIDs)
-- If column already exists as UUID, we need to drop dependent views, alter it to TEXT, then recreate views
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'inventory_item_master' 
    AND column_name = 'archived_by'
    AND data_type = 'uuid'
  ) THEN
    -- Drop dependent view first
    DROP VIEW IF EXISTS public.inventory_archived_items_view;
    
    -- Alter column type
    ALTER TABLE public.inventory_item_master ALTER COLUMN archived_by TYPE TEXT;
    
    -- Recreate the archived items view
    CREATE OR REPLACE VIEW public.inventory_archived_items_view AS
    SELECT 
        im.id,
        im.company_id,
        im.name,
        im.category_id AS category,
        ic.name AS category_name,
        im.supplier_id,
        s.name AS supplier_name,
        im.archived_at,
        im.archived_by,
        im.is_archived
    FROM public.inventory_item_master im
    LEFT JOIN public.inventory_categories ic ON ic.id = im.category_id
    LEFT JOIN public.suppliers s ON s.id = im.supplier_id
    WHERE im.is_archived = TRUE;
    
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'inventory_item_master' 
    AND column_name = 'archived_by'
  ) THEN
    ALTER TABLE public.inventory_item_master ADD COLUMN archived_by TEXT DEFAULT NULL;
  END IF;
END $$;

-- Add updated_at if not exists
ALTER TABLE public.inventory_item_master 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for filtering archived items
CREATE INDEX IF NOT EXISTS idx_inventory_item_master_archived 
ON public.inventory_item_master (company_id, is_archived);

-- ============================================================================
-- STEP 6: Update inventory_stock_view to exclude archived items
-- ============================================================================

-- Drop and recreate the view to exclude archived items
DROP VIEW IF EXISTS public.inventory_low_stock_view CASCADE;
DROP VIEW IF EXISTS public.inventory_stock_view CASCADE;

CREATE OR REPLACE VIEW public.inventory_stock_view AS
SELECT 
  i.id,
  i.company_id,
  i.name,
  i.category_id AS category,
  c.name AS category_name,
  i.supplier_id,
  s.name AS supplier_name,
  COALESCE(i.unit, 'pieces') AS unit,
  COALESCE(
    (
      SELECT SUM(
        CASE 
          WHEN t.transaction_type IN ('opening_balance', 'purchase', 'stock_in', 'adjustment_in', 'return_in', 'Purchase', 'Opening Balance', 'Adjustment') 
          THEN t.quantity 
          ELSE -t.quantity 
        END
      )
      FROM public.inventory_transactions t
      WHERE t.inventory_item_id = i.id
    ),
    0
  ) AS current_stock,
  i.min_stock_level,
  i.reorder_quantity,
  i.average_cost,
  COALESCE(
    (
      SELECT SUM(
        CASE 
          WHEN t.transaction_type IN ('opening_balance', 'purchase', 'stock_in', 'adjustment_in', 'return_in', 'Purchase', 'Opening Balance', 'Adjustment') 
          THEN t.quantity 
          ELSE -t.quantity 
        END
      )
      FROM public.inventory_transactions t
      WHERE t.inventory_item_id = i.id
    ),
    0
  ) * COALESCE(i.average_cost, 0) AS total_value,
  CASE 
    WHEN COALESCE(
      (
        SELECT SUM(
          CASE 
            WHEN t.transaction_type IN ('opening_balance', 'purchase', 'stock_in', 'adjustment_in', 'return_in', 'Purchase', 'Opening Balance', 'Adjustment') 
            THEN t.quantity 
            ELSE -t.quantity 
          END
        )
        FROM public.inventory_transactions t
        WHERE t.inventory_item_id = i.id
      ),
      0
    ) <= 0 THEN 'out'
    WHEN COALESCE(
      (
        SELECT SUM(
          CASE 
            WHEN t.transaction_type IN ('opening_balance', 'purchase', 'stock_in', 'adjustment_in', 'return_in', 'Purchase', 'Opening Balance', 'Adjustment') 
            THEN t.quantity 
            ELSE -t.quantity 
          END
        )
        FROM public.inventory_transactions t
        WHERE t.inventory_item_id = i.id
      ),
      0
    ) < COALESCE(i.min_stock_level, 0) THEN 'low'
    ELSE 'ok'
  END AS stock_status,
  i.unit_size,
  i.unit_size_label,
  i.packaging_type
FROM public.inventory_item_master i
LEFT JOIN public.inventory_categories c ON c.id = i.category_id
LEFT JOIN public.suppliers s ON s.id = i.supplier_id
WHERE COALESCE(i.is_archived, FALSE) = FALSE;

-- Recreate low stock view
CREATE OR REPLACE VIEW public.inventory_low_stock_view AS
SELECT *
FROM public.inventory_stock_view
WHERE stock_status IN ('low', 'out');

-- Grant permissions on views
GRANT SELECT ON public.inventory_stock_view TO authenticated;
GRANT SELECT ON public.inventory_stock_view TO anon;
GRANT SELECT ON public.inventory_low_stock_view TO authenticated;
GRANT SELECT ON public.inventory_low_stock_view TO anon;

-- ============================================================================
-- STEP 7: Create helper function to log audit events
-- ============================================================================

-- Drop all existing versions of the function first to avoid conflicts
DROP FUNCTION IF EXISTS public.log_inventory_audit(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, UUID, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.log_inventory_audit(TEXT, UUID, TEXT, TEXT, NUMERIC, TEXT, UUID, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.log_inventory_audit(TEXT, UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.log_inventory_audit(
    p_company_id TEXT,
    p_inventory_item_id UUID,
    p_action_type TEXT,
    p_item_name TEXT DEFAULT NULL,
    p_quantity NUMERIC DEFAULT NULL,
    p_unit TEXT DEFAULT NULL,
    p_actor_user_id TEXT DEFAULT NULL,
    p_actor_name TEXT DEFAULT NULL,
    p_actor_role TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    v_audit_id UUID;
BEGIN
    INSERT INTO public.inventory_audit_logs (
        company_id,
        inventory_item_id,
        action_type,
        item_name,
        quantity,
        unit,
        actor_user_id,
        actor_name,
        actor_role,
        notes,
        metadata
    ) VALUES (
        p_company_id,
        p_inventory_item_id,
        p_action_type,
        p_item_name,
        p_quantity,
        p_unit,
        p_actor_user_id,
        p_actor_name,
        p_actor_role,
        p_notes,
        p_metadata
    )
    RETURNING id INTO v_audit_id;
    
    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission (specify full signature to avoid ambiguity)
GRANT EXECUTE ON FUNCTION public.log_inventory_audit(TEXT, UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these after the migration to verify everything works:
--
-- Check table exists:
-- SELECT * FROM information_schema.tables WHERE table_name = 'inventory_audit_logs';
--
-- Check columns:
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'inventory_audit_logs' ORDER BY ordinal_position;
--
-- Check RLS policies:
-- SELECT * FROM pg_policies WHERE tablename = 'inventory_audit_logs';
--
-- Test insert (replace with real company_id):
-- SELECT public.log_inventory_audit(
--     'your-company-uuid'::uuid,
--     NULL,
--     'ITEM_CREATED',
--     'Test Item',
--     100,
--     'kg',
--     NULL,
--     'Test User',
--     'admin',
--     'Test audit log entry',
--     '{"test": true}'::jsonb
-- );
--
-- ============================================================================

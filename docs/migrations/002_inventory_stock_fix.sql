-- ============================================================================
-- INVENTORY STOCK FIX MIGRATION
-- ============================================================================
-- 
-- ROOT CAUSE: The inventory_stock_view calculates current_stock from 
-- inventory_transactions table, but:
-- 1. inventory_item_master table doesn't exist (schema has inventory_items)
-- 2. inventory_transactions table doesn't exist
-- 3. record_inventory_stock_in RPC doesn't exist
--
-- This migration creates the missing tables and RPCs to fix the stock display.
--
-- Run this in Supabase SQL Editor.
-- ============================================================================

-- ============================================================================
-- STEP 1: Create inventory_item_master table (if not exists)
-- This is the new canonical table for inventory items with proper structure
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_item_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category_id UUID REFERENCES public.inventory_categories(id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    
    -- Item identification
    item_code TEXT,
    sku TEXT,
    description TEXT,
    
    -- Unit and packaging
    unit TEXT NOT NULL DEFAULT 'pieces',
    unit_size NUMERIC,
    unit_size_label TEXT,
    packaging_type TEXT CHECK (packaging_type IN ('single', 'sack', 'box', 'bottle', 'pack', 'other')),
    
    -- Stock management
    min_stock_level NUMERIC DEFAULT 0,
    reorder_quantity NUMERIC,
    average_cost NUMERIC(14,2),
    
    -- Project defaults
    default_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    default_crop_stage_id UUID,
    
    -- Soft delete / archive
    is_archived BOOLEAN DEFAULT FALSE,
    archived_at TIMESTAMPTZ,
    archived_by TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_inventory_item_master_company 
ON public.inventory_item_master (company_id);

CREATE INDEX IF NOT EXISTS idx_inventory_item_master_category 
ON public.inventory_item_master (company_id, category_id);

CREATE INDEX IF NOT EXISTS idx_inventory_item_master_archived 
ON public.inventory_item_master (company_id, is_archived);

-- Add unique constraint for item name per company
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_item_master_company_name 
ON public.inventory_item_master (company_id, name) 
WHERE is_archived = FALSE;

-- ============================================================================
-- STEP 2: Create inventory_transactions table
-- This is the source of truth for all stock movements
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES public.inventory_item_master(id) ON DELETE CASCADE,
    
    -- Transaction details
    transaction_type TEXT NOT NULL CHECK (transaction_type IN (
        'opening_balance',
        'purchase',
        'stock_in',
        'adjustment_in',
        'return_in',
        'usage',
        'deduction',
        'adjustment_out',
        'return_out',
        'spoilage',
        'transfer_out',
        'transfer_in',
        -- Legacy types (for compatibility)
        'Purchase',
        'Opening Balance',
        'Adjustment'
    )),
    
    -- Quantity (positive for inflows, stored as-is; view handles sign)
    quantity NUMERIC(14,2) NOT NULL,
    unit_cost NUMERIC(14,2),
    total_cost NUMERIC(14,2),
    
    -- Balance tracking (optional, can be calculated)
    balance_after NUMERIC(14,2),
    
    -- References
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    crop_stage TEXT,
    
    -- Metadata
    source TEXT,
    reference TEXT,
    notes TEXT,
    purpose TEXT,
    
    -- Actor
    created_by UUID,
    created_by_name TEXT,
    
    -- Timestamps
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_company 
ON public.inventory_transactions (company_id);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item 
ON public.inventory_transactions (inventory_item_id);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_company_item 
ON public.inventory_transactions (company_id, inventory_item_id);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_occurred 
ON public.inventory_transactions (company_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_type 
ON public.inventory_transactions (company_id, transaction_type);

-- ============================================================================
-- STEP 3: Create record_inventory_stock_in RPC
-- This is called by the frontend to record stock additions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_inventory_stock_in(
    company_id TEXT,
    inventory_item_id UUID,
    quantity NUMERIC,
    unit_cost NUMERIC DEFAULT 0,
    transaction_type TEXT DEFAULT 'stock_in',
    supplier_id UUID DEFAULT NULL,
    occurred_on TEXT DEFAULT NULL,
    notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_transaction_id UUID;
    v_occurred_at TIMESTAMPTZ;
    v_total_cost NUMERIC;
    v_current_balance NUMERIC;
BEGIN
    -- Parse the occurred_on date or use current timestamp
    IF occurred_on IS NOT NULL AND occurred_on != '' THEN
        v_occurred_at := occurred_on::TIMESTAMPTZ;
    ELSE
        v_occurred_at := NOW();
    END IF;
    
    -- Calculate total cost
    v_total_cost := quantity * COALESCE(unit_cost, 0);
    
    -- Calculate current balance after this transaction
    SELECT COALESCE(SUM(
        CASE 
            WHEN t.transaction_type IN ('opening_balance', 'purchase', 'stock_in', 'adjustment_in', 'return_in', 'transfer_in', 'Purchase', 'Opening Balance', 'Adjustment') 
            THEN t.quantity 
            ELSE -t.quantity 
        END
    ), 0) + quantity
    INTO v_current_balance
    FROM public.inventory_transactions t
    WHERE t.inventory_item_id = record_inventory_stock_in.inventory_item_id;
    
    -- Insert the transaction
    INSERT INTO public.inventory_transactions (
        company_id,
        inventory_item_id,
        transaction_type,
        quantity,
        unit_cost,
        total_cost,
        balance_after,
        supplier_id,
        notes,
        occurred_at,
        source
    ) VALUES (
        record_inventory_stock_in.company_id,
        record_inventory_stock_in.inventory_item_id,
        record_inventory_stock_in.transaction_type,
        record_inventory_stock_in.quantity,
        record_inventory_stock_in.unit_cost,
        v_total_cost,
        v_current_balance,
        record_inventory_stock_in.supplier_id,
        record_inventory_stock_in.notes,
        v_occurred_at,
        'app'
    )
    RETURNING id INTO v_transaction_id;
    
    -- Update average cost on the item if unit_cost is provided
    IF unit_cost IS NOT NULL AND unit_cost > 0 THEN
        UPDATE public.inventory_item_master
        SET 
            average_cost = (
                COALESCE(average_cost, 0) * GREATEST(v_current_balance - quantity, 0) + 
                unit_cost * quantity
            ) / NULLIF(v_current_balance, 0),
            updated_at = NOW()
        WHERE id = record_inventory_stock_in.inventory_item_id;
    END IF;
    
    RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.record_inventory_stock_in TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_inventory_stock_in TO service_role;

-- ============================================================================
-- STEP 4: Create record_inventory_usage RPC
-- This is called by the frontend to record stock usage/deductions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_inventory_usage(
    company_id TEXT,
    inventory_item_id UUID,
    quantity NUMERIC,
    project_id UUID DEFAULT NULL,
    crop_stage TEXT DEFAULT NULL,
    used_on TEXT DEFAULT NULL,
    purpose TEXT DEFAULT NULL,
    notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_transaction_id UUID;
    v_occurred_at TIMESTAMPTZ;
    v_current_balance NUMERIC;
    v_transaction_type TEXT;
BEGIN
    -- Parse the used_on date or use current timestamp
    IF used_on IS NOT NULL AND used_on != '' THEN
        v_occurred_at := used_on::TIMESTAMPTZ;
    ELSE
        v_occurred_at := NOW();
    END IF;
    
    -- Determine transaction type based on purpose
    IF purpose = 'manual_deduction' THEN
        v_transaction_type := 'deduction';
    ELSE
        v_transaction_type := 'usage';
    END IF;
    
    -- Calculate current balance after this transaction (deducting the quantity)
    SELECT COALESCE(SUM(
        CASE 
            WHEN t.transaction_type IN ('opening_balance', 'purchase', 'stock_in', 'adjustment_in', 'return_in', 'transfer_in', 'Purchase', 'Opening Balance', 'Adjustment') 
            THEN t.quantity 
            ELSE -t.quantity 
        END
    ), 0) - quantity
    INTO v_current_balance
    FROM public.inventory_transactions t
    WHERE t.inventory_item_id = record_inventory_usage.inventory_item_id;
    
    -- Insert the transaction (quantity stored as positive, view handles sign)
    INSERT INTO public.inventory_transactions (
        company_id,
        inventory_item_id,
        transaction_type,
        quantity,
        balance_after,
        project_id,
        crop_stage,
        purpose,
        notes,
        occurred_at,
        source
    ) VALUES (
        record_inventory_usage.company_id,
        record_inventory_usage.inventory_item_id,
        v_transaction_type,
        record_inventory_usage.quantity,
        v_current_balance,
        record_inventory_usage.project_id,
        record_inventory_usage.crop_stage,
        record_inventory_usage.purpose,
        record_inventory_usage.notes,
        v_occurred_at,
        'app'
    )
    RETURNING id INTO v_transaction_id;
    
    RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.record_inventory_usage TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_inventory_usage TO service_role;

-- ============================================================================
-- STEP 5: Drop and recreate inventory_stock_view
-- ============================================================================

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
    i.item_code,
    i.sku,
    COALESCE(i.unit, 'pieces') AS unit,
    COALESCE(
        (
            SELECT SUM(
                CASE 
                    WHEN t.transaction_type IN ('opening_balance', 'purchase', 'stock_in', 'adjustment_in', 'return_in', 'transfer_in', 'Purchase', 'Opening Balance', 'Adjustment') 
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
                    WHEN t.transaction_type IN ('opening_balance', 'purchase', 'stock_in', 'adjustment_in', 'return_in', 'transfer_in', 'Purchase', 'Opening Balance', 'Adjustment') 
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
                        WHEN t.transaction_type IN ('opening_balance', 'purchase', 'stock_in', 'adjustment_in', 'return_in', 'transfer_in', 'Purchase', 'Opening Balance', 'Adjustment') 
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
                        WHEN t.transaction_type IN ('opening_balance', 'purchase', 'stock_in', 'adjustment_in', 'return_in', 'transfer_in', 'Purchase', 'Opening Balance', 'Adjustment') 
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
    i.packaging_type,
    i.description,
    i.is_archived,
    i.created_at,
    i.updated_at
FROM public.inventory_item_master i
LEFT JOIN public.inventory_categories c ON c.id = i.category_id
LEFT JOIN public.suppliers s ON s.id = i.supplier_id
WHERE COALESCE(i.is_archived, FALSE) = FALSE;

-- Recreate low stock view
CREATE OR REPLACE VIEW public.inventory_low_stock_view AS
SELECT *
FROM public.inventory_stock_view
WHERE stock_status IN ('low', 'out');

-- ============================================================================
-- STEP 6: Create inventory_transaction_history_view
-- ============================================================================

DROP VIEW IF EXISTS public.inventory_transaction_history_view CASCADE;

CREATE OR REPLACE VIEW public.inventory_transaction_history_view AS
SELECT 
    t.id,
    t.company_id,
    t.inventory_item_id,
    t.occurred_at,
    t.quantity,
    t.balance_after,
    t.unit_cost,
    t.total_cost,
    t.transaction_type,
    t.source,
    t.reference,
    t.notes,
    t.created_by_name,
    i.name AS item_name,
    i.unit AS item_unit
FROM public.inventory_transactions t
LEFT JOIN public.inventory_item_master i ON i.id = t.inventory_item_id
ORDER BY t.occurred_at DESC;

-- ============================================================================
-- STEP 7: Enable RLS on new tables
-- ============================================================================

ALTER TABLE public.inventory_item_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory_item_master'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory_item_master', pol.policyname);
    END LOOP;
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory_transactions'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory_transactions', pol.policyname);
    END LOOP;
END $$;

-- Policies for inventory_item_master
CREATE POLICY "Users can view inventory items"
ON public.inventory_item_master
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert inventory items"
ON public.inventory_item_master
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can update inventory items"
ON public.inventory_item_master
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role has full access to inventory items"
ON public.inventory_item_master
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policies for inventory_transactions
CREATE POLICY "Users can view inventory transactions"
ON public.inventory_transactions
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert inventory transactions"
ON public.inventory_transactions
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Service role has full access to inventory transactions"
ON public.inventory_transactions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- STEP 8: Grant permissions
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.inventory_item_master TO authenticated;
GRANT ALL ON public.inventory_item_master TO service_role;

GRANT SELECT, INSERT ON public.inventory_transactions TO authenticated;
GRANT ALL ON public.inventory_transactions TO service_role;

GRANT SELECT ON public.inventory_stock_view TO authenticated;
GRANT SELECT ON public.inventory_stock_view TO anon;
GRANT SELECT ON public.inventory_low_stock_view TO authenticated;
GRANT SELECT ON public.inventory_low_stock_view TO anon;
GRANT SELECT ON public.inventory_transaction_history_view TO authenticated;
GRANT SELECT ON public.inventory_transaction_history_view TO anon;

-- ============================================================================
-- STEP 9: Add updated_at trigger for inventory_item_master
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_inventory_item_master ON public.inventory_item_master;
CREATE TRIGGER set_updated_at_inventory_item_master 
BEFORE UPDATE ON public.inventory_item_master 
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these after the migration to verify everything works:
--
-- Check tables exist:
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' AND table_name IN ('inventory_item_master', 'inventory_transactions');
--
-- Check RPCs exist:
-- SELECT routine_name FROM information_schema.routines 
-- WHERE routine_schema = 'public' AND routine_name LIKE 'record_inventory%';
--
-- Check views exist:
-- SELECT table_name FROM information_schema.views 
-- WHERE table_schema = 'public' AND table_name LIKE 'inventory%';
--
-- Test creating an item and stock:
-- INSERT INTO public.inventory_item_master (company_id, name, unit, category_id)
-- VALUES ('your-company-uuid', 'Test Item', 'kg', NULL)
-- RETURNING id;
--
-- SELECT public.record_inventory_stock_in(
--     'your-company-uuid'::uuid,
--     'item-uuid-from-above'::uuid,
--     100,
--     50.00,
--     'opening_balance',
--     NULL,
--     NULL,
--     'Initial stock'
-- );
--
-- SELECT * FROM public.inventory_stock_view WHERE name = 'Test Item';
-- ============================================================================

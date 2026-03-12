-- ============================================================================
-- COMPLETE INVENTORY STOCK FIX
-- ============================================================================
-- This is a complete, self-contained fix for the inventory stock display issue.
-- Run this entire script in Supabase SQL Editor.
--
-- What this fixes:
-- - Creates inventory_transactions table if missing
-- - Creates/replaces the record_inventory_stock_in RPC
-- - Creates/replaces the record_inventory_usage RPC  
-- - Recreates inventory_stock_view to calculate stock from transactions
-- - Adds RLS policies and permissions
-- ============================================================================

-- ============================================================================
-- STEP 1: Ensure inventory_transactions table exists
-- ============================================================================

-- Note: total_cost is a generated column in the existing table, so we don't include it here
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    inventory_item_id UUID NOT NULL,
    transaction_type TEXT NOT NULL,
    quantity NUMERIC(14,2) NOT NULL,
    unit_cost NUMERIC(14,2),
    balance_after NUMERIC(14,2),
    supplier_id UUID,
    project_id UUID,
    crop_stage TEXT,
    source TEXT,
    reference TEXT,
    notes TEXT,
    purpose TEXT,
    created_by UUID,
    created_by_name TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add missing columns if table already exists (skip total_cost if it's generated)
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS balance_after NUMERIC(14,2);
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14,2);
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS supplier_id UUID;
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS crop_stage TEXT;
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS purpose TEXT;
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ DEFAULT NOW();

-- Add foreign key if not exists (may fail if already exists, that's OK)
DO $$
BEGIN
    ALTER TABLE public.inventory_transactions 
    ADD CONSTRAINT fk_inventory_transactions_item 
    FOREIGN KEY (inventory_item_id) 
    REFERENCES public.inventory_item_master(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item 
ON public.inventory_transactions (inventory_item_id);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_company_item 
ON public.inventory_transactions (company_id, inventory_item_id);

-- ============================================================================
-- STEP 2: Drop ALL existing versions of the RPCs
-- ============================================================================

-- Drop all possible signatures of record_inventory_stock_in
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
        AND p.proname = 'record_inventory_stock_in'
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS public.record_inventory_stock_in(%s)', r.args);
        RAISE NOTICE 'Dropped function: record_inventory_stock_in(%)', r.args;
    END LOOP;
END $$;

-- Drop all possible signatures of record_inventory_usage
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
        AND p.proname = 'record_inventory_usage'
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS public.record_inventory_usage(%s)', r.args);
        RAISE NOTICE 'Dropped function: record_inventory_usage(%)', r.args;
    END LOOP;
END $$;

-- ============================================================================
-- STEP 3: Create record_inventory_stock_in RPC
-- ============================================================================

CREATE FUNCTION public.record_inventory_stock_in(
    company_id TEXT,
    inventory_item_id UUID,
    quantity NUMERIC,
    unit_cost NUMERIC DEFAULT 0,
    transaction_type TEXT DEFAULT 'stock_in',
    supplier_id UUID DEFAULT NULL,
    occurred_on TEXT DEFAULT NULL,
    notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transaction_id UUID;
    v_occurred_at TIMESTAMPTZ;
    v_current_balance NUMERIC;
BEGIN
    -- Parse the occurred_on date or use current timestamp
    IF occurred_on IS NOT NULL AND occurred_on != '' THEN
        BEGIN
            v_occurred_at := occurred_on::TIMESTAMPTZ;
        EXCEPTION WHEN OTHERS THEN
            v_occurred_at := NOW();
        END;
    ELSE
        v_occurred_at := NOW();
    END IF;
    
    -- Calculate current balance after this transaction
    SELECT COALESCE(SUM(
        CASE 
            WHEN t.transaction_type IN (
                'opening_balance', 'purchase', 'stock_in', 'adjustment_in', 
                'return_in', 'transfer_in', 'Purchase', 'Opening Balance', 'Adjustment'
            ) THEN t.quantity 
            ELSE -t.quantity 
        END
    ), 0) + record_inventory_stock_in.quantity
    INTO v_current_balance
    FROM public.inventory_transactions t
    WHERE t.inventory_item_id = record_inventory_stock_in.inventory_item_id;
    
    -- Insert the transaction (excluding total_cost if it's a generated column)
    INSERT INTO public.inventory_transactions (
        company_id,
        inventory_item_id,
        transaction_type,
        quantity,
        unit_cost,
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
                COALESCE(average_cost, 0) * GREATEST(v_current_balance - record_inventory_stock_in.quantity, 0) + 
                record_inventory_stock_in.unit_cost * record_inventory_stock_in.quantity
            ) / NULLIF(v_current_balance, 0),
            updated_at = NOW()
        WHERE id = record_inventory_stock_in.inventory_item_id;
    END IF;
    
    RETURN v_transaction_id;
END;
$$;

-- ============================================================================
-- STEP 4: Create record_inventory_usage RPC
-- ============================================================================

CREATE FUNCTION public.record_inventory_usage(
    company_id TEXT,
    inventory_item_id UUID,
    quantity NUMERIC,
    project_id UUID DEFAULT NULL,
    crop_stage TEXT DEFAULT NULL,
    used_on TEXT DEFAULT NULL,
    purpose TEXT DEFAULT NULL,
    notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transaction_id UUID;
    v_occurred_at TIMESTAMPTZ;
    v_current_balance NUMERIC;
    v_transaction_type TEXT;
BEGIN
    -- Parse the used_on date or use current timestamp
    IF used_on IS NOT NULL AND used_on != '' THEN
        BEGIN
            v_occurred_at := used_on::TIMESTAMPTZ;
        EXCEPTION WHEN OTHERS THEN
            v_occurred_at := NOW();
        END;
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
            WHEN t.transaction_type IN (
                'opening_balance', 'purchase', 'stock_in', 'adjustment_in', 
                'return_in', 'transfer_in', 'Purchase', 'Opening Balance', 'Adjustment'
            ) THEN t.quantity 
            ELSE -t.quantity 
        END
    ), 0) - record_inventory_usage.quantity
    INTO v_current_balance
    FROM public.inventory_transactions t
    WHERE t.inventory_item_id = record_inventory_usage.inventory_item_id;
    
    -- Insert the transaction
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
$$;

-- ============================================================================
-- STEP 5: Grant permissions on RPCs
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.record_inventory_stock_in(TEXT, UUID, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_inventory_stock_in(TEXT, UUID, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_inventory_stock_in(TEXT, UUID, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT) TO anon;

GRANT EXECUTE ON FUNCTION public.record_inventory_usage(TEXT, UUID, NUMERIC, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_inventory_usage(TEXT, UUID, NUMERIC, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_inventory_usage(TEXT, UUID, NUMERIC, UUID, TEXT, TEXT, TEXT, TEXT) TO anon;

-- ============================================================================
-- STEP 6: Recreate inventory_stock_view
-- ============================================================================

DROP VIEW IF EXISTS public.inventory_low_stock_view CASCADE;
DROP VIEW IF EXISTS public.inventory_stock_view CASCADE;

CREATE VIEW public.inventory_stock_view AS
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
                    WHEN t.transaction_type IN (
                        'opening_balance', 'purchase', 'stock_in', 'adjustment_in', 
                        'return_in', 'transfer_in', 'Purchase', 'Opening Balance', 'Adjustment'
                    ) THEN t.quantity 
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
                    WHEN t.transaction_type IN (
                        'opening_balance', 'purchase', 'stock_in', 'adjustment_in', 
                        'return_in', 'transfer_in', 'Purchase', 'Opening Balance', 'Adjustment'
                    ) THEN t.quantity 
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
                        WHEN t.transaction_type IN (
                            'opening_balance', 'purchase', 'stock_in', 'adjustment_in', 
                            'return_in', 'transfer_in', 'Purchase', 'Opening Balance', 'Adjustment'
                        ) THEN t.quantity 
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
                        WHEN t.transaction_type IN (
                            'opening_balance', 'purchase', 'stock_in', 'adjustment_in', 
                            'return_in', 'transfer_in', 'Purchase', 'Opening Balance', 'Adjustment'
                        ) THEN t.quantity 
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
CREATE VIEW public.inventory_low_stock_view AS
SELECT *
FROM public.inventory_stock_view
WHERE stock_status IN ('low', 'out');

-- ============================================================================
-- STEP 7: Grant permissions on views
-- ============================================================================

GRANT SELECT ON public.inventory_stock_view TO authenticated;
GRANT SELECT ON public.inventory_stock_view TO anon;
GRANT SELECT ON public.inventory_stock_view TO service_role;

GRANT SELECT ON public.inventory_low_stock_view TO authenticated;
GRANT SELECT ON public.inventory_low_stock_view TO anon;
GRANT SELECT ON public.inventory_low_stock_view TO service_role;

-- ============================================================================
-- STEP 8: Enable RLS on inventory_transactions
-- ============================================================================

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view inventory transactions" ON public.inventory_transactions;
DROP POLICY IF EXISTS "Users can insert inventory transactions" ON public.inventory_transactions;
DROP POLICY IF EXISTS "Service role full access transactions" ON public.inventory_transactions;

-- Create policies
CREATE POLICY "Users can view inventory transactions"
ON public.inventory_transactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert inventory transactions"
ON public.inventory_transactions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Service role full access transactions"
ON public.inventory_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grant table permissions
GRANT SELECT, INSERT ON public.inventory_transactions TO authenticated;
GRANT ALL ON public.inventory_transactions TO service_role;

-- ============================================================================
-- STEP 9: Backfill transactions for existing items with no transactions
-- ============================================================================
-- Skip backfill - items without transactions will show 0 stock which is correct
-- New items will get proper transactions when created through the app

-- Make created_by nullable if it has a NOT NULL constraint (for future inserts)
DO $$
BEGIN
    ALTER TABLE public.inventory_transactions ALTER COLUMN created_by DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
    NULL; -- Ignore if already nullable
END $$;

-- ============================================================================
-- STEP 10: Verification
-- ============================================================================

-- Show function signatures
SELECT 'FUNCTIONS CREATED' as status, 
       routine_name, 
       pg_get_function_arguments(p.oid) as arguments
FROM information_schema.routines r
JOIN pg_proc p ON p.proname = r.routine_name AND p.pronamespace = 'public'::regnamespace
WHERE r.routine_schema = 'public' 
AND r.routine_name IN ('record_inventory_stock_in', 'record_inventory_usage');

-- Show transaction count
SELECT 'TRANSACTIONS' as status, COUNT(*) as count FROM public.inventory_transactions;

-- Show sample stock view data
SELECT 'STOCK VIEW SAMPLE' as status, id, name, current_stock, stock_status 
FROM public.inventory_stock_view 
LIMIT 5;

-- ============================================================================
-- DONE!
-- ============================================================================
-- After running this script:
-- 1. Create a new inventory item with opening stock
-- 2. Check the Inventory page - it should show the correct stock
-- 3. Check browser console for debug logs
-- ============================================================================

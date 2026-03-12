-- ============================================================================
-- DIAGNOSE AND FIX INVENTORY STOCK
-- ============================================================================
-- Run this script in Supabase SQL Editor to diagnose and fix the stock issue.
-- It will:
-- 1. Check what tables/views/functions exist
-- 2. Check if there are any transactions
-- 3. Check the view definition
-- 4. Fix any issues found
-- ============================================================================

-- ============================================================================
-- STEP 1: DIAGNOSTIC - Check what exists
-- ============================================================================

-- Check if tables exist
SELECT 'TABLES' as check_type, table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('inventory_item_master', 'inventory_transactions', 'inventory_items', 'inventory_audit_logs')
ORDER BY table_name;

-- Check if views exist
SELECT 'VIEWS' as check_type, table_name 
FROM information_schema.views 
WHERE table_schema = 'public' 
AND table_name LIKE 'inventory%'
ORDER BY table_name;

-- Check if RPCs exist
SELECT 'FUNCTIONS' as check_type, routine_name, 
       pg_get_function_arguments(p.oid) as arguments
FROM information_schema.routines r
JOIN pg_proc p ON p.proname = r.routine_name
WHERE r.routine_schema = 'public' 
AND r.routine_name LIKE 'record_inventory%'
ORDER BY routine_name;

-- ============================================================================
-- STEP 2: DIAGNOSTIC - Check inventory_item_master data
-- ============================================================================

SELECT 'ITEMS IN inventory_item_master' as check_type, COUNT(*) as count
FROM public.inventory_item_master;

SELECT 'SAMPLE ITEMS' as check_type, id, name, company_id, unit, average_cost
FROM public.inventory_item_master
LIMIT 5;

-- ============================================================================
-- STEP 3: DIAGNOSTIC - Check inventory_transactions data
-- ============================================================================

SELECT 'TRANSACTIONS COUNT' as check_type, COUNT(*) as count
FROM public.inventory_transactions;

SELECT 'SAMPLE TRANSACTIONS' as check_type, 
       id, inventory_item_id, transaction_type, quantity, occurred_at
FROM public.inventory_transactions
ORDER BY occurred_at DESC
LIMIT 10;

-- ============================================================================
-- STEP 4: DIAGNOSTIC - Check inventory_stock_view output
-- ============================================================================

SELECT 'STOCK VIEW OUTPUT' as check_type,
       id, name, current_stock, stock_status, average_cost
FROM public.inventory_stock_view
LIMIT 10;

-- ============================================================================
-- STEP 5: DIAGNOSTIC - Check view definition
-- ============================================================================

SELECT 'VIEW DEFINITION' as check_type, 
       pg_get_viewdef('public.inventory_stock_view'::regclass, true) as definition;

-- ============================================================================
-- STEP 6: FIX - Drop and recreate RPCs with correct signatures
-- ============================================================================

-- Drop any existing versions of the RPC
DROP FUNCTION IF EXISTS public.record_inventory_stock_in(UUID, UUID, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.record_inventory_stock_in(TEXT, UUID, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT);

-- Create the RPC with correct signature
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
    -- Debug: Log the input
    RAISE NOTICE 'record_inventory_stock_in called with: company_id=%, item_id=%, qty=%, type=%', 
        company_id, inventory_item_id, quantity, transaction_type;

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
    
    RAISE NOTICE 'Calculated balance after: %', v_current_balance;
    
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
    
    RAISE NOTICE 'Inserted transaction: %', v_transaction_id;
    
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.record_inventory_stock_in(TEXT, UUID, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_inventory_stock_in(TEXT, UUID, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT) TO service_role;

-- ============================================================================
-- STEP 7: FIX - Recreate record_inventory_usage RPC
-- ============================================================================

DROP FUNCTION IF EXISTS public.record_inventory_usage(UUID, UUID, NUMERIC, UUID, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.record_inventory_usage(TEXT, UUID, NUMERIC, UUID, TEXT, TEXT, TEXT, TEXT);

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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.record_inventory_usage(TEXT, UUID, NUMERIC, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_inventory_usage(TEXT, UUID, NUMERIC, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================================
-- STEP 8: VERIFY - Test the RPC manually
-- ============================================================================

-- Get a sample item to test with
DO $$
DECLARE
    v_item_id UUID;
    v_company_id TEXT;
    v_tx_id UUID;
BEGIN
    -- Get a sample item
    SELECT id, company_id INTO v_item_id, v_company_id
    FROM public.inventory_item_master
    LIMIT 1;
    
    IF v_item_id IS NULL THEN
        RAISE NOTICE 'No items found in inventory_item_master';
        RETURN;
    END IF;
    
    RAISE NOTICE 'Testing with item: % (company: %)', v_item_id, v_company_id;
    
    -- Test the RPC
    SELECT public.record_inventory_stock_in(
        v_company_id,
        v_item_id,
        100,  -- quantity
        50.00,  -- unit_cost
        'stock_in',  -- transaction_type
        NULL,  -- supplier_id
        NULL,  -- occurred_on
        'Test transaction from diagnostic script'
    ) INTO v_tx_id;
    
    RAISE NOTICE 'Created test transaction: %', v_tx_id;
    
    -- Check the result
    RAISE NOTICE 'Checking inventory_stock_view for item...';
END $$;

-- Final verification
SELECT 'FINAL CHECK - TRANSACTIONS' as check_type, COUNT(*) as count
FROM public.inventory_transactions;

SELECT 'FINAL CHECK - STOCK VIEW' as check_type,
       id, name, current_stock, stock_status
FROM public.inventory_stock_view
LIMIT 10;

-- ============================================================================
-- DONE
-- ============================================================================
-- If you see transactions in the FINAL CHECK and current_stock > 0, the fix worked.
-- If current_stock is still 0, check the RAISE NOTICE output for errors.
-- ============================================================================

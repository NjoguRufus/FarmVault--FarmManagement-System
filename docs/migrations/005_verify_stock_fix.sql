-- ============================================================================
-- VERIFY INVENTORY STOCK FIX
-- ============================================================================
-- Run this in Supabase SQL Editor to verify the fix is working
-- ============================================================================

-- 1. Check RPC signatures
SELECT 'RPC SIGNATURES' as check_type,
       routine_name, 
       pg_get_function_arguments(p.oid) as arguments
FROM information_schema.routines r
JOIN pg_proc p ON p.proname = r.routine_name AND p.pronamespace = 'public'::regnamespace
WHERE r.routine_schema = 'public' 
AND r.routine_name IN ('record_inventory_stock_in', 'record_inventory_usage');

-- 2. Check inventory_transactions table structure
SELECT 'TRANSACTIONS TABLE COLUMNS' as check_type,
       column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'inventory_transactions'
ORDER BY ordinal_position;

-- 3. Check if there are any items
SELECT 'ITEMS COUNT' as check_type, COUNT(*) as count
FROM public.inventory_item_master;

-- 4. Check if there are any transactions
SELECT 'TRANSACTIONS COUNT' as check_type, COUNT(*) as count
FROM public.inventory_transactions;

-- 5. Sample items from stock view
SELECT 'STOCK VIEW SAMPLE' as check_type,
       id, name, current_stock, stock_status, average_cost, unit
FROM public.inventory_stock_view
LIMIT 10;

-- 6. Sample transactions
SELECT 'TRANSACTIONS SAMPLE' as check_type,
       id, inventory_item_id, transaction_type, quantity, balance_after, occurred_at
FROM public.inventory_transactions
ORDER BY occurred_at DESC
LIMIT 10;

-- ============================================================================
-- TEST: Create a test transaction manually
-- ============================================================================
-- Uncomment and modify the following to test:

/*
-- Get a sample item ID and company ID
SELECT id as item_id, company_id, name 
FROM public.inventory_item_master 
LIMIT 1;

-- Then call the RPC with those values:
SELECT public.record_inventory_stock_in(
    'YOUR_COMPANY_ID_HERE',  -- company_id (TEXT)
    'YOUR_ITEM_ID_HERE'::uuid,  -- inventory_item_id (UUID)
    100,  -- quantity
    50.00,  -- unit_cost
    'stock_in',  -- transaction_type
    NULL,  -- supplier_id
    NULL,  -- occurred_on
    'Test transaction'  -- notes
);

-- Check if it worked:
SELECT * FROM public.inventory_transactions ORDER BY created_at DESC LIMIT 1;
SELECT * FROM public.inventory_stock_view WHERE id = 'YOUR_ITEM_ID_HERE';
*/

-- ============================================================================
-- CHECK: View definition
-- ============================================================================
SELECT 'VIEW DEFINITION (first 500 chars)' as check_type,
       LEFT(pg_get_viewdef('public.inventory_stock_view'::regclass, true), 500) as definition;

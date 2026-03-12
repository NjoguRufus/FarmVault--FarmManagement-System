-- ============================================================================
-- VERIFY AND FIX TOTAL VALUE CALCULATION
-- ============================================================================

-- 1. Check current state of a sample item
SELECT 'ITEM DATA' as check_type,
       id, name, average_cost, current_stock, total_value, stock_status
FROM public.inventory_stock_view
LIMIT 5;

-- 2. Check if average_cost is set on items
SELECT 'ITEMS WITH AVERAGE_COST' as check_type,
       id, name, average_cost
FROM public.inventory_item_master
WHERE average_cost IS NOT NULL AND average_cost > 0
LIMIT 5;

-- 3. Check transactions with unit_cost
SELECT 'TRANSACTIONS WITH UNIT_COST' as check_type,
       id, inventory_item_id, transaction_type, quantity, unit_cost, balance_after
FROM public.inventory_transactions
WHERE unit_cost IS NOT NULL AND unit_cost > 0
ORDER BY occurred_at DESC
LIMIT 10;

-- 4. Manually calculate what total_value should be for each item
SELECT 'CALCULATED VALUES' as check_type,
       i.id,
       i.name,
       i.average_cost,
       COALESCE(
           (SELECT SUM(
               CASE 
                   WHEN t.transaction_type IN (
                       'opening_balance', 'purchase', 'stock_in', 'adjustment_in', 
                       'return_in', 'transfer_in', 'Purchase', 'Opening Balance', 'Adjustment'
                   ) THEN t.quantity 
                   ELSE -t.quantity 
               END
           )
           FROM public.inventory_transactions t
           WHERE t.inventory_item_id = i.id),
           0
       ) as calculated_stock,
       COALESCE(
           (SELECT SUM(
               CASE 
                   WHEN t.transaction_type IN (
                       'opening_balance', 'purchase', 'stock_in', 'adjustment_in', 
                       'return_in', 'transfer_in', 'Purchase', 'Opening Balance', 'Adjustment'
                   ) THEN t.quantity 
                   ELSE -t.quantity 
               END
           )
           FROM public.inventory_transactions t
           WHERE t.inventory_item_id = i.id),
           0
       ) * COALESCE(i.average_cost, 0) as calculated_total_value
FROM public.inventory_item_master i
WHERE i.is_archived = FALSE
LIMIT 10;

-- 5. If average_cost is not being updated, let's update it from transactions
-- This updates average_cost for items that have transactions with unit_cost
UPDATE public.inventory_item_master i
SET average_cost = (
    SELECT AVG(t.unit_cost)
    FROM public.inventory_transactions t
    WHERE t.inventory_item_id = i.id
    AND t.unit_cost IS NOT NULL
    AND t.unit_cost > 0
)
WHERE EXISTS (
    SELECT 1 FROM public.inventory_transactions t
    WHERE t.inventory_item_id = i.id
    AND t.unit_cost IS NOT NULL
    AND t.unit_cost > 0
)
AND (i.average_cost IS NULL OR i.average_cost = 0);

-- 6. Verify the fix
SELECT 'AFTER FIX' as check_type,
       id, name, average_cost, current_stock, total_value, stock_status
FROM public.inventory_stock_view
LIMIT 10;

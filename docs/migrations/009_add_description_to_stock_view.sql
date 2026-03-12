-- ============================================================================
-- ADD DESCRIPTION TO INVENTORY_STOCK_VIEW
-- ============================================================================
-- This migration adds the description field from inventory_item_master
-- to the inventory_stock_view so it can be displayed in the UI.
-- ============================================================================

-- First, check current view structure
SELECT 'CURRENT VIEW COLUMNS' as check_type,
       column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'inventory_stock_view'
ORDER BY ordinal_position;

-- Drop dependent views first
DROP VIEW IF EXISTS public.inventory_low_stock_view CASCADE;
DROP VIEW IF EXISTS public.inventory_stock_view CASCADE;

-- Recreate inventory_stock_view with description field
CREATE OR REPLACE VIEW public.inventory_stock_view AS
SELECT
    i.id,
    i.company_id,
    i.name,
    i.category_id AS category,
    c.name AS category_name,
    i.supplier_id,
    s.name AS supplier_name,
    COALESCE(i.unit, 'units') AS unit,
    i.unit_size,
    i.unit_size_label,
    i.packaging_type,
    i.min_stock_level,
    i.reorder_quantity,
    i.average_cost,
    i.description,
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
        WHERE t.inventory_item_id = i.id
        ), 0
    ) AS current_stock,
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
        WHERE t.inventory_item_id = i.id
        ), 0
    ) * COALESCE(i.average_cost, 0) AS total_value,
    CASE
        WHEN COALESCE(
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
            WHERE t.inventory_item_id = i.id
            ), 0
        ) <= 0 THEN 'out'
        WHEN i.min_stock_level IS NOT NULL AND COALESCE(
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
            WHERE t.inventory_item_id = i.id
            ), 0
        ) <= i.min_stock_level THEN 'low'
        ELSE 'ok'
    END AS stock_status
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
GRANT SELECT ON public.inventory_stock_view TO service_role;

GRANT SELECT ON public.inventory_low_stock_view TO authenticated;
GRANT SELECT ON public.inventory_low_stock_view TO anon;
GRANT SELECT ON public.inventory_low_stock_view TO service_role;

-- Verify the new view structure
SELECT 'NEW VIEW COLUMNS' as check_type,
       column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'inventory_stock_view'
ORDER BY ordinal_position;

-- Sample data to verify
SELECT 'SAMPLE DATA' as check_type,
       id, name, description, current_stock, stock_status
FROM public.inventory_stock_view
LIMIT 5;

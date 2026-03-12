-- ============================================================================
-- INVENTORY VIEW FIX
-- Run this in Supabase SQL Editor to fix the inventory stock display
-- ============================================================================

-- Step 1: Add packaging_type column to inventory_item_master if it doesn't exist
ALTER TABLE public.inventory_item_master 
ADD COLUMN IF NOT EXISTS packaging_type TEXT;

-- Step 2: Drop dependent views first using CASCADE
-- This will drop inventory_low_stock_view which depends on inventory_stock_view
DROP VIEW IF EXISTS public.inventory_stock_view CASCADE;

-- Step 3: Recreate inventory_stock_view with new fields
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
LEFT JOIN public.suppliers s ON s.id = i.supplier_id;

-- Step 4: Recreate inventory_low_stock_view (was dropped by CASCADE)
CREATE OR REPLACE VIEW public.inventory_low_stock_view AS
SELECT 
  id,
  company_id,
  name,
  category,
  category_name,
  supplier_id,
  supplier_name,
  unit,
  current_stock,
  min_stock_level,
  reorder_quantity,
  average_cost,
  total_value,
  stock_status,
  unit_size,
  unit_size_label,
  packaging_type
FROM public.inventory_stock_view
WHERE stock_status IN ('low', 'out');

-- Step 5: Grant permissions on both views
GRANT SELECT ON public.inventory_stock_view TO authenticated;
GRANT SELECT ON public.inventory_stock_view TO anon;
GRANT SELECT ON public.inventory_low_stock_view TO authenticated;
GRANT SELECT ON public.inventory_low_stock_view TO anon;

-- ============================================================================
-- VERIFICATION
-- Run these queries after the script to verify everything works:
-- ============================================================================

-- Check if views exist:
-- SELECT table_name FROM information_schema.views WHERE table_schema = 'public' AND table_name LIKE 'inventory%';

-- Check inventory_stock_view columns:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'inventory_stock_view';

-- Test the view:
-- SELECT id, name, current_stock, stock_status, packaging_type FROM inventory_stock_view LIMIT 5;

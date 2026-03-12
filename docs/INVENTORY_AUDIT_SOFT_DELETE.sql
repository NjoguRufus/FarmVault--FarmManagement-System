-- ============================================================================
-- DEPRECATED: Use docs/migrations/001_inventory_audit_logs.sql instead
-- ============================================================================
-- This file is outdated. The correct migration is:
--   docs/migrations/001_inventory_audit_logs.sql
--
-- That migration creates the inventory_audit_logs table with the correct
-- schema that matches the live database structure.
-- ============================================================================

-- ============================================================================
-- INVENTORY AUDIT, SOFT DELETE, AND NOTIFICATIONS MIGRATION (DEPRECATED)
-- ============================================================================
-- This migration adds support for:
-- 1. Soft delete (archive) functionality for inventory items
-- 2. Enhanced audit logging with item names and actor names
-- 3. Proper filtering of archived items from stock views
-- ============================================================================

-- ============================================================================
-- STEP 1: Add archive fields to inventory_item_master
-- ============================================================================

-- Add is_archived column (defaults to false)
ALTER TABLE public.inventory_item_master 
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- Add archived_at timestamp
ALTER TABLE public.inventory_item_master 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

-- Add archived_by (user who archived the item)
ALTER TABLE public.inventory_item_master 
ADD COLUMN IF NOT EXISTS archived_by UUID DEFAULT NULL;

-- Add updated_at if not exists
ALTER TABLE public.inventory_item_master 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for filtering archived items
CREATE INDEX IF NOT EXISTS idx_inventory_item_master_archived 
ON public.inventory_item_master (company_id, is_archived);

-- ============================================================================
-- STEP 2: Enhance inventory_audit_logs table
-- ============================================================================

-- Add item_name column for better audit trail readability
ALTER TABLE public.inventory_audit_logs 
ADD COLUMN IF NOT EXISTS item_name TEXT DEFAULT NULL;

-- Add created_by_name for actor display name
ALTER TABLE public.inventory_audit_logs 
ADD COLUMN IF NOT EXISTS created_by_name TEXT DEFAULT NULL;

-- Add notes column for additional context
ALTER TABLE public.inventory_audit_logs 
ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

-- Create index for efficient audit log queries
CREATE INDEX IF NOT EXISTS idx_inventory_audit_logs_company_created 
ON public.inventory_audit_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_audit_logs_item 
ON public.inventory_audit_logs (inventory_item_id, created_at DESC);

-- ============================================================================
-- STEP 3: Update inventory_stock_view to exclude archived items
-- ============================================================================

-- Drop and recreate the view to exclude archived items
-- NOTE: Adjust this based on your actual view definition
-- This is a template - you may need to modify based on your schema

-- First, check if the view exists and get its definition
-- Then recreate it with the is_archived filter

CREATE OR REPLACE VIEW public.inventory_stock_view AS
SELECT 
    im.id,
    im.company_id,
    im.name,
    im.category_id AS category,
    ic.name AS category_name,
    im.supplier_id,
    s.name AS supplier_name,
    COALESCE(im.unit_size_label, 'units') AS unit,
    COALESCE(
        (SELECT SUM(
            CASE 
                WHEN t.transaction_type IN ('purchase', 'stock_in', 'adjustment_in', 'opening_stock') THEN t.quantity
                WHEN t.transaction_type IN ('usage', 'adjustment_out', 'transfer_out') THEN -t.quantity
                ELSE 0
            END
        ) FROM public.inventory_transactions t WHERE t.inventory_item_id = im.id),
        0
    ) AS current_stock,
    im.min_stock_level,
    im.reorder_quantity,
    im.average_cost,
    COALESCE(
        (SELECT SUM(
            CASE 
                WHEN t.transaction_type IN ('purchase', 'stock_in', 'adjustment_in', 'opening_stock') THEN t.quantity
                WHEN t.transaction_type IN ('usage', 'adjustment_out', 'transfer_out') THEN -t.quantity
                ELSE 0
            END
        ) FROM public.inventory_transactions t WHERE t.inventory_item_id = im.id),
        0
    ) * COALESCE(im.average_cost, 0) AS total_value,
    CASE
        WHEN COALESCE(
            (SELECT SUM(
                CASE 
                    WHEN t.transaction_type IN ('purchase', 'stock_in', 'adjustment_in', 'opening_stock') THEN t.quantity
                    WHEN t.transaction_type IN ('usage', 'adjustment_out', 'transfer_out') THEN -t.quantity
                    ELSE 0
                END
            ) FROM public.inventory_transactions t WHERE t.inventory_item_id = im.id),
            0
        ) <= 0 THEN 'out'
        WHEN COALESCE(
            (SELECT SUM(
                CASE 
                    WHEN t.transaction_type IN ('purchase', 'stock_in', 'adjustment_in', 'opening_stock') THEN t.quantity
                    WHEN t.transaction_type IN ('usage', 'adjustment_out', 'transfer_out') THEN -t.quantity
                    ELSE 0
                END
            ) FROM public.inventory_transactions t WHERE t.inventory_item_id = im.id),
            0
        ) < COALESCE(im.min_stock_level, 0) THEN 'low'
        ELSE 'ok'
    END AS stock_status,
    im.unit_size,
    im.unit_size_label,
    im.packaging_type
FROM public.inventory_item_master im
LEFT JOIN public.inventory_categories ic ON ic.id = im.category_id
LEFT JOIN public.suppliers s ON s.id = im.supplier_id
WHERE COALESCE(im.is_archived, FALSE) = FALSE;

-- ============================================================================
-- STEP 4: Create archived items view
-- ============================================================================

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

-- ============================================================================
-- STEP 5: Add RLS policies for archived items
-- ============================================================================

-- Allow users to update archived status
-- (Assuming RLS is already set up for inventory_item_master)

-- ============================================================================
-- STEP 6: Create helper functions
-- ============================================================================

-- Function to archive an inventory item
CREATE OR REPLACE FUNCTION public.archive_inventory_item(
    p_company_id UUID,
    p_item_id UUID,
    p_archived_by UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.inventory_item_master
    SET 
        is_archived = TRUE,
        archived_at = NOW(),
        archived_by = p_archived_by,
        updated_at = NOW()
    WHERE id = p_item_id 
    AND company_id = p_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to restore an archived inventory item
CREATE OR REPLACE FUNCTION public.restore_inventory_item(
    p_company_id UUID,
    p_item_id UUID
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.inventory_item_master
    SET 
        is_archived = FALSE,
        archived_at = NULL,
        archived_by = NULL,
        updated_at = NOW()
    WHERE id = p_item_id 
    AND company_id = p_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- NOTES
-- ============================================================================
-- 
-- After running this migration:
-- 
-- 1. The inventory_stock_view will automatically exclude archived items
-- 2. Archived items can be viewed via inventory_archived_items_view
-- 3. The audit_logs table now supports item_name and created_by_name
-- 4. Use archive_inventory_item() and restore_inventory_item() functions
--    or update the is_archived column directly
--
-- The frontend components handle:
-- - Showing archive confirmation dialog before archiving
-- - Logging audit events for archive/restore actions
-- - Displaying restore button in audit trail for archived items
-- - Sending notifications for all inventory actions
--
-- ============================================================================

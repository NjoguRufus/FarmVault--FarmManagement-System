-- ============================================================================
-- FIX TRANSACTION TYPE CHECK CONSTRAINT
-- ============================================================================
-- The inventory_transactions table has a check constraint that may not include
-- all the transaction types sent by the frontend UI.
-- This script updates the constraint to accept all valid transaction types.
-- ============================================================================

-- First, check what constraint exists
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'public.inventory_transactions'::regclass 
AND contype = 'c';

-- Drop the existing check constraint if it exists
ALTER TABLE public.inventory_transactions 
DROP CONSTRAINT IF EXISTS inventory_transactions_type_check;

ALTER TABLE public.inventory_transactions 
DROP CONSTRAINT IF EXISTS inventory_transactions_transaction_type_check;

ALTER TABLE public.inventory_transactions 
DROP CONSTRAINT IF EXISTS chk_inventory_transactions_type;

-- Also drop any constraint that might have a different name pattern
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.inventory_transactions'::regclass 
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%transaction_type%'
    LOOP
        EXECUTE 'ALTER TABLE public.inventory_transactions DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- Add a new, comprehensive check constraint that includes all valid types
-- Including both lowercase and title-case versions for compatibility
ALTER TABLE public.inventory_transactions
ADD CONSTRAINT inventory_transactions_type_check CHECK (
    transaction_type IN (
        -- Standard lowercase types
        'opening_balance',
        'purchase',
        'stock_in',
        'adjustment_in',
        'return_in',
        'transfer_in',
        'usage',
        'deduction',
        'adjustment_out',
        'return_out',
        'spoilage',
        'transfer_out',
        -- Title-case types (from UI)
        'Purchase',
        'Opening Balance',
        'Adjustment',
        'Return In',
        'Stock In',
        -- Other possible variations
        'stock-in',
        'stock_out',
        'adjustment'
    )
);

-- Verify the constraint was created
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'public.inventory_transactions'::regclass 
AND contype = 'c';

-- Show current transaction types in use
SELECT DISTINCT transaction_type, COUNT(*) as count
FROM public.inventory_transactions
GROUP BY transaction_type
ORDER BY count DESC;

-- ============================================================================
-- FIX COMPANY_ID TYPE MISMATCH
-- ============================================================================
-- The inventory_transactions.company_id is UUID but the RPC receives TEXT.
-- This script recreates the RPCs to cast TEXT to UUID.
-- ============================================================================

-- Drop existing RPCs
DROP FUNCTION IF EXISTS public.record_inventory_stock_in(TEXT, UUID, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.record_inventory_usage(TEXT, UUID, NUMERIC, UUID, TEXT, TEXT, TEXT, TEXT);

-- ============================================================================
-- Create record_inventory_stock_in with UUID cast
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
    v_company_uuid UUID;
BEGIN
    -- Cast company_id TEXT to UUID
    v_company_uuid := company_id::UUID;
    
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
    
    -- Insert the transaction with UUID company_id
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
        v_company_uuid,
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
-- Create record_inventory_usage with UUID cast
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
    v_company_uuid UUID;
BEGIN
    -- Cast company_id TEXT to UUID
    v_company_uuid := company_id::UUID;
    
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
    
    -- Insert the transaction with UUID company_id
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
        v_company_uuid,
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
-- Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.record_inventory_stock_in(TEXT, UUID, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_inventory_stock_in(TEXT, UUID, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_inventory_stock_in(TEXT, UUID, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT) TO anon;

GRANT EXECUTE ON FUNCTION public.record_inventory_usage(TEXT, UUID, NUMERIC, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_inventory_usage(TEXT, UUID, NUMERIC, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_inventory_usage(TEXT, UUID, NUMERIC, UUID, TEXT, TEXT, TEXT, TEXT) TO anon;

-- ============================================================================
-- Verify
-- ============================================================================

SELECT 'RPCs CREATED' as status,
       routine_name, 
       pg_get_function_arguments(p.oid) as arguments
FROM information_schema.routines r
JOIN pg_proc p ON p.proname = r.routine_name AND p.pronamespace = 'public'::regnamespace
WHERE r.routine_schema = 'public' 
AND r.routine_name IN ('record_inventory_stock_in', 'record_inventory_usage');

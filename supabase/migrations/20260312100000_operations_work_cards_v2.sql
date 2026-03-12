-- =============================================================================
-- Operations Work Cards V2 Migration
-- Creates ops schema tables for work cards with inventory integration
-- =============================================================================

-- Ensure ops schema exists
CREATE SCHEMA IF NOT EXISTS ops;

-- Grant usage to authenticated users
GRANT USAGE ON SCHEMA ops TO authenticated;

-- =============================================================================
-- 1) Work Cards Table (ops.work_cards)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ops.work_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  project_id UUID,
  
  -- Work card title/name
  title TEXT,
  
  -- Status: planned, logged, edited, paid
  status TEXT NOT NULL DEFAULT 'planned',
  
  -- Allocated worker (employee who should record work)
  allocated_manager_id UUID,
  
  -- All work card data stored in JSONB payload for flexibility
  payload JSONB NOT NULL DEFAULT '{}',
  
  -- Inputs used (inventory items) - array of {itemId, itemName, quantity, unit}
  inputs_used JSONB NOT NULL DEFAULT '[]',
  
  -- Edit history for transparency - array of {timestamp, actorId, actorName, changes}
  edit_history JSONB NOT NULL DEFAULT '[]',
  
  -- Worker IDs involved in the work
  worker_ids UUID[] DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add constraint for valid status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'work_cards_status_check'
  ) THEN
    ALTER TABLE ops.work_cards 
    ADD CONSTRAINT work_cards_status_check 
    CHECK (status IN ('planned', 'logged', 'edited', 'paid'));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ops_work_cards_company 
  ON ops.work_cards (company_id);
CREATE INDEX IF NOT EXISTS idx_ops_work_cards_project 
  ON ops.work_cards (project_id);
CREATE INDEX IF NOT EXISTS idx_ops_work_cards_allocated_manager 
  ON ops.work_cards (allocated_manager_id);
CREATE INDEX IF NOT EXISTS idx_ops_work_cards_status 
  ON ops.work_cards (status);
CREATE INDEX IF NOT EXISTS idx_ops_work_cards_created_at 
  ON ops.work_cards (created_at DESC);

-- =============================================================================
-- 2) Audit Logs Table (ops.audit_logs)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ops.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  work_card_id UUID REFERENCES ops.work_cards(id) ON DELETE CASCADE,
  
  -- Event details
  event_type TEXT NOT NULL,
  actor_id TEXT,
  actor_name TEXT,
  message TEXT,
  
  -- Additional metadata (old values, new values, etc.)
  payload JSONB DEFAULT '{}',
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_ops_audit_logs_company 
  ON ops.audit_logs (company_id);
CREATE INDEX IF NOT EXISTS idx_ops_audit_logs_work_card 
  ON ops.audit_logs (work_card_id);
CREATE INDEX IF NOT EXISTS idx_ops_audit_logs_created_at 
  ON ops.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_audit_logs_event_type 
  ON ops.audit_logs (event_type);

-- =============================================================================
-- 3) Work Card Inventory Usage Table (links work cards to inventory deductions)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ops.work_card_inventory_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_card_id UUID NOT NULL REFERENCES ops.work_cards(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL,
  inventory_item_name TEXT,
  quantity NUMERIC(12,4) NOT NULL,
  unit TEXT,
  
  -- Who recorded this usage
  recorded_by_user_id TEXT,
  recorded_by_name TEXT,
  
  -- Timestamp
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ops_work_card_inventory_usage_work_card 
  ON ops.work_card_inventory_usage (work_card_id);
CREATE INDEX IF NOT EXISTS idx_ops_work_card_inventory_usage_item 
  ON ops.work_card_inventory_usage (inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_ops_work_card_inventory_usage_recorded_at 
  ON ops.work_card_inventory_usage (recorded_at DESC);

-- =============================================================================
-- 4) Updated_at Trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_work_cards ON ops.work_cards;
CREATE TRIGGER set_updated_at_work_cards
  BEFORE UPDATE ON ops.work_cards
  FOR EACH ROW
  EXECUTE FUNCTION ops.set_updated_at();

-- =============================================================================
-- 5) Row Level Security
-- =============================================================================

ALTER TABLE ops.work_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.work_card_inventory_usage ENABLE ROW LEVEL SECURITY;

-- Work Cards RLS Policies
DROP POLICY IF EXISTS work_cards_select ON ops.work_cards;
CREATE POLICY work_cards_select ON ops.work_cards
  FOR SELECT USING (true);

DROP POLICY IF EXISTS work_cards_insert ON ops.work_cards;
CREATE POLICY work_cards_insert ON ops.work_cards
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS work_cards_update ON ops.work_cards;
CREATE POLICY work_cards_update ON ops.work_cards
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS work_cards_delete ON ops.work_cards;
CREATE POLICY work_cards_delete ON ops.work_cards
  FOR DELETE USING (true);

-- Audit Logs RLS Policies
DROP POLICY IF EXISTS audit_logs_select ON ops.audit_logs;
CREATE POLICY audit_logs_select ON ops.audit_logs
  FOR SELECT USING (true);

DROP POLICY IF EXISTS audit_logs_insert ON ops.audit_logs;
CREATE POLICY audit_logs_insert ON ops.audit_logs
  FOR INSERT WITH CHECK (true);

-- Work Card Inventory Usage RLS Policies
DROP POLICY IF EXISTS work_card_inventory_usage_select ON ops.work_card_inventory_usage;
CREATE POLICY work_card_inventory_usage_select ON ops.work_card_inventory_usage
  FOR SELECT USING (true);

DROP POLICY IF EXISTS work_card_inventory_usage_insert ON ops.work_card_inventory_usage;
CREATE POLICY work_card_inventory_usage_insert ON ops.work_card_inventory_usage
  FOR INSERT WITH CHECK (true);

-- =============================================================================
-- 6) Grants for authenticated users
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.work_cards TO authenticated;
GRANT SELECT, INSERT ON ops.audit_logs TO authenticated;
GRANT SELECT, INSERT ON ops.work_card_inventory_usage TO authenticated;

-- =============================================================================
-- 7) Enable Realtime for work cards (for activity feed)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'ops' 
    AND tablename = 'work_cards'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ops.work_cards;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'ops' 
    AND tablename = 'audit_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ops.audit_logs;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

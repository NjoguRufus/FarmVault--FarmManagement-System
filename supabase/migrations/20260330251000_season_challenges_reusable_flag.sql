-- Persist a "saved as reusable" marker on season challenges so the UI can show a pill
-- and keep the edit toggle checked across reloads.

BEGIN;

ALTER TABLE public.season_challenges
  ADD COLUMN IF NOT EXISTS saved_as_reusable boolean NOT NULL DEFAULT false;

COMMIT;


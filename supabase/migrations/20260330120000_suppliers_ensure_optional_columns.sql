-- Align legacy public.suppliers with the app: older tables may lack columns because
-- CREATE TABLE IF NOT EXISTS (20260310120000) does not alter existing tables.

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS contact TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS categories TEXT[];
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS rating INTEGER;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS review_notes TEXT;

UPDATE public.suppliers SET rating = 0 WHERE rating IS NULL;
UPDATE public.suppliers SET status = 'active' WHERE status IS NULL;

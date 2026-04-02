-- PostgREST RPC calls become ambiguous when two overloads exist, e.g.:
--   dev_list_crop_records(text, text, text, int, int)
--   dev_list_crop_records(uuid, uuid, text, int, int)
-- especially when p_company_id / p_crop_id are null or JSON-encoded.
-- The app and canonical migrations use the TEXT signature only.

begin;

drop function if exists public.dev_list_crop_records(uuid, uuid, text, int, int);

commit;

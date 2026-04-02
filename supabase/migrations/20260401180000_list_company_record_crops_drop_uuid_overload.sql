-- Same class of failure as dev_list_crop_records: a stray (uuid) overload makes PostgREST
-- unable to resolve list_company_record_crops when p_company_id is ambiguous/null.
-- Sending JSON "" can also be coerced to uuid and fail with:
--   invalid input syntax for type uuid: ""
-- Canonical RPC and app use list_company_record_crops(text) only.

begin;

drop function if exists public.list_company_record_crops(uuid);

commit;

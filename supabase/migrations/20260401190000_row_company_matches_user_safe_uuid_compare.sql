-- Avoid v_row::uuid when row_company_id is not UUID-shaped (never cast "" or slugs to uuid).

begin;

create or replace function public.row_company_matches_user(row_company_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, core
as $$
declare
  v_row text;
  v_cur uuid;
begin
  v_row := nullif(trim(coalesce(row_company_id, '')), '');
  if v_row is null then
    return core.current_company_id() is null;
  end if;

  v_cur := core.current_company_id();
  if v_cur is null then
    return false;
  end if;

  if v_row ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    begin
      return v_row::uuid = v_cur;
    exception
      when invalid_text_representation then
        return v_row = v_cur::text;
    end;
  end if;

  return v_row = v_cur::text;
end;
$$;

commit;

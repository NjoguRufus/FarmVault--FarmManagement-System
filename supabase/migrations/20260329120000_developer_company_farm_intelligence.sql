-- Developer-only, security definer RPC: full tenant intelligence for one company.
-- Bypasses tenant RLS safely (gated by admin.is_developer()).

begin;

-- Ensure finance.expenses has optional columns the RPC and app may reference (base table only).
do $$
declare
  v_kind "char";
begin
  if to_regclass('finance.expenses') is not null then
    select c.relkind into v_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'finance' and c.relname = 'expenses';

    if v_kind = 'r' then
      alter table finance.expenses add column if not exists note text;
      alter table finance.expenses add column if not exists notes text;
      alter table finance.expenses add column if not exists item_name text;
      alter table finance.expenses add column if not exists payment_method text;
      update finance.expenses set note = notes where note is null and notes is not null;
      update finance.expenses set notes = note where notes is null and note is not null;
    end if;
  end if;
end$$;

create or replace function public.get_developer_company_farm_intelligence(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = admin, core, public, projects, harvest, finance
as $$
declare
  v_header jsonb := '{}'::jsonb;
  v_metrics jsonb := '{}'::jsonb;
  v_projects jsonb := '[]'::jsonb;
  v_harvests jsonb := '[]'::jsonb;
  v_expenses jsonb := '[]'::jsonb;
  v_inventory jsonb := '[]'::jsonb;
  v_employees jsonb := '[]'::jsonb;
  v_suppliers jsonb := '[]'::jsonb;
  v_collections jsonb := '[]'::jsonb;
  v_payments jsonb := '[]'::jsonb;
  v_timeline jsonb := '[]'::jsonb;
  v_expense_by_category jsonb := '[]'::jsonb;
  v_inventory_audit jsonb := '[]'::jsonb;
  v_activity_logs jsonb := '[]'::jsonb;
  v_employee_activity jsonb := '[]'::jsonb;
  v_users_count bigint := 0;
  v_employees_count bigint := 0;
  v_last_activity timestamptz := null;
  v_inv_has_min_threshold boolean := false;
  v_inv_has_supplier_name boolean := false;
  v_inv_has_last_updated boolean := false;
  v_inv_has_created_at boolean := false;
  v_inv_qty_col text := null;
  v_inv_inner_order_by text := 'i.id';
  v_inv_timeline_at text := 'null::timestamptz';
  v_inv_low_stock bigint := 0;
  v_inv_out_of_stock bigint := 0;
  v_inv_sql text;
  v_inv_stock_case text;
  v_inventory_items_total bigint := 0;
  v_suppliers_total bigint := 0;
  v_work_logs_total bigint := 0;
  v_activity_logs_total bigint := 0;
  v_employee_activity_logs_total bigint := 0;
  v_exp_has_item_name boolean := false;
  v_exp_has_payment_method boolean := false;
  v_exp_sql text;
  v_exp_timeline_subtitle text;
  v_al_has_action boolean := false;
  v_eal_has_action boolean := false;
  v_ial_has_action boolean := false;
  v_ial_has_inventory_item_id boolean := false;
  v_ial_has_quantity boolean := false;
  v_ial_has_metadata boolean := false;
  v_ial_has_created_by boolean := false;
  v_ial_has_created_at boolean := false;
  v_ial_sort_key text := 'al.id';
  v_emp_has_full_name boolean := false;
  v_emp_has_name boolean := false;
  v_emp_has_email boolean := false;
  v_emp_has_role boolean := false;
  v_emp_has_phone boolean := false;
  v_emp_has_status boolean := false;
  v_emp_has_created_at boolean := false;
  v_emp_sort_inner text := 'e.id';
  v_emp_sort_outer text := 'em.id';
  v_emp_timeline_name text := 'null::text';
  v_emp_timeline_at_col text := 'null::timestamptz';
  v_sup_has_name boolean := false;
  v_sup_has_contact boolean := false;
  v_sup_has_email boolean := false;
  v_sup_has_category boolean := false;
  v_sup_has_status boolean := false;
  v_sup_has_created_at boolean := false;
  v_sup_sort_key text := 's.id';
  v_sup_timeline_subtitle text;
  v_sup_timeline_at text := 'null::timestamptz';
  v_hc_has_notes boolean := false;
  v_hc_has_sequence_number boolean := false;
  v_hc_has_project_id boolean := false;
  v_hc_has_collection_date boolean := false;
  v_hc_has_status boolean := false;
  v_hc_has_unit boolean := false;
  v_hc_has_buyer_price_per_unit boolean := false;
  v_hc_has_buyer_paid boolean := false;
  v_hc_has_crop_type boolean := false;
  v_hc_has_created_at boolean := false;
  v_hc_has_created_by boolean := false;
  v_hc_label_expr text := '''Collection''';
  v_hc_sort_inner text := 'hc.id';
  v_hc_sort_outer text := 'z.id';
  v_hc_timeline_at_col text := 'null::timestamptz';
  v_hc_timeline_actor text := 'null::text';
  v_hc_pr_on text := 'false';
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_company_id is null then
    raise exception 'company id required' using errcode = '22004';
  end if;

  if to_regclass('finance.expenses') is not null then
    select
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'finance'
          and c.table_name = 'expenses'
          and c.column_name = 'item_name'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'finance'
          and c.table_name = 'expenses'
          and c.column_name = 'payment_method'
      )
    into v_exp_has_item_name, v_exp_has_payment_method;
  end if;

  v_exp_timeline_subtitle := case
    when v_exp_has_item_name then 'coalesce(e.item_name, e.note, e.notes, e.category)'
    else 'coalesce(e.note, e.notes, e.category)'
  end;

  -- Header: core company + owner profile + subscription snapshot
  select jsonb_build_object(
    'company_id', c.id,
    'name', c.name,
    'logo_url', c.logo_url,
    'email', c.email,
    'phone', null,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'created_by', c.created_by,
    'owner_name', coalesce(pr.full_name, pr.email, null),
    'owner_email', pr.email,
    'users_count', (
      select count(*)::bigint from core.company_members cm where cm.company_id = c.id
    ),
    'subscription', coalesce((
      select jsonb_build_object(
        'company_id', cs.company_id,
        'plan_id', cs.plan_id,
        'plan_code', cs.plan_code,
        'status', cs.status,
        'is_trial', cs.is_trial,
        'trial_started_at', cs.trial_started_at,
        'trial_starts_at', cs.trial_starts_at,
        'trial_ends_at', cs.trial_ends_at,
        'active_until', coalesce(cs.active_until, cs.current_period_end),
        'current_period_start', cs.current_period_start,
        'current_period_end', cs.current_period_end,
        'billing_mode', cs.billing_mode,
        'billing_cycle', cs.billing_cycle,
        'override', cs.override,
        'override_reason', cs.override_reason,
        'override_by', cs.override_by,
        'updated_at', cs.updated_at,
        'created_at', cs.created_at
      )
      from public.company_subscriptions cs
      where cs.company_id::text = c.id::text
      order by coalesce(cs.updated_at, cs.created_at) desc nulls last
      limit 1
    ), '{}'::jsonb)
  )
  into v_header
  from core.companies c
  left join core.profiles pr on pr.clerk_user_id = c.created_by
  where c.id = p_company_id;

  if v_header is null or (v_header->>'company_id') is null then
    return jsonb_build_object('error', 'company_not_found', 'company_id', p_company_id);
  end if;

  v_users_count := coalesce(nullif(trim(v_header->>'users_count'), '')::bigint, 0);

  select count(*)::bigint into v_employees_count
  from public.employees e
  where e.company_id::text = p_company_id::text;

  if to_regclass('public.employees') is not null then
    select
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'employees'
          and c.column_name = 'full_name'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'employees'
          and c.column_name = 'name'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'employees'
          and c.column_name = 'email'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'employees'
          and c.column_name = 'role'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'employees'
          and c.column_name = 'phone'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'employees'
          and c.column_name = 'status'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'employees'
          and c.column_name = 'created_at'
      )
    into
      v_emp_has_full_name,
      v_emp_has_name,
      v_emp_has_email,
      v_emp_has_role,
      v_emp_has_phone,
      v_emp_has_status,
      v_emp_has_created_at;

    v_emp_sort_inner := case
      when v_emp_has_created_at then 'e.created_at'
      else 'e.id'
    end;

    v_emp_sort_outer := case
      when v_emp_has_created_at then 'em.created_at'
      else 'em.id'
    end;

    v_emp_timeline_name := format(
      'coalesce(%s, %s, %s)',
      case when v_emp_has_full_name then 'e.full_name' else 'null::text' end,
      case when v_emp_has_name then 'e.name' else 'null::text' end,
      case when v_emp_has_email then 'e.email' else 'null::text' end
    );

    v_emp_timeline_at_col := case
      when v_emp_has_created_at then 'e.created_at'
      else 'null::timestamptz'
    end;
  end if;

  v_sup_timeline_subtitle := format('coalesce(null::text, null::text, %s)', quote_literal('Supplier'));
  v_sup_timeline_at := 'null::timestamptz';

  if to_regclass('harvest.harvest_collections') is not null then
    select
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'harvest'
          and c.table_name = 'harvest_collections'
          and c.column_name = 'notes'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'harvest'
          and c.table_name = 'harvest_collections'
          and c.column_name = 'sequence_number'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'harvest'
          and c.table_name = 'harvest_collections'
          and c.column_name = 'project_id'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'harvest'
          and c.table_name = 'harvest_collections'
          and c.column_name = 'collection_date'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'harvest'
          and c.table_name = 'harvest_collections'
          and c.column_name = 'status'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'harvest'
          and c.table_name = 'harvest_collections'
          and c.column_name = 'unit'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'harvest'
          and c.table_name = 'harvest_collections'
          and c.column_name = 'buyer_price_per_unit'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'harvest'
          and c.table_name = 'harvest_collections'
          and c.column_name = 'buyer_paid'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'harvest'
          and c.table_name = 'harvest_collections'
          and c.column_name = 'crop_type'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'harvest'
          and c.table_name = 'harvest_collections'
          and c.column_name = 'created_at'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'harvest'
          and c.table_name = 'harvest_collections'
          and c.column_name = 'created_by'
      )
    into
      v_hc_has_notes,
      v_hc_has_sequence_number,
      v_hc_has_project_id,
      v_hc_has_collection_date,
      v_hc_has_status,
      v_hc_has_unit,
      v_hc_has_buyer_price_per_unit,
      v_hc_has_buyer_paid,
      v_hc_has_crop_type,
      v_hc_has_created_at,
      v_hc_has_created_by;

    v_hc_label_expr := case
      when v_hc_has_notes and v_hc_has_sequence_number then
        'coalesce(nullif(trim(hc.notes), ''''), format(''Collection #%s'', coalesce(hc.sequence_number::text, ''—'')))'
      when v_hc_has_notes then
        'nullif(trim(hc.notes), '''')'
      when v_hc_has_sequence_number then
        'format(''Collection #%s'', coalesce(hc.sequence_number::text, ''—''))'
      else
        '''Collection'''
    end;

    v_hc_sort_inner := case
      when v_hc_has_created_at then 'hc.created_at'
      else 'hc.id'
    end;

    v_hc_sort_outer := case
      when v_hc_has_created_at then 'z.created_at'
      else 'z.id'
    end;

    v_hc_timeline_at_col := case
      when v_hc_has_created_at then 'hc.created_at'
      else 'null::timestamptz'
    end;

    v_hc_timeline_actor := case
      when v_hc_has_created_by then 'hc.created_by::text'
      else 'null::text'
    end;

    v_hc_pr_on := case
      when v_hc_has_project_id then 'pr.id = hc.project_id'
      else 'false'
    end;
  end if;

  -- inventory_items may be a table or view; columns vary (e.g. quantity vs current_quantity, optional min_threshold).
  if to_regclass('public.inventory_items') is not null then
    execute $s$
      select count(*)::bigint from public.inventory_items ii where ii.company_id::text = $1
    $s$ into v_inventory_items_total using p_company_id::text;

    select
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'inventory_items'
          and c.column_name = 'min_threshold'
      ),
      case
        when exists (
          select 1
          from information_schema.columns c
          where c.table_schema = 'public'
            and c.table_name = 'inventory_items'
            and c.column_name = 'current_quantity'
        ) then 'current_quantity'
        when exists (
          select 1
          from information_schema.columns c
          where c.table_schema = 'public'
            and c.table_name = 'inventory_items'
            and c.column_name = 'quantity'
        ) then 'quantity'
        else null::text
      end,
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'inventory_items'
          and c.column_name = 'supplier_name'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'inventory_items'
          and c.column_name = 'last_updated'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'inventory_items'
          and c.column_name = 'created_at'
      )
    into v_inv_has_min_threshold, v_inv_qty_col, v_inv_has_supplier_name, v_inv_has_last_updated, v_inv_has_created_at;

    v_inv_inner_order_by := case
      when v_inv_has_last_updated then 'i.last_updated desc nulls last'
      when v_inv_has_created_at then 'i.created_at desc nulls last'
      else 'i.id'
    end;

    v_inv_timeline_at := case
      when v_inv_has_created_at then 'i.created_at'
      when v_inv_has_last_updated then 'i.last_updated'
      else 'null::timestamptz'
    end;

    if v_inv_qty_col is not null then
      execute format(
        $s$
          select count(*)::bigint
          from public.inventory_items ii
          where ii.company_id::text = $1
            and coalesce(ii.%I, 0) <= 0
        $s$,
        v_inv_qty_col
      ) into v_inv_out_of_stock using p_company_id::text;

      if v_inv_has_min_threshold then
        execute format(
          $s$
            select count(*)::bigint
            from public.inventory_items ii
            where ii.company_id::text = $1
              and ii.min_threshold is not null
              and coalesce(ii.%I, 0) <= ii.min_threshold
          $s$,
          v_inv_qty_col
        ) into v_inv_low_stock using p_company_id::text;
      end if;
    end if;
  end if;

  if to_regclass('public.suppliers') is not null then
    execute $s$
      select count(*)::bigint from public.suppliers s where s.company_id::text = $1
    $s$ into v_suppliers_total using p_company_id::text;

    select
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'suppliers'
          and c.column_name = 'name'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'suppliers'
          and c.column_name = 'contact'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'suppliers'
          and c.column_name = 'email'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'suppliers'
          and c.column_name = 'category'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'suppliers'
          and c.column_name = 'status'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'suppliers'
          and c.column_name = 'created_at'
      )
    into
      v_sup_has_name,
      v_sup_has_contact,
      v_sup_has_email,
      v_sup_has_category,
      v_sup_has_status,
      v_sup_has_created_at;

    v_sup_sort_key := case
      when v_sup_has_created_at then 's.created_at'
      else 's.id'
    end;

    v_sup_timeline_subtitle := format(
      'coalesce(%s, %s, %s)',
      case when v_sup_has_name then 's.name' else 'null::text' end,
      case when v_sup_has_contact then 's.contact' else 'null::text' end,
      quote_literal('Supplier')
    );

    v_sup_timeline_at := case
      when v_sup_has_created_at then 's.created_at'
      else 'null::timestamptz'
    end;
  end if;

  if to_regclass('public.work_logs') is not null then
    execute $s$
      select count(*)::bigint from public.work_logs w where w.company_id::text = $1
    $s$ into v_work_logs_total using p_company_id::text;
  end if;

  if to_regclass('public.activity_logs') is not null then
    execute $s$
      select count(*)::bigint from public.activity_logs a where a.company_id::text = $1
    $s$ into v_activity_logs_total using p_company_id::text;
  end if;

  if to_regclass('public.employee_activity_logs') is not null then
    execute $s$
      select count(*)::bigint from public.employee_activity_logs ea where ea.company_id = $1
    $s$ into v_employee_activity_logs_total using p_company_id;
  end if;

  -- Metrics (canonical module schemas + public inventory/suppliers)
  v_metrics := jsonb_build_object(
    'projects_total', (select count(*)::bigint from projects.projects p where p.company_id = p_company_id),
    'users_total', v_users_count,
    'employees_total', v_employees_count,
    'harvest_records_total', (select count(*)::bigint from harvest.harvests h where h.company_id = p_company_id),
    'harvest_quantity_total', coalesce((
      select sum(h.quantity)::numeric from harvest.harvests h where h.company_id = p_company_id
    ), 0),
    'harvest_revenue_total', coalesce((
      select sum(h.quantity * coalesce(h.price_per_unit, 0))::numeric
      from harvest.harvests h where h.company_id = p_company_id
    ), 0),
    'expenses_total', coalesce((
      select sum(e.amount)::numeric from finance.expenses e where e.company_id = p_company_id
    ), 0),
    'expense_count', (select count(*)::bigint from finance.expenses e where e.company_id = p_company_id),
    'inventory_items_total', v_inventory_items_total,
    'inventory_low_stock', case when to_regclass('public.inventory_items') is not null then v_inv_low_stock else 0::bigint end,
    'inventory_out_of_stock', case when to_regclass('public.inventory_items') is not null then v_inv_out_of_stock else 0::bigint end,
    'suppliers_total', v_suppliers_total,
    'collections_total', (select count(*)::bigint from harvest.harvest_collections hc where hc.company_id = p_company_id),
    'work_logs_total', v_work_logs_total,
    'activity_logs_total', v_activity_logs_total,
    'employee_activity_logs_total', v_employee_activity_logs_total
  );

  select greatest(
    (select max(p.updated_at) from projects.projects p where p.company_id = p_company_id),
    (select max(h.created_at) from harvest.harvests h where h.company_id = p_company_id),
    (select max(e.created_at) from finance.expenses e where e.company_id = p_company_id),
    (select max(hc.created_at) from harvest.harvest_collections hc where hc.company_id = p_company_id)
  ) into v_last_activity;

  v_metrics := v_metrics || jsonb_build_object('last_activity_at', v_last_activity);

  -- Projects with lightweight rollups
  select coalesce(jsonb_agg(to_jsonb(q) order by q.sort_at desc nulls last), '[]'::jsonb)
  into v_projects
  from (
    select
      p.id,
      p.company_id,
      p.name,
      p.crop_type,
      coalesce(p.notes, '') as location_notes,
      p.environment,
      p.status,
      p.planting_date as start_date,
      p.budget as allocated_budget,
      p.budget_pool_id,
      p.updated_at,
      p.created_at,
      p.updated_at as sort_at,
      (select count(*)::bigint from harvest.harvests hx where hx.project_id = p.id) as harvest_count,
      (select coalesce(sum(ex.amount), 0)::numeric from finance.expenses ex where ex.project_id = p.id) as actual_spend,
      (select count(distinct epa.employee_id)::bigint from public.employee_project_access epa
       where epa.company_id::text = p_company_id::text and epa.project_id = p.id) as employees_assigned_count
    from projects.projects p
    where p.company_id = p_company_id
    order by p.updated_at desc nulls last
    limit 120
  ) q;

  -- Recent harvests
  select coalesce(jsonb_agg(to_jsonb(h) order by h.harvest_date desc nulls last, h.created_at desc nulls last), '[]'::jsonb)
  into v_harvests
  from (
    select
      h.id,
      h.company_id,
      h.project_id,
      pr.name as project_name,
      h.harvest_date,
      h.unit,
      h.quantity,
      h.price_per_unit,
      (h.quantity * coalesce(h.price_per_unit, 0)) as total_value,
      h.buyer_name,
      h.buyer_paid,
      h.created_by,
      h.created_at,
      pr.crop_type as project_crop
    from harvest.harvests h
    left join projects.projects pr on pr.id = h.project_id
    where h.company_id = p_company_id
    order by h.harvest_date desc nulls last, h.created_at desc nulls last
    limit 150
  ) h;

  -- Recent expenses (item_name is optional on older finance.expenses)
  v_exp_sql := format(
    $f$
      select coalesce(jsonb_agg(to_jsonb(e) order by e.expense_date desc nulls last, e.created_at desc nulls last), '[]'::jsonb)
      from (
        select
          e.id,
          e.company_id,
          e.project_id,
          pr.name as project_name,
          e.category,
          %s as title,
          e.amount,
          e.expense_date,
          %s as payment_method,
          coalesce(e.note, e.notes) as description,
          e.created_by,
          e.created_at
        from finance.expenses e
        left join projects.projects pr on pr.id = e.project_id
        where e.company_id = $1
        order by e.expense_date desc nulls last, e.created_at desc nulls last
        limit 150
      ) e
    $f$,
    case
      when v_exp_has_item_name then 'coalesce(e.item_name, e.note, e.notes, e.category)'
      else 'coalesce(e.note, e.notes, e.category)'
    end,
    case
      when v_exp_has_payment_method then 'e.payment_method'
      else 'null::text'
    end
  );
  execute v_exp_sql into v_expenses using p_company_id;

  -- Category breakdown
  select coalesce(jsonb_agg(to_jsonb(c) order by c.total desc), '[]'::jsonb)
  into v_expense_by_category
  from (
    select e.category, coalesce(sum(e.amount), 0)::numeric as total, count(*)::bigint as cnt
    from finance.expenses e
    where e.company_id = p_company_id
    group by e.category
  ) c;

  -- Inventory (dynamic columns: public.inventory_items may be a view)
  if to_regclass('public.inventory_items') is not null then
    if v_inv_qty_col is null then
      execute format(
        $s$
          select coalesce(jsonb_agg(to_jsonb(ii) order by coalesce(ii.last_updated, ii.created_at) desc nulls last, ii.id), '[]'::jsonb)
          from (
            select
              i.id,
              i.name,
              i.category,
              i.unit,
              null::numeric as current_quantity,
              null::numeric as min_threshold,
              'ok'::text as stock_status,
              %s as supplier_name,
              %s as last_updated,
              %s as created_at
            from public.inventory_items i
            where i.company_id::text = $1
            order by %s
            limit 150
          ) ii
        $s$,
        case
          when v_inv_has_supplier_name then 'i.supplier_name'
          else 'null::text'
        end,
        case
          when v_inv_has_last_updated then 'i.last_updated'
          else 'null::timestamptz'
        end,
        case
          when v_inv_has_created_at then 'i.created_at'
          else 'null::timestamptz'
        end,
        v_inv_inner_order_by
      ) into v_inventory using p_company_id::text;
    else
      v_inv_stock_case := format(
        $f$
          case
            when coalesce(i.%I, 0) <= 0 then 'out_of_stock'
            when %s then 'low_stock'
            else 'ok'
          end
        $f$,
        v_inv_qty_col,
        case
          when v_inv_has_min_threshold then
            format(
              $g$
                i.min_threshold is not null and coalesce(i.%I, 0) <= i.min_threshold
              $g$,
              v_inv_qty_col
            )
          else 'false'
        end
      );
      v_inv_sql := format(
        $f$
          select coalesce(jsonb_agg(to_jsonb(ii) order by coalesce(ii.last_updated, ii.created_at) desc nulls last, ii.id), '[]'::jsonb)
          from (
            select
              i.id,
              i.name,
              i.category,
              i.unit,
              coalesce(i.%I, 0) as current_quantity,
              %s as min_threshold,
              %s as stock_status,
              %s as supplier_name,
              %s as last_updated,
              %s as created_at
            from public.inventory_items i
            where i.company_id::text = $1
            order by %s
            limit 150
          ) ii
        $f$,
        v_inv_qty_col,
        case when v_inv_has_min_threshold then 'i.min_threshold' else 'null::numeric' end,
        v_inv_stock_case,
        case
          when v_inv_has_supplier_name then 'i.supplier_name'
          else 'null::text'
        end,
        case
          when v_inv_has_last_updated then 'i.last_updated'
          else 'null::timestamptz'
        end,
        case
          when v_inv_has_created_at then 'i.created_at'
          else 'null::timestamptz'
        end,
        v_inv_inner_order_by
      );
      execute v_inv_sql into v_inventory using p_company_id::text;
    end if;
  end if;

  if to_regclass('public.inventory_audit_logs') is not null then
    select
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'inventory_audit_logs'
          and c.column_name = 'action'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'inventory_audit_logs'
          and c.column_name = 'inventory_item_id'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'inventory_audit_logs'
          and c.column_name = 'quantity'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'inventory_audit_logs'
          and c.column_name = 'metadata'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'inventory_audit_logs'
          and c.column_name = 'created_by'
      ),
      exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'inventory_audit_logs'
          and c.column_name = 'created_at'
      )
    into
      v_ial_has_action,
      v_ial_has_inventory_item_id,
      v_ial_has_quantity,
      v_ial_has_metadata,
      v_ial_has_created_by,
      v_ial_has_created_at;

    v_ial_sort_key := case
      when v_ial_has_created_at then 'al.created_at'
      else 'al.id'
    end;

    execute format(
      $s$
        select coalesce(jsonb_agg(to_jsonb(al) order by %s desc nulls last), '[]'::jsonb)
        from (
          select
            al.id,
            %s as action,
            %s as inventory_item_id,
            %s as quantity,
            %s as metadata,
            %s as created_by,
            %s as created_at
          from public.inventory_audit_logs al
          where al.company_id::text = $1::text
          order by %s desc nulls last
          limit 40
        ) al
      $s$,
      v_ial_sort_key,
      case when v_ial_has_action then 'al.action' else 'null::text' end,
      case when v_ial_has_inventory_item_id then 'al.inventory_item_id' else 'null::uuid' end,
      case when v_ial_has_quantity then 'al.quantity' else 'null::numeric' end,
      case when v_ial_has_metadata then 'al.metadata' else 'null::jsonb' end,
      case when v_ial_has_created_by then 'al.created_by' else 'null::text' end,
      case when v_ial_has_created_at then 'al.created_at' else 'null::timestamptz' end,
      v_ial_sort_key
    ) into v_inventory_audit using p_company_id::text;
  end if;

  -- Employees (public.employees may be a view with a subset of columns)
  execute format(
    $s$
      select coalesce(jsonb_agg(to_jsonb(em) order by %s desc nulls last), '[]'::jsonb)
      from (
        select
          e.id,
          e.company_id,
          coalesce(%s, %s, %s, 'Employee') as display_name,
          %s as role,
          %s as email,
          %s as phone,
          %s as status,
          %s as created_at,
          (select count(*)::bigint from public.employee_project_access epa
           where epa.employee_id = e.id and epa.company_id::text = $2::text) as assigned_projects_count
        from public.employees e
        where e.company_id::text = $1::text
        order by %s desc nulls last
        limit 200
      ) em
    $s$,
    v_emp_sort_outer,
    case when v_emp_has_full_name then 'e.full_name' else 'null::text' end,
    case when v_emp_has_name then 'e.name' else 'null::text' end,
    case when v_emp_has_email then 'e.email' else 'null::text' end,
    case when v_emp_has_role then 'e.role' else 'null::text' end,
    case when v_emp_has_email then 'e.email' else 'null::text' end,
    case when v_emp_has_phone then 'e.phone' else 'null::text' end,
    case when v_emp_has_status then 'e.status' else 'null::text' end,
    case when v_emp_has_created_at then 'e.created_at' else 'null::timestamptz' end,
    v_emp_sort_inner
  ) into v_employees using p_company_id::text, p_company_id::text;

  -- Suppliers (public.suppliers may omit e.g. contact)
  if to_regclass('public.suppliers') is not null then
    execute format(
      $s$
        select coalesce(jsonb_agg(to_jsonb(s) order by %s desc nulls last), '[]'::jsonb)
        from (
          select
            s.id,
            %s as name,
            %s as contact,
            %s as email,
            %s as category,
            %s as status,
            %s as created_at
          from public.suppliers s
          where s.company_id::text = $1::text
          order by %s desc nulls last
          limit 80
        ) s
      $s$,
      v_sup_sort_key,
      case when v_sup_has_name then 's.name' else 'null::text' end,
      case when v_sup_has_contact then 's.contact' else 'null::text' end,
      case when v_sup_has_email then 's.email' else 'null::text' end,
      case when v_sup_has_category then 's.category' else 'null::text' end,
      case when v_sup_has_status then 's.status' else 'null::text' end,
      case when v_sup_has_created_at then 's.created_at' else 'null::timestamptz' end,
      v_sup_sort_key
    ) into v_suppliers using p_company_id::text;
  end if;

  -- French beans / harvest collections summary (column set varies by migration / view)
  execute replace(format(
    $s$
      select coalesce(jsonb_agg(to_jsonb(z) order by %s desc nulls last), '[]'::jsonb)
      from (
        select
          hc.id,
          hc.company_id,
          %s as project_id,
          pr.name as project_name,
          %s as collection_label,
          %s as collection_date,
          %s as status,
          %s as unit,
          %s as buyer_price_per_unit,
          %s as buyer_paid,
          %s as crop_type,
          %s as created_at,
          (select count(*)::bigint from harvest.harvest_pickers hp where hp.collection_id = hc.id) as picker_count,
          coalesce((
            select sum(pi.quantity)::numeric from harvest.picker_intake_entries pi where pi.collection_id = hc.id
          ), 0) as total_kg,
          coalesce((
            select sum(pp.amount_paid)::numeric from harvest.picker_payment_entries pp where pp.collection_id = hc.id
          ), 0) as total_paid
        from harvest.harvest_collections hc
        left join projects.projects pr on __FV_HC_PR_ON__
        where hc.company_id = $1
        order by %s desc nulls last
        limit 80
      ) z
    $s$,
    v_hc_sort_outer,
    case when v_hc_has_project_id then 'hc.project_id' else 'null::uuid' end,
    v_hc_label_expr,
    case when v_hc_has_collection_date then 'hc.collection_date' else 'null::date' end,
    case when v_hc_has_status then 'hc.status' else 'null::text' end,
    case when v_hc_has_unit then 'hc.unit' else 'null::text' end,
    case when v_hc_has_buyer_price_per_unit then 'hc.buyer_price_per_unit' else 'null::numeric' end,
    case when v_hc_has_buyer_paid then 'hc.buyer_paid' else 'null::boolean' end,
    case when v_hc_has_crop_type then 'hc.crop_type' else 'null::text' end,
    case when v_hc_has_created_at then 'hc.created_at' else 'null::timestamptz' end,
    v_hc_sort_inner
  ), '__FV_HC_PR_ON__', v_hc_pr_on) into v_collections using p_company_id;

  -- Subscription payments
  if to_regclass('public.subscription_payments') is not null then
    select coalesce(jsonb_agg(to_jsonb(sp) order by coalesce(sp.submitted_at, sp.created_at) desc nulls last), '[]'::jsonb)
    into v_payments
    from (
      select
        sp.id,
        sp.company_id,
        sp.plan_id,
        sp.amount,
        sp.currency,
        sp.status,
        sp.billing_mode,
        sp.billing_cycle,
        sp.submitted_at,
        sp.created_at,
        sp.mpesa_name,
        sp.transaction_code
      from public.subscription_payments sp
      where sp.company_id = p_company_id::text
      order by coalesce(sp.submitted_at, sp.created_at) desc nulls last
      limit 30
    ) sp;
  end if;

  -- Unified timeline (module events + activity_logs + employee_activity_logs)
  v_exp_sql := format(
    $f$
      with ev as (
        select * from (
          select
            'project_created'::text as event_type,
            'Project created'::text as title,
            p.name as subtitle,
            p.created_at as at,
            p.created_by::text as actor,
            'projects'::text as module,
            p.id::text as ref_id,
            p.name::text as project_name
          from projects.projects p
          where p.company_id = $1
        union all
          select
            'expense_recorded',
            'Expense recorded',
            %s,
            coalesce(e.created_at, e.expense_date::timestamptz),
            e.created_by,
            'finance',
            e.id::text,
            pr.name
          from finance.expenses e
          left join projects.projects pr on pr.id = e.project_id
          where e.company_id = $1
        union all
    $f$,
    v_exp_timeline_subtitle
  )
  || format($f$
      select
        'harvest_recorded',
        'Harvest recorded',
        concat(h.quantity::text, ' ', h.unit),
        h.created_at,
        h.created_by,
        'harvest',
        h.id::text,
        pr.name
      from harvest.harvests h
      left join projects.projects pr on pr.id = h.project_id
      where h.company_id = $1
    union all
      select
        'harvest_collection',
        'Harvest collection',
        %s,
        %s,
        %s,
        'harvest',
        hc.id::text,
        pr.name
      from harvest.harvest_collections hc
      left join projects.projects pr on __FV_HC_PR_ON__
      where hc.company_id = $1
    union all
      select
        'inventory_item',
        'Inventory item',
        i.name,
        %s,
        null,
        'inventory',
        i.id::text,
        null
      from public.inventory_items i
      where to_regclass('public.inventory_items') is not null
        and i.company_id::text = $1::text
    union all
      select
        'employee_added',
        'Employee added',
        %s,
        %s,
        null,
        'employees',
        e.id::text,
        null
      from public.employees e
      where e.company_id::text = $1::text
    union all
      select
        'supplier_added',
        'Supplier added',
        %s,
        %s,
        null,
        'suppliers',
        s.id::text,
        null
      from public.suppliers s
      where to_regclass('public.suppliers') is not null
        and s.company_id::text = $1::text
        ) u
        where u.at is not null
      ),
      ranked as (
        select * from ev
        order by at desc nulls last
        limit 120
      )
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'event_type', event_type,
          'title', title,
          'subtitle', subtitle,
          'at', at,
          'actor', actor,
          'module', module,
          'ref_id', ref_id,
          'project_name', project_name
        ) order by at desc nulls last
      ), '[]'::jsonb)
      from ranked
    $f$,
    v_hc_label_expr,
    v_hc_timeline_at_col,
    v_hc_timeline_actor,
    v_inv_timeline_at,
    v_emp_timeline_name,
    v_emp_timeline_at_col,
    v_sup_timeline_subtitle,
    v_sup_timeline_at
  );

  v_exp_sql := replace(v_exp_sql, '__FV_HC_PR_ON__', v_hc_pr_on);

  execute v_exp_sql into v_timeline using p_company_id;

  if to_regclass('public.activity_logs') is not null then
    select exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'activity_logs'
        and c.column_name = 'action'
    ) into v_al_has_action;

    execute format(
      $s$
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'event_type', 'activity_log',
            'title', coalesce(a.action, 'Activity'),
            'subtitle', null,
            'at', a.created_at,
            'actor', null,
            'module', 'activity',
            'metadata', a.metadata,
            'project_id', a.project_id
          ) order by a.created_at desc nulls last
        ), '[]'::jsonb)
        from (
          select
            a.id,
            a.company_id,
            a.project_id,
            %s as action,
            a.metadata,
            a.created_at
          from public.activity_logs a
          where a.company_id::text = $1::text
          order by a.created_at desc nulls last
          limit 60
        ) a
      $s$,
      case when v_al_has_action then 'a.action' else 'null::text' end
    ) into v_activity_logs using p_company_id::text;
  end if;

  if to_regclass('public.employee_activity_logs') is not null then
    select exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'employee_activity_logs'
        and c.column_name = 'action'
    ) into v_eal_has_action;

    execute format(
      $s$
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'event_type', 'employee_activity',
            'title', coalesce(ea.action, 'Activity'),
            'subtitle', ea.module,
            'at', ea.created_at,
            'actor', ea.actor_employee_id::text,
            'module', ea.module,
            'metadata', ea.metadata
          ) order by ea.created_at desc nulls last
        ), '[]'::jsonb)
        from (
          select
            ea.id,
            ea.company_id,
            ea.actor_employee_id,
            %s as action,
            ea.module,
            ea.metadata,
            ea.created_at
          from public.employee_activity_logs ea
          where ea.company_id = $1
          order by ea.created_at desc nulls last
          limit 40
        ) ea
      $s$,
      case when v_eal_has_action then 'ea.action' else 'null::text' end
    ) into v_employee_activity using p_company_id;
  end if;

  return jsonb_build_object(
    'header', v_header,
    'metrics', v_metrics,
    'projects', v_projects,
    'harvests', v_harvests,
    'expenses', v_expenses,
    'expense_by_category', v_expense_by_category,
    'inventory', v_inventory,
    'inventory_audit_recent', v_inventory_audit,
    'employees', v_employees,
    'suppliers', v_suppliers,
    'harvest_collections', v_collections,
    'subscription_payments', v_payments,
    'timeline', v_timeline,
    'activity_logs', v_activity_logs,
    'employee_activity_logs', v_employee_activity
  );
end;
$$;

grant execute on function public.get_developer_company_farm_intelligence(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

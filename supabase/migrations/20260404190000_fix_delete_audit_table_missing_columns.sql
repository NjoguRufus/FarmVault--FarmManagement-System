begin;

-- =============================================================================
-- Fix: ensure admin.developer_delete_audit exists with all columns required
-- by delete_user_safely (success, blocked_reason, dependency_counts).
--
-- Root cause: 20260321161000 created the table without those columns, and
-- 20260319000000 may not have run in all environments, leaving the table absent
-- or missing columns — causing "relation does not exist" or column errors.
-- =============================================================================

create schema if not exists admin;

create table if not exists admin.developer_delete_audit (
  id                uuid        primary key default gen_random_uuid(),
  action            text,
  entity_type       text,
  entity_id         text,
  target_id         text,
  target_name       text,
  actor_clerk_user_id text,
  performed_by      text,
  success           boolean,
  blocked_reason    text,
  dependency_counts jsonb,
  metadata          jsonb,
  created_at        timestamptz default now()
);

-- Add any columns that may be missing on environments where the table already
-- exists but was created by an older migration with fewer columns.
alter table admin.developer_delete_audit
  add column if not exists action             text,
  add column if not exists entity_type        text,
  add column if not exists entity_id          text,
  add column if not exists target_id          text,
  add column if not exists target_name        text,
  add column if not exists actor_clerk_user_id text,
  add column if not exists performed_by       text,
  add column if not exists success            boolean,
  add column if not exists blocked_reason     text,
  add column if not exists dependency_counts  jsonb,
  add column if not exists metadata           jsonb,
  add column if not exists created_at         timestamptz default now();

create index if not exists idx_dev_delete_audit_created_at  on admin.developer_delete_audit(created_at desc);
create index if not exists idx_dev_delete_audit_action      on admin.developer_delete_audit(action);
create index if not exists idx_dev_delete_audit_entity      on admin.developer_delete_audit(entity_type, entity_id);
create index if not exists idx_dev_delete_audit_actor       on admin.developer_delete_audit(actor_clerk_user_id);

-- RLS: only developers can read
alter table admin.developer_delete_audit enable row level security;

drop policy if exists developer_delete_audit_select on admin.developer_delete_audit;
create policy developer_delete_audit_select on admin.developer_delete_audit
  for select to authenticated
  using (
    to_regprocedure('admin.is_developer(text)') is not null
    and admin.is_developer(auth.jwt() ->> 'sub')
  );

notify pgrst, 'reload schema';

commit;

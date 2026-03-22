-- Allow notify-company-submission-received to send to company/profile contact email when it differs from JWT primary.

create or replace function public.submission_notify_recipient_allowed(_to text)
returns boolean
language sql
stable
security definer
set search_path = core, public
as $$
  select
    exists (
      select 1
      from core.profiles p
      where p.clerk_user_id = core.current_user_id()
        and nullif(public.normalize_email(p.email), '') is not null
        and public.normalize_email(p.email) = public.normalize_email(_to)
    )
    or exists (
      select 1
      from core.company_members m
      join core.companies c on c.id = m.company_id
      where m.clerk_user_id = core.current_user_id()
        and nullif(public.normalize_email(c.email), '') is not null
        and public.normalize_email(c.email) = public.normalize_email(_to)
    );
$$;

comment on function public.submission_notify_recipient_allowed(text) is
  'True if _to matches the caller profile email or a company email on a row they belong to (submission confirmation email authorization).';

grant execute on function public.submission_notify_recipient_allowed(text) to authenticated;

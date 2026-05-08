-- Set all notification preference flags to default true.
-- Updates existing rows where values are null (never explicitly set).
-- Leaves rows where user explicitly disabled (false) untouched.

begin;

-- Set column defaults to true
alter table notification_preferences
  alter column morning_enabled       set default true,
  alter column evening_enabled       set default true,
  alter column inactivity_enabled    set default true,
  alter column weekly_summary_enabled set default true,
  alter column email_enabled         set default true,
  alter column in_app_enabled        set default true;

-- Backfill existing rows where flags were never set
update notification_preferences
set
  morning_enabled        = coalesce(morning_enabled, true),
  evening_enabled        = coalesce(evening_enabled, true),
  inactivity_enabled     = coalesce(inactivity_enabled, true),
  weekly_summary_enabled = coalesce(weekly_summary_enabled, true),
  email_enabled          = coalesce(email_enabled, true),
  in_app_enabled         = coalesce(in_app_enabled, true);

commit;

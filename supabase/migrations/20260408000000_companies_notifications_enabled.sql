-- Add notifications_enabled flag to core.companies
-- Controls whether OneSignal push permission is requested for all users in a company.
-- Default false: no push prompt until a company admin explicitly enables notifications.

ALTER TABLE core.companies
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN core.companies.notifications_enabled IS
  'When true, OneSignal will prompt users to subscribe to push notifications. '
  'Controlled by the company admin via Notification Settings.';

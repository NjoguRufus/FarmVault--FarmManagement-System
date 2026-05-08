-- Grant service_role SELECT on core schema tables used by engagement-email-cron.

grant usage on schema core to service_role;

grant select on core.companies       to service_role;
grant select on core.company_members to service_role;
grant select on core.profiles        to service_role;

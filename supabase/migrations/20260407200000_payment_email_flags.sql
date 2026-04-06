-- Add email tracking flags to subscription_payments.
-- received_email_sent: set when STK/manual "payment received" confirmation email is sent.
-- approved_email_sent: set when "payment approved, workspace activated" email is sent.
-- Both are safety guards in addition to email_logs dedupe_key deduplication.

begin;

alter table public.subscription_payments
  add column if not exists received_email_sent boolean not null default false,
  add column if not exists approved_email_sent boolean not null default false;

comment on column public.subscription_payments.received_email_sent is
  'True once the payment-received confirmation email has been sent to the company.';
comment on column public.subscription_payments.approved_email_sent is
  'True once the payment-approved / workspace-activated email has been sent to the company.';

commit;

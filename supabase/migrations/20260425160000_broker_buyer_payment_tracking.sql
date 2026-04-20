-- Broker-only bookkeeping on market sales lines: optional buyer phone (search),
-- payment collected amount, or "debt" (pay later). Does not change line_total triggers.

alter table harvest.tomato_market_sales_entries
  add column if not exists buyer_phone text null,
  add column if not exists broker_payment_kind text null,
  add column if not exists broker_collected_amount numeric null;

alter table harvest.fallback_market_sales_entries
  add column if not exists buyer_phone text null,
  add column if not exists broker_payment_kind text null,
  add column if not exists broker_collected_amount numeric null;

alter table harvest.tomato_market_sales_entries
  drop constraint if exists tomato_market_sales_entries_broker_payment_kind_check;

alter table harvest.tomato_market_sales_entries
  add constraint tomato_market_sales_entries_broker_payment_kind_check
  check (broker_payment_kind is null or broker_payment_kind in ('collected', 'debt'));

alter table harvest.tomato_market_sales_entries
  drop constraint if exists tomato_market_sales_entries_broker_collected_amount_check;

alter table harvest.tomato_market_sales_entries
  add constraint tomato_market_sales_entries_broker_collected_amount_check
  check (broker_collected_amount is null or broker_collected_amount >= 0);

alter table harvest.fallback_market_sales_entries
  drop constraint if exists fallback_market_sales_entries_broker_payment_kind_check;

alter table harvest.fallback_market_sales_entries
  add constraint fallback_market_sales_entries_broker_payment_kind_check
  check (broker_payment_kind is null or broker_payment_kind in ('collected', 'debt'));

alter table harvest.fallback_market_sales_entries
  drop constraint if exists fallback_market_sales_entries_broker_collected_amount_check;

alter table harvest.fallback_market_sales_entries
  add constraint fallback_market_sales_entries_broker_collected_amount_check
  check (broker_collected_amount is null or broker_collected_amount >= 0);

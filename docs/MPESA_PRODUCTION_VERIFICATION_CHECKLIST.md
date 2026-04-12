# M-Pesa & production hardening — verification checklist

Run these after deploying migrations and Edge functions (`mpesa-stk-push`, `mpesa-stk-callback`, `mpesa-payment-reconcile`, `system-health-check`).

## 1. STK success → activation

1. Start STK from Billing with a **new** `Idempotency-Key` (UUID).
2. Approve on phone.
3. Confirm `public.mpesa_payments` has non-null `checkout_request_id`, `status = SUCCESS`, `subscription_activated = true` after callback (or within one reconcile cycle if STK Query gate defers activation).
4. Confirm company subscription is active.

## 2. Reservation + bind (no success without DB bind)

1. Trigger STK; confirm a `mpesa_payments` row exists **before** the user pays (row may briefly have `checkout_request_id` null until Daraja returns).
2. Response must include `checkoutRequestId` only when `success: true`.

## 3. Callback without payment row → recovery

1. Simulate missing `mpesa_payments` for a known `CheckoutRequestID` (e.g. dev DB copy).
2. POST a callback payload; confirm a row is created/updated and `payment_webhook_failures` is not spammed on success path.

## 4. Duplicate payment / idempotency

1. Repeat the same request with the same `Idempotency-Key` after a completed push: expect `idempotentReplay: true` and the same `checkoutRequestId`.
2. Attempt a second **different** idempotency key that collides on `checkout_request_id` (rare): expect 23505 handling / replay, not double activation (`subscription_activated` / `success_processed` guards in RPC).

## 5. Concurrent edit (row_version)

1. Open the same project (or harvest collection / inventory item) in two browsers as the same role.
2. Save in A, then save in B: B should get a conflict / “refresh” style error, not a silent overwrite.

## 6. Reconcile job

1. Call `mpesa-payment-reconcile` with a valid `MPESA_RECONCILE_SECRET`.
2. Confirm JSON includes `scanned`, `fixed`, `failed`.
3. Confirm `payment_reconciliation_log` has `action_taken = reconcile_job_completed` for each run.
4. After three automated attempts on the same stuck row, confirm further runs log `pending_skip_max_retries` / `stuck_success_skip_max_retries`.

## 7. Ops SQL — `check_payment_status`

As a platform developer (or `service_role`):

```sql
select public.check_payment_status('YOUR_CHECKOUT_REQUEST_ID');
```

## 8. Reconcile freshness alert

1. Stop scheduled reconcile for >1 hour while M-Pesa activity exists in the last 7 days.
2. Run `system_health_evaluate(true)` (via `system-health-check` cron or manual): expect `mpesa_reconcile_stale` in issues and a `system_health_logs` row with `check_type = mpesa_reconcile_stale`.

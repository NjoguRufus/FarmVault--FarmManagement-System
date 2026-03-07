# FarmVault Operational Stability Audit

**Date:** Pre-flight check for live farm operations  
**Scope:** Auth, Harvest Collections, Quick Intake, Quick Pay, Expenses, schema, error handling, logging.

---

## 1. AUTH STABILITY CHECK

### Inspected
- **main.tsx:** ClerkProvider wrapped in ClerkLoadErrorBoundary; emergency-only path when no Clerk key; catch block renders fallback UI with link to /emergency-access.
- **ClerkLoadErrorBoundary:** Catches errors (including Clerk load failures), shows "Authentication service temporarily unavailable" and "Use emergency access" / "Try again".
- **SignInPage:** Renders Clerk sign-in only; no dependency on AuthContext or employee lookup for initial render.
- **AuthContext:** Clerk load timeout (4s) sets `authReady` true so sign-in page does not freeze; employee lookup failures are non-blocking; `auth_user_id` and `clerk_user_id` both supported in employee resolution.
- **RootRoute:** Uses `authReady` and `isAuthenticated`; no redirect loops; persists last route in localStorage for post-login redirect.
- **ClerkAuthBridge:** Mounts AuthProvider inside ClerkProvider; memoized snapshot to avoid effect loops.

### Verified
- Sign-in page renders without waiting for employee/company.
- Clerk load failures show fallback UI and link to /emergency-access.
- App does not freeze if employee lookup fails (timeout and authReady).
- No redirect loops; RootRoute redirects authenticated users to dashboard or last route.
- Auth state resolves via Clerk + optional emergency session.

---

## 2. HARVEST PAGE STABILITY CHECK

### Inspected
- **HarvestCollectionsPage.tsx:** TypeScript compiles; no syntax errors.
- **State:** `quickMode`, `viewMode`, `selectedCollectionId` are stable (useState); no reset loops observed.
- **Effects:** clear `quickPayLocalPaidByPickerId` when `paymentsForCollection` changes (intentional); set `quickPayPickerId` from queue when in pay mode; no invalidation inside effects that would retrigger the same effect in a loop.
- **Keys:** List keys use `entry.id`, `group.pickerId`, `c.id`, `e.rowKey` (entry id or stable fallback); no unstable key props.
- **Queries:** Invalidations are in event handlers (after save/payment), not in useEffect with dependency on query data that would change after invalidation.

### Verified
- No syntax errors (tsc --noEmit passes).
- No remount/reset loops identified; effects have appropriate deps.
- quickMode, selectedCollectionId, viewMode remain stable between intended updates.

---

## 3. QUICK INTAKE CHECK

### Verified
- Picker number lookup and confirmation use `pickersForCollection` and filtered lists.
- Trip number from `nextTripForPicker` and manual override supported.
- Save intake: `addPickerWeighEntry` then invalidate `pickerIntake` and `harvestCollections`; toast on success/failure.
- Recent entries from `quickIntakeRecentEntries` (sorted by time); grouped by picker in `quickIntakeEntriesByPicker`; expand/collapse via `expandedQuickIntakePickerId`.
- Edit entry: dialog with picker select and kg; `updatePickerIntakeEntry` by entry id; invalidate queries; totals recompute from refetched data.
- Delete entry: `handleDeleteIntakeEntry` with confirm; `deletePickerIntakeEntry` by id; invalidate queries.
- Picker reassignment: edit dialog allows changing picker (same `updatePickerIntakeEntry`); totals update after refetch.
- Totals: `pickerTotalsById` from intake; `paidByPickerId` from payments; collection financials from `computeCollectionFinancials`.
- Same picker/kg/minute entries kept separate (unique key by `entry.id` or index fallback).

---

## 4. PICKER MODAL / LEDGER CHECK

### Verified
- Picker card opens Add weight dialog with selected picker; mini ledger below trip/weight with entries for that picker.
- Ledger columns: #, KG, Price, Time; 12-hour time; total row; edit/delete per row.
- Entry price = kg × picker rate; total = sum of entry prices.
- KG and unit on one row (e.g. "5.0 kg"); no stacked layout.
- Keys: `e.id ?? \`ledger-${idx}\`` for uniqueness.

---

## 5. QUICK PAY / PAYOUT CHECK

### Verified
- Pay Full / Pay Partial call `markPickerCashPaid` → `recordPickerPayment`; insert into `picker_payment_entries` with company_id, collection_id, picker_id, amount_paid, paid_by.
- Service logs "Saving payment" { pickerId, collectionId, amount }.
- On success: invalidate pickerPayments, harvestPickers, harvestCollections; queue and picker cards refresh from server.
- Picker total paid from `paidByPickerId` (sum of payment entries); balance = total_due - total_paid; when balance <= 0 picker excluded from quickPayQueue and shown as paid.
- Payment History in Quick Pay panel shows per-picker payments (Amount, Time) and totals.
- Entry rows show "X kg" and amount on one row.
- **Fix applied:** When online and insert fails, `recordPickerPayment` rethrows (no queue) so the UI shows "Payment failed"; when offline we queue and return so sync can retry later.

---

## 6. COLLECTION TOTALS CHECK

### Verified
- Total kg from intake entries; total picker due = total kg × picker rate; total paid out = sum of payment entries; remaining balance = due - paid.
- `collectionFinancials` and `computeCollectionFinancials` use intake + payment entries; buyer totals use buyer price when closed.
- Edits/deletes/reassignments invalidate pickerIntake and harvestCollections so totals recompute after refetch.

---

## 7. COLLECTION CARDS CHECK

### Verified
- Cards show harvest date (from `harvestDate` / collection_date; fallback createdAt if needed), "Total: X kg", "Pickers: N"; KES only when `canViewPaymentAmounts`.
- `pickersCountByCollectionId` from `pickersRaw`; harvest date from `c.harvestDate`.

---

## 8. EXPENSES / RECENT PAYOUTS CHECK

### Verified
- Normal expenses load via existing queries (Firestore + Supabase).
- Recent Payouts: `getRecentPayoutsSummary(companyId, projectId)` from `picker_payment_entries` grouped by collection; displayed at top when non-empty.
- Clicking a row opens modal; `getCollectionPayoutDetail(collectionId)` loads picker-level rows (picker #, kg, paid, time) and totals.
- No stale field references; payout detail uses listPickerIntake (weightKg), listPickerPayments (amount_paid, paid_at), listPickers (picker_number, picker_name).

---

## 9. DATABASE / SCHEMA CHECK

### Checked
- **harvest.picker_intake_entries:** quantity, collection_id, picker_id, recorded_at; code uses quantity (mapped to weightKg).
- **harvest.picker_payment_entries:** amount_paid, paid_at, paid_by, collection_id, picker_id; no payment_method column in table (column not inserted).
- **harvest.harvest_collections:** collection_date, picker_price_per_unit, price_per_kg, status, notes (name); code aligns.
- **Auth/employees:** Both `clerk_user_id` and `auth_user_id` handled in AuthContext and employeesSupabaseService where applicable.

### Result
- No broken references to removed/renamed columns found. Queries use schema-qualified harvest/finance/projects where applicable.

---

## 10. ERROR HARDENING (FIXES APPLIED)

| Location | Change |
|----------|--------|
| **HarvestCollectionsPage** | Wallet ledger refresh after payment: `.catch(() => {})` → `.catch((err) => { ... console.warn(...) })` so failures are visible in DEV. |
| **harvestCollectionsService.recordPickerPayment** | When online and insert fails: rethrow (do not queue) so caller shows "Payment failed" toast. When offline, queue and return for later sync. |
| **HarvestCollectionsPage** | Intake save catch: toast with message + DEV console.warn. |
| **HarvestCollectionsPage** | Quick Pay catch: toast with message + DEV console.warn. |

---

## 11. LOGGING / DEBUG

| Area | Logging |
|------|--------|
| **Auth** | AuthContext already logs Clerk timeout, load warnings, and Clerk failed. |
| **Harvest mount** | Existing `[Reload Debug] mount` / `unmount` and state change in DEV. |
| **Intake save** | Added DEV log on success: `[Harvest] Intake save success`; existing toast and DEV warn on failure. |
| **Payment save** | Service: `console.log('Saving payment', { pickerId, collectionId, amount })`. Page: added DEV log on success `[Harvest] Payment save success`; DEV warn on failure. |
| **Queue refresh** | Existing `[Quick Pay Queue]` in useEffect when in pay mode. |
| **Collection totals** | Derived in useMemo from queries; refresh happens via query invalidation after mutations (no extra log). |

---

## 12. FILES AUDITED

- `src/main.tsx`
- `src/App.tsx`
- `src/contexts/AuthContext.tsx`
- `src/components/auth/ClerkLoadErrorBoundary.tsx`
- `src/components/auth/ClerkAuthBridge.tsx`
- `src/components/routing/RootRoute.tsx`
- `src/pages/Auth/SignInPage.tsx`
- `src/pages/HarvestCollectionsPage.tsx`
- `src/pages/ExpensesPage.tsx`
- `src/services/harvestCollectionsService.ts`
- Schema/field usage across harvest, finance, employees (grep audit).

---

## 13. FILES MODIFIED (THIS AUDIT)

- `src/pages/HarvestCollectionsPage.tsx` – Wallet refresh catch logging; intake/payment save success and failure logging.
- `src/services/harvestCollectionsService.ts` – recordPickerPayment: rethrow when online after insert failure so UI shows error.

---

## 14. ISSUES FOUND AND FIXED

1. **Silent wallet refresh failure** – After single/batch payment, wallet ledger refresh used `.catch(() => {})`. Replaced with `.catch((err) => { console.warn(...) })` in DEV.
2. **Payment insert failure when online** – recordPickerPayment caught all errors and returned a queued id, so the UI showed "Paid" even when the insert failed. Now when online we rethrow (and do not queue) so the page shows "Payment failed"; when offline we still queue for sync.
3. **Intake save failure** – Already had toast; added DEV console.warn for debugging.
4. **Quick Pay failure** – Already had toast; added DEV console.warn and ensured error message is passed through.

---

## 15. REMAINING RISKS

- **Offline payment:** If the user is offline, payment is queued and the UI shows success; sync runs when back online. If sync fails (e.g. validation), the queue item may stay in "pending" until resolved (existing offline queue behavior).
- **Clerk load:** If Clerk script never loads (e.g. prolonged network failure), users can use emergency access; no code change.
- **Heavy re-renders:** Harvest page has many useMemos and dependent queries; no invalidation loops identified. If collections or intake are very large, consider pagination or virtualization in future (out of scope for this audit).

---

## 16. CONFIRMATION

Today’s critical workflows have been audited and the above fixes applied:

1. Sign-in / authentication – Stable; Clerk failure handled; no freeze on employee lookup.
2. Dashboard load – No changes; relies on auth and existing queries.
3. Projects load – No changes.
4. Harvest Collections load – No syntax/loop issues; queries and state stable.
5. Quick Intake – Save, edit, delete, reassign, and totals verified; identical entries remain separate.
6. Quick Pay / payouts – Payment persisted; online insert failure now surfaces to user; queue and totals refresh.
7. Wallet / payout totals – Correct; wallet refresh errors logged in DEV.
8. Expenses / Recent Payouts – Load and payout summary/detail verified; no stale refs.
9. Recent entry edit/delete – By entry id; queries invalidated; totals update.
10. Picker card modal / mini ledger – Renders; price and totals correct; 12-hour time; kg and unit on one row.

**Operational stability:** Ready for today’s farm operations with the applied fixes and existing safeguards (Clerk error boundary, auth timeout, emergency access, offline queue).

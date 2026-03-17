# Invite/Email Persistence and Production Branding – Summary

## Canonical Table

**`public.employees`** is the single source of truth for:
- **Sent invites** – `status = 'invited'`
- **Drafts** – `status = 'draft'`
- **Archived** – `status = 'archived'`
- **Active** – `status = 'active'`

All list views (Active, Sent Invites, Drafts, Archived) read from this table via `listEmployees(companyId)`, which fetches all rows for the company and filters client-side by status.

## Why Records Were Not Appearing Before

1. **Refetch errors were silent** – `refetchSupabaseEmployees` caught errors but did not show a toast, so list failures were invisible.
2. **No switch to Sent Invites after invite** – After sending an invite, the UI stayed on the current tab instead of switching to Sent Invites.
3. **Missing `invite_sent_at` / `invite_status` columns** – The Edge Function wrote these, but they were not in the schema; a migration was added.
4. **Draft save did not switch to Drafts** – After saving a draft on dialog close, the UI did not switch to the Drafts tab.

## Production Sender Config

**Clerk invitation emails** are sent by Clerk’s API. Sender name, from address, and templates are configured in **Clerk Dashboard → Configure → Email**, not in app code.

If production emails show development branding, check:

1. **Clerk instance** – Production should use the **live** Clerk instance (`pk_live_*` / `sk_live_*`), not the test instance.
2. **Clerk Email settings** – In Clerk Dashboard, set the production sender name and domain for the live instance.
3. **Edge Function env** – Set `APP_BASE_URL` or `FARMVAULT_APP_URL` in Supabase Edge Function secrets to your production URL (e.g. `https://farmvault.africa`) so invite redirect links use the correct domain.

## What Was Changed

### Persistence and UI

1. **`employeesSupabaseService.ts`**
   - Added logging for `listEmployees`, `saveEmployeeDraft`, and `inviteEmployee` (table, filters, payload).
   - Included `invite_sent_at` in the select and mapping.

2. **`EmployeesPage.tsx`**
   - `refetchSupabaseEmployees` now shows a toast on list failure.
   - After a successful invite, switches to the Sent Invites tab (`setSection('invited')`).
   - After saving a draft, switches to the Drafts tab (`setSection('draft')`).
   - Invited date uses `inviteSentAt` when available, otherwise `createdAt`.

3. **Migration `20260318220000_employees_invite_columns.sql`**
   - Adds `invite_status` and `invite_sent_at` to `public.employees` if missing.

4. **`employeesColumns.ts`**
   - Added `invite_sent_at` to `EMPLOYEES_SELECT`.

5. **`Employee` type**
   - Added optional `inviteSentAt` for the invite date.

### Production Email Branding

1. **`invite-employee/index.ts`**
   - Production fallback URL changed from `farmvaultco.vercel.app` to `farmvault.africa`.
   - Comments updated to stress setting `APP_BASE_URL` for production.

2. **`invite-employee/README.md`**
   - Documented `APP_BASE_URL` / `FARMVAULT_APP_URL` for production.
   - Documented Clerk email sender configuration in the Clerk Dashboard.

## Environment Separation

- **Frontend** – Uses `VITE_*` env vars at build time (e.g. Vercel).
- **Edge Function** – Uses Supabase Edge Function secrets (`CLERK_SECRET_KEY`, `APP_BASE_URL`, etc.).
- **Clerk** – Separate test and production instances; production must use the live instance and its Email settings.

## Deployment Checklist

1. Run migrations: `npx supabase db push` or apply `20260318220000_employees_invite_columns.sql`.
2. Set Supabase Edge Function secrets: `APP_BASE_URL=https://farmvault.africa` (or your production URL).
3. Configure Clerk Dashboard → Email for the production instance (sender name, domain).
4. Deploy the Edge Function: `npx supabase functions deploy invite-employee --no-verify-jwt`.

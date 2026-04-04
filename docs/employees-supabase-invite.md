# Employees: Supabase invite flow

This document describes the **Supabase-backed** employee flow (invite by email, set password, login) and how to toggle it alongside the existing Firebase flow.

## Toggle

- **Env:** `VITE_EMPLOYEES_PROVIDER=firebase | supabase`
- **Default:** `firebase` (no change to current behavior if unset)
- **Helper:** `src/lib/provider.ts` exports `employeesProvider`, `isEmployeesSupabase`

When `VITE_EMPLOYEES_PROVIDER=supabase`:

- **Add Employee** becomes **Send Invite**: no password in the UI; the system sends a Supabase invite email.
- The employee clicks the link → sets password → is redirected to `/auth/callback` → then to dashboard.
- Listing uses Supabase `employees` (and joined profile data as needed); editing updates `employees` and `profiles.permissions`.

Firebase code is **not removed**; it is only skipped when the provider is `supabase`.

## Supabase path (high level)

1. **Company admin** (or developer) opens Employees, clicks **Add Employee**.
2. Form: **name**, **email**, **role**, **department**, **phone**, **permissions**. No password.
3. Submit → **Send Invite** calls Edge Function `invite-employee` with the caller’s JWT.
4. Edge Function:
   - Validates caller (company-admin or developer), reads `company_id` from `profiles`.
   - Calls `supabase.auth.admin.inviteUserByEmail(email, { redirectTo })`.
   - Upserts `profiles` (user_id, company_id, role, employee_role, permissions, name, email).
   - Inserts `employees` (auth_user_id, company_id, name, email, department, phone, role, permissions, status).
5. Frontend shows **Invite sent** and closes the modal.
6. **Invited user** receives email, clicks link, sets password, and is sent to `redirectTo` (e.g. `https://farmvaultco.vercel.app/auth/callback` or `http://localhost:8080/auth/callback`).
7. **Auth callback** (`/auth/callback`): Supabase client recovers session from URL hash, then we check `profiles` and redirect to `/dashboard`.

## Redirect URLs

- **Production:** `https://farmvaultco.vercel.app/auth/callback`
- **Local:** `http://localhost:8080/auth/callback` (or your dev origin)

These must be allowed in the Supabase project (**Authentication → URL Configuration → Redirect URLs**).

## Data

- **Permissions:** Stored in **one source of truth:** `profiles.permissions`. Edits to employee permissions update both `employees` and `profiles.permissions`.
- **Listing:** `employees` for the current `company_id`; email comes from `employees.email` (and profile if needed). RLS enforces tenant isolation.

## Security

- **No service role on client.** The Edge Function uses `SUPABASE_SERVICE_ROLE_KEY` server-side only.
- The Edge Function checks the caller’s JWT and `profiles` (company-admin or developer) before inviting or writing.
- Toasts are used for permission errors (e.g. “Only company admins or developers can invite employees”).

**Inviter session:** When `VITE_EMPLOYEES_PROVIDER=supabase`, the “Add Employee” / “Send Invite” action sends the caller’s **Supabase** JWT to the Edge Function. So the logged-in user must have a Supabase session (e.g. after integrating Supabase Auth for the app, or a hybrid login that creates a Supabase session). If there is no Supabase session, the UI will show “You must be signed in to invite employees.”

## Files

| Role | File |
|------|------|
| Env / provider | `src/lib/provider.ts`, `src/vite-env.d.ts` |
| Supabase client | `src/lib/supabase.ts` |
| Edge Function | `supabase/functions/invite-employee/index.ts` |
| Frontend service | `src/services/employeesSupabaseService.ts` |
| UI branch | `src/pages/EmployeesPage.tsx` (provider check, Supabase list/invite/update) |
| Callback route | `src/pages/Auth/AuthCallbackPage.tsx`, route `/auth/callback` in `App.tsx` |

## Deploying the Edge Function and secrets

### Deploy Edge Function

1. Install Supabase CLI and log in: `supabase login`
2. Link the project (if not already): `supabase link --project-ref <your-project-ref>`
3. Deploy the function:
   ```bash
   supabase functions deploy invite-employee
   ```
4. Set secrets (see below). The function needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (and optionally `SUPABASE_ANON_KEY` for verifying the caller JWT).

### Set secrets

Secrets are set in the Supabase project and injected into Edge Functions at runtime. **Never** put the service role key in client code or in the repo.

- In Supabase Dashboard: **Project Settings → Edge Functions → Secrets**, or
- Via CLI:
  ```bash
  supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
  ```
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` are usually provided by Supabase; if your function needs them explicitly, add them as secrets too.

### Redirect URLs

1. In Supabase Dashboard go to **Authentication → URL Configuration**.
2. Under **Redirect URLs**, add:
   - Production: `https://farmvaultco.vercel.app/auth/callback`
   - Local dev: `http://localhost:8080/auth/callback` (or your dev origin, e.g. `http://127.0.0.1:8080/auth/callback`).
3. Save. Invite emails will use the `redirectTo` sent by the Edge Function (see `getRedirectTo()` in `invite-employee/index.ts`).

---

### README snippet (paste into project README)

```markdown
## Employees: Supabase invite (optional)

To use Supabase for employee invites instead of Firebase:

1. Set `VITE_EMPLOYEES_PROVIDER=supabase` in `.env`.
2. Deploy the Edge Function: `supabase functions deploy invite-employee`.
3. Ensure secrets are set (Supabase sets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` automatically; add `SUPABASE_ANON_KEY` if the function needs it for caller verification).
4. In Supabase Dashboard → Authentication → URL Configuration, add your redirect URLs (e.g. `https://farmvaultco.vercel.app/auth/callback`, `http://localhost:8080/auth/callback`).

See [docs/employees-supabase-invite.md](docs/employees-supabase-invite.md) for full details.
```

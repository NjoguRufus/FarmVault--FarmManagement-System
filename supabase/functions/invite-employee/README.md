# invite-employee Edge Function

Creates a **Clerk invitation** (sends a real invite email) and creates/updates the employee record in Supabase. Uses **Clerk only** for auth; no Supabase Auth. Supabase JWT verification must be **disabled** for this function so Clerk tokens are accepted.

## Deploy (required)

```bash
supabase functions deploy invite-employee --no-verify-jwt
```

Without `--no-verify-jwt`, Supabase rejects the request with 401 before the function runs, because the client sends a Clerk JWT, not a Supabase Auth JWT. This function verifies the Clerk token itself via `CLERK_SECRET_KEY` and JWKS.

## Required secrets

Set in Supabase Dashboard → Project Settings → Edge Functions → Secrets:

- **CLERK_SECRET_KEY** – Clerk Backend API secret (starts with `sk_`). Used to verify the caller's JWT and to create invitations via `POST https://api.clerk.com/v1/invitations`. **Must belong to the same Clerk application as the publishable key** used by the frontend; otherwise JWT verification and invitation creation will fail.

Also required (usually already set):

- **SUPABASE_URL** – Project URL
- **SUPABASE_SERVICE_ROLE_KEY** – Service role key for DB writes

## Flow

1. Caller sends `POST` with `Authorization: Bearer <Clerk session token>` and JSON body.
2. Function verifies the token via Clerk JWKS and gets caller user id.
3. Validates `companyId`, `email`, and other required fields.
4. Checks for existing employee (same company + email); returns 409 if already active or already invited.
5. Creates a Clerk invitation (invite email sent by Clerk).
6. Inserts or updates `public.employees` (status `invited`, `clerk_user_id` null).
7. Writes `employee_project_access` for assigned projects.
8. Logs activity via `log_employee_activity` RPC.
9. Returns `{ ok: true, employee_id, message }`.

## Linking after sign-in

When the invited user signs in via Clerk, the app (e.g. `AuthContext`) should call `linkCurrentUserToInvitedEmployee({ clerk_user_id, email, company_id? })` to set `clerk_user_id` and `status = 'active'` on the matching employee row.

## CORS

Handles `OPTIONS` and sets `Access-Control-Allow-Origin: *` and appropriate headers on all responses.

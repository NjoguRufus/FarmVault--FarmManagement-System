# Supabase onboarding (parallel to Firebase)

This document describes the **Supabase-backed onboarding** path that mirrors the existing Firebase onboarding flow without removing Firebase yet.

The UI and 4-step flow in `SetupCompany` remain the same:

1. Company details
2. Admin account
3. Review
4. Plan selection

Supabase is used to:

- Create a Supabase Auth user for the admin.
- Create a `companies` row.
- Create / upsert a `profiles` row with `role = 'company-admin'`.

Firebase is still used for:

- App-wide authentication and sessions.
- Firestore `companies` and `users` documents (existing onboarding behavior remains).

---

## Provider toggle

- **Env:** `VITE_ONBOARDING_PROVIDER=firebase|supabase`
- **Default:** `firebase`
- **Helper:** `src/lib/provider.ts`

Behavior:

- `VITE_ONBOARDING_PROVIDER=firebase` → existing Firebase onboarding only.
- `VITE_ONBOARDING_PROVIDER=supabase` → Supabase **and** Firebase both run:
  - Supabase: `auth.signUp` + Edge Function `create-company`.
  - Firebase: `createUserWithEmailAndPassword` + `createCompany` + `createCompanyUserProfile`.

This keeps the current app working while populating Supabase data for migration.

---

## Flow (Supabase provider)

1. User completes steps 1–4 on `/setup-company` as before.
2. On step 4 submit (`handleCreateAccount`):
   - If `VITE_ONBOARDING_PROVIDER=supabase`:
     1. Call `supabase.auth.signUp({ email: adminEmail, password })`.
     2. If `signUp` returns an error, show it in the existing error area.
     3. If there is no session/access token (email confirmation required), show:
        > “Check your email to confirm your account, then return to continue setup.”
     4. If session exists, call Edge Function `create-company` with:
        ```json
        {
          "companyName": "...",
          "companyEmail": "...",
          "selectedPlan": "basic|pro|enterprise|null",
          "billingMode": "monthly|season|annual",
          "adminName": "...",
          "adminEmail": "..."
        }
        ```
        and header `Authorization: Bearer <access_token>`.
     5. If the function returns `{ error, detail }`, show it in the error area.
   - **Then**, regardless of provider, the existing Firebase onboarding runs:
     - `registerCompanyAdmin(adminEmail, password)` (Firebase Auth).
     - `createCompany(...)` (Firestore `companies` doc).
     - `createCompanyUserProfile(...)` (Firestore `users/{uid}` with `role='company-admin'`).
   - On success: `setSuccess(true)` and show the success screen.
3. User clicks “Go to Dashboard” → `/dashboard` as before.
4. `AuthContext` (Firebase) loads `users/{uid}` and treats the user as setup-complete.

Supabase data is written in parallel and is not yet the source of truth for auth.

---

## Edge Function: `create-company`

**File:** `supabase/functions/create-company/index.ts`

Responsibilities:

- Validate caller using JWT:
  - Read `Authorization: Bearer <token>` header.
  - Use `SUPABASE_URL` + `SUPABASE_ANON_KEY` to create a “user client”.
  - Call `supabase.auth.getUser(token)`.
  - If no user / error: return 401.
- Insert company:
  - Table: `public.companies`.
  - `id`: `crypto.randomUUID()` (TEXT PK).
  - `name`, `status='active'`, `plan` mapped as:
    - `basic` → `starter`
    - `pro` or `professional` → `professional`
    - `enterprise` → `enterprise`
  - `user_count=1`, `project_count=0`, `revenue=0`.
  - `subscription` JSON, mirroring Firebase trial behavior:
    - `plan='trial'`, `status='active'`,
    - `trialStartAt`/`trialEndsAt` (now + `TRIAL_DAYS`, default 7),
    - `paidUntil=null`,
    - `billingMode` from request body or `'monthly'`,
    - `override` with `enabled=false`, `type='custom'`, etc.
- Upsert profile:
  - Table: `public.profiles`.
  - `user_id` = Supabase auth user id.
  - `company_id` = new `companyId`.
  - `role = 'company-admin'`.
  - `name = adminName || adminEmail`.
  - `email = adminEmail`.
  - `onConflict: 'user_id'` to safely re-run.
- Response:
  - `200 OK` with `{ companyId, userId }` on success.
  - `4xx/5xx` with `{ error, detail }` on failures.

---

## Required secrets for the function

Configure these for the `create-company` function:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TRIAL_DAYS` (optional, integer; default 7)

You can also set generic app-level secrets:

- `APP_ORIGIN` (optional; not required by current implementation).
- `AUTH_CALLBACK_PATH` (optional; not required by current implementation).

### Setting secrets (CLI example)

```bash
supabase secrets set \\
  SUPABASE_URL=\"https://your-project.supabase.co\" \\
  SUPABASE_ANON_KEY=\"<anon-key>\" \\
  SUPABASE_SERVICE_ROLE_KEY=\"<service-role-key>\" \\
  TRIAL_DAYS=\"7\"
```

---

## Deploying the function

1. Install Supabase CLI and log in:
   ```bash
   supabase login
   ```
2. Link your project:
   ```bash
   supabase link --project-ref <your-project-ref>
   ```
3. Deploy the function:
   ```bash
   supabase functions deploy create-company
   ```

---

## Redirect URLs and callbacks

Onboarding currently **does not** depend on Supabase redirect URLs directly (since Firebase remains the primary auth for now). If you later move the full login flow to Supabase, you will also want:

- A callback route (e.g. `/auth/callback`) that:
  - Uses `supabase.auth.getSession()` / `exchangeCodeForSession`.
  - Checks `profiles` for `company_id` and `role`.
  - Redirects to `/dashboard` or `/setup-company` depending on setup state.

For now, the only requirement is that Supabase Auth is configured correctly so `auth.signUp` works and sessions can be created.

---

## README snippet

```markdown
## Supabase onboarding (experimental)

- Toggle: `VITE_ONBOARDING_PROVIDER=firebase|supabase` (default `firebase`).
- When `supabase`:
  - `SetupCompany` still shows the same 4 steps.
  - Submit calls `supabase.auth.signUp` and an Edge Function `create-company` to create the Supabase company + profile.
  - Existing Firebase onboarding (Auth + Firestore) still runs to keep the current app behavior.

To deploy the function:

```bash
supabase functions deploy create-company
supabase secrets set SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
```

See `docs/onboarding-supabase.md` for details.
```


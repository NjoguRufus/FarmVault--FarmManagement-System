# Clerk + Supabase: where to configure

Supabase no longer uses a separate "JWT Settings" page for Clerk. Use **Third-Party Auth** instead.

## 1. Supabase Dashboard

1. Open your project: **https://supabase.com/dashboard/project/YOUR_PROJECT_REF**
2. In the left sidebar go to **Authentication**.
3. Look for one of these (UI can vary):
   - **Third-Party** (or **Auth > Third-Party**)
   - **Sign In / Up** → then a **Third-Party** or **Providers** tab
   - Direct link: **https://supabase.com/dashboard/project/_/auth/third-party** (replace `_` with your project ref if needed)
4. Click **Add provider** (or **Add integration**) and choose **Clerk**.
5. Enter your **Clerk domain** (e.g. `clerk.yourapp.com` or `xxx.clerk.accounts.dev` from Clerk Dashboard).
6. Save.

## 2. Clerk Dashboard

1. Go to **https://dashboard.clerk.com/setup/supabase**
2. Select your Clerk application.
3. Click **Activate Supabase integration** (this adds the `role` claim Supabase expects).
4. Copy the **Clerk domain** and use it in Supabase as in step 1.

## 3. Check it works

- Your app already passes the Clerk session token to Supabase via `getSupabaseAccessToken()` in `src/lib/supabase.ts`.
- After the integration is active, Supabase will accept that token and `auth.jwt()` (and so `current_clerk_id()`) will be set for RLS.

## If you don’t see Third-Party / Clerk

- Try: **Authentication** → **Providers** or **Sign In**.
- Or: **Project Settings** (gear) → **API** and look for **JWT** or **Customize JWT** (older projects); newer projects use the Third-Party flow above.
- Docs: [Supabase – Clerk](https://supabase.com/docs/guides/auth/third-party/clerk), [Clerk – Supabase](https://clerk.com/docs/guides/development/integrations/databases/supabase).

---

## Already set up but RLS still blocks (e.g. companies insert)?

1. **Apply the Clerk-friendly companies policy**  
   Run the migration that allows company insert when the Clerk user is present:
   ```bash
   npm run db:push
   ```
   That applies `20240101000011_companies_insert_clerk.sql` (policy: `current_clerk_id() IS NOT NULL`).  
   **Or** in **Supabase Dashboard → SQL Editor**, run the script:
   **`supabase/fix-companies-rls-for-clerk.sql`** (same SQL: create `current_clerk_id()`, drop/recreate `companies_insert`).

2. **Check that the Clerk token is sent**  
   - Sign in, then try “Create company” on onboarding.  
   - Open **DevTools → Network**, find the `POST` to `rest/v1/companies`.  
   - In **Request Headers**, confirm there is `Authorization: Bearer <long-jwt>`.  
   - If there is no `Authorization` header, Supabase never sees a user, so RLS blocks. In that case Clerk may not be on `window` when the request runs, or the third-party integration is not active.

3. **Clerk Supabase integration**  
   In [Clerk Dashboard → Supabase](https://dashboard.clerk.com/setup/supabase), ensure **Activate Supabase integration** is done so session tokens include the `role` claim Supabase expects.

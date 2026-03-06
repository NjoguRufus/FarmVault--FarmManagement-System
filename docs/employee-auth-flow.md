# Employee auth flow (FarmVault)

This doc describes the **secure flow** for creating employees that are required to be authenticated users: company-admin calls an Edge Function (service role), which creates the auth user, inserts into `profiles` and `employees`, and sends an invite or password-reset email.

---

## Requirements (from schema)

- **Employees must be authenticated:** `employees.user_id` is `NOT NULL` and references `auth.users(id)`. Every employee row is tied to exactly one Supabase Auth user.
- **Company-admin only:** Only a user with role `company-admin` (or developer) can create employee rows. RLS enforces this.
- **No client-side auth creation with anon key:** Creating users via `supabase.auth.admin.createUser()` or the Sign Up API from the client would require elevated privileges. To avoid exposing service role to the client, use an **Edge Function** that runs with the service role and performs the full flow server-side.

---

## Secure flow (recommended)

### 1. Company-admin requests “Add employee”

From the FarmVault UI, a company-admin (or developer) fills a form: employee name, email, role, department, etc. The client **does not** create the auth user; it calls an **Edge Function** (e.g. `create-employee`).

### 2. Edge Function (service role)

The Edge Function:

1. **Verifies the caller**  
   - Reads the JWT (e.g. `Authorization: Bearer <anon or user JWT>`) and validates it.  
   - Ensures the caller is a company-admin (or developer) for the given company, e.g. by reading `profiles` / `employees` with the service role or by checking custom claims.

2. **Creates the Auth user**  
   - Uses the **service role** client (e.g. `createClient(supabaseUrl, serviceRoleKey)`) to call:
     - `auth.admin.createUser({ email, password: randomOrTemporary, email_confirm: true })`  
   - Or uses the Invite API if your Supabase project supports it (invite by email; user sets password on first sign-in).

3. **Inserts `profiles`**  
   - Insert one row into `profiles`:  
     - `user_id` = the new auth user’s `id`  
     - `company_id` = the company the employee belongs to  
     - `role` = `'employee'` (or the app role you use for staff)  
     - `employee_role` = from the form (e.g. `'operations-manager'`, `'sales-broker'`)  
     - `name`, `email`, etc.

4. **Inserts `employees`**  
   - Insert one row into `employees`:  
     - `user_id` = same auth user `id`  
     - `company_id` = same company  
     - `name`, `full_name`, `email`, `role`, `employee_role`, `department`, `status`, etc.

5. **Sends invite / reset password email**  
   - **Option A – Invite:** If you used the Invite API, Supabase can send the invite email.  
   - **Option B – Magic link / reset:** Use `auth.admin.generateLink({ type: 'magiclink', email })` (or password recovery) and send the link via your own email (e.g. Resend, SendGrid) or a Supabase-triggered hook.  
   - **Option C – Temporary password:** If you created the user with a temporary password, send that password securely (e.g. one-time link to set a new password) and require the user to change it on first login.

The Edge Function returns success (and optionally the new `user_id` or employee `id`) to the client. The client can then show “Invitation sent” and refresh the employees list.

### 3. Client never sees the service role

- The client only calls the Edge Function (e.g. POST with the new employee payload).
- Only the Edge Function uses the **service role** key to create the auth user and insert into `profiles` and `employees`. The service role key must not be exposed to the browser or mobile app.

### 4. RLS and triggers (already in place)

- **RLS:** Only company-admin (or developer) can insert into `employees`; employees can read/update their own row (and company users can read same-company employees). The trigger prevents non-developers from changing `employees.company_id` or `employees.role`.
- **Multi-tenant:** `profiles.company_id` identifies the user’s company; it can be NULL during onboarding and should be set when the user creates or joins a company.

---

## Example Edge Function sketch (pseudocode)

```ts
// Supabase Edge Function: create-employee
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });

  const supabaseUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user: caller } } = await supabaseUser.auth.getUser();
  if (!caller) return new Response('Unauthorized', { status: 401 });

  const supabaseAdmin = createClient(url, serviceRoleKey);
  const { data: profile } = await supabaseAdmin.from('profiles').select('role, company_id').eq('user_id', caller.id).single();
  const isAdmin = profile?.role === 'company-admin' || profile?.role === 'developer';
  if (!isAdmin || !profile?.company_id) return new Response('Forbidden', { status: 403 });

  const body = await req.json();
  const { email, name, employee_role, department } = body;
  if (!email) return new Response('Bad Request', { status: 400 });

  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (createError) return new Response(JSON.stringify(createError), { status: 400 });

  await supabaseAdmin.from('profiles').insert({
    user_id: newUser.user.id,
    company_id: profile.company_id,
    role: 'employee',
    employee_role: employee_role ?? null,
    name,
    email,
  });

  await supabaseAdmin.from('employees').insert({
    user_id: newUser.user.id,
    company_id: profile.company_id,
    name,
    email,
    employee_role: employee_role ?? null,
    department: department ?? null,
    status: 'active',
  });

  // Send invite: e.g. magic link or reset link, then email via your provider or Supabase.
  const { data: link } = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email });
  // ... send link.data.properties.action_link by email ...

  return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

---

## Summary

| Step | Who | Where |
|------|-----|--------|
| Request “Add employee” | Company-admin | Client (FarmVault UI) |
| Validate caller | Edge Function | Service role |
| Create auth user | Edge Function | `auth.admin.createUser` (service role) |
| Insert `profiles` | Edge Function | `profiles` (service role) |
| Insert `employees` | Edge Function | `employees` (service role) |
| Send invite / set password | Edge Function | Magic link or invite email |
| Read employees | Company users | Client with RLS (anon/user key) |

All employees are authenticated users; company_id and role are protected by RLS and the `employees_protect_company_and_role` trigger.

# Supabase migrations

## Push migrations from the terminal

**1. Log in (one-time):** `npx supabase login` — opens browser to sign in.

**2. Link (one-time):** `npm run db:link` — enter your project ref from the dashboard URL.

**3. Apply migrations:** `npm run db:push`

---

## Remote DB already has schema (e.g. “companies already exists”)

If your remote database was created earlier (dashboard, manual SQL, or old migrations) and `db:push` fails with “relation already exists”, mark those migrations as already applied so only **new** ones run:

```bash
npm run db:repair-history
```

Then run:

```bash
npm run db:push
```

`db:repair-history` marks migrations 20240101000001 through 20240101000009 as applied on the remote; the next push will only apply 20240101000010 (profiles id → text for Clerk) and any later migrations.

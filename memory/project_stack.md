---
name: FarmVault Stack Overview
description: Tech stack, key schemas, auth pattern, Edge Function patterns, UI conventions
type: project
---

FarmVault is a Kenyan farm management SaaS built for company admins, farm operators, and staff.

**Why:** Context for all future development sessions.

**How to apply:** Always verify current file state before acting on this — it's a snapshot.

## Stack
- React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui (Radix)
- React Router v6, React Query v5, Framer Motion, Sonner toasts
- Auth: Clerk (primary), Supabase Auth (fallback). JWT: `auth.jwt() ->> 'sub'` = Clerk user ID
- DB: Supabase PostgreSQL 17. Schemas: public, core, projects, harvest, finance, ops, billing, admin
- Email: Resend via `engagement-email-cron` Edge Function + `send-farmvault-email` Edge Function
- Push: OneSignal + Native Web Push (VAPID). `notification-push-dispatch` Edge Function handles DB trigger → push
- Payments: M-Pesa Daraja (STK push)

## Key patterns
- Always use `db.schema().from()` — never `supabase.from()` directly
- RLS everywhere: `clerk_user_id = (auth.jwt() ->> 'sub')` for user-owned rows
- Edge Functions use service role client (`createServiceRoleSupabaseClient`) for writes
- Email logs in `public.email_logs` via `sendResendWithEmailLog`
- In-app companion messages in `public.farmer_smart_inbox` (written by service role, read by user)
- Notification bell: `NavbarNotificationBell` (system) + `SmartCompanionCenter` (companion)

## Auth
- `user.id` = Clerk user ID (text, e.g. `user_xxx`)
- `user.companyId` = UUID from core.companies
- `user.role`: 'company-admin' | 'developer' | 'employee' | 'driver'

## DB access from frontend
- `db.public()` → public schema (farmer_smart_inbox, notification_preferences, inventory_items, etc.)
- `db.core()` → companies, profiles, company_members
- `db.finance()` → expenses
- `db.harvest()` → harvests
- `db.projects()` → projects, project_stages

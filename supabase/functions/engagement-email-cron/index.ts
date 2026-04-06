// Scheduled engagement emails (Resend + email_logs). Invoked by pg_cron via net.http_post.
//
// Secrets (Edge Function):
//   RESEND_API_KEY                    — required
//   SUPABASE_SERVICE_ROLE_KEY         — required (DB reads + email_logs)
//   SUPABASE_URL                      — required
//   ENGAGEMENT_EMAIL_CRON_SECRET      — required; Bearer token from cron (match Vault secret)
// Optional: FARMVAULT_EMAIL_FROM_ALERTS (trial/daily/engagement); FARMVAULT_PUBLIC_APP_URL
//
// Body JSON: { "run": "morning" | "evening" | "inactivity" | "weekly" | "trial_expiring" | "trial_expired" }
//
// Deploy: npx supabase functions deploy engagement-email-cron --no-verify-jwt
//
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceRoleClientForEmailLogs } from "../_shared/emailLogs.ts";
import { buildTrialEndingEmail } from "../_shared/farmvault-email/trialEndingTemplate.ts";
import { buildTrialExpiredEmail } from "../_shared/farmvault-email/trialExpiredTemplate.ts";
import { getFarmVaultEmailFrom } from "../_shared/farmvaultEmailFrom.ts";
import { sendResendWithEmailLog } from "../_shared/resendSendLogged.ts";
import { createServiceRoleSupabaseClient } from "../_shared/supabaseAdmin.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TYPE_MORNING = "engagement_morning";
const TYPE_EVENING = "engagement_evening_reminder";
const TYPE_INACTIVITY = "engagement_inactivity";
const TYPE_WEEKLY = "engagement_weekly_summary";
const TYPE_TRIAL_EXPIRING = "company_trial_expiring_soon";
const TYPE_TRIAL_EXPIRED = "company_trial_expired";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function utcDayString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function startOfUtcDay(d = new Date()): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function endOfUtcDay(d = new Date()): Date {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function authorizeCron(req: Request): boolean {
  const expected = Deno.env.get("ENGAGEMENT_EMAIL_CRON_SECRET")?.trim();
  if (!expected) return false;
  const auth = req.headers.get("Authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  return bearer === expected;
}

type CompanyRow = { id: string; name: string; subscription_status: string | null };

async function loadEligibleCompanies(admin: SupabaseClient): Promise<CompanyRow[]> {
  const { data, error } = await admin
    .schema("core")
    .from("companies")
    .select("id,name,subscription_status,onboarding_completed")
    .eq("onboarding_completed", true);

  if (error) {
    console.error("[engagement-email-cron] companies query failed", error.message);
    return [];
  }
  const rows = (data ?? []) as (CompanyRow & { onboarding_completed?: boolean })[];
  return rows.filter((c) => (c.subscription_status ?? "") !== "expired");
}

type MemberRow = { company_id: string; clerk_user_id: string };
type ProfileRow = {
  clerk_user_id: string;
  email: string | null;
  full_name: string | null;
  updated_at: string | null;
  user_type?: string | null;
};

async function loadMembersForCompanies(
  admin: SupabaseClient,
  companyIds: string[],
): Promise<MemberRow[]> {
  if (companyIds.length === 0) return [];
  const { data, error } = await admin
    .schema("core")
    .from("company_members")
    .select("company_id, clerk_user_id")
    .in("company_id", companyIds);
  if (error) {
    console.error("[engagement-email-cron] company_members failed", error.message);
    return [];
  }
  return (data ?? []) as MemberRow[];
}

async function loadProfiles(admin: SupabaseClient, clerkIds: string[]): Promise<Map<string, ProfileRow>> {
  const map = new Map<string, ProfileRow>();
  if (clerkIds.length === 0) return map;
  const { data, error } = await admin
    .schema("core")
    .from("profiles")
    .select("clerk_user_id, email, full_name, updated_at, user_type")
    .in("clerk_user_id", clerkIds);
  if (error) {
    console.error("[engagement-email-cron] profiles failed", error.message);
    return map;
  }
  for (const p of (data ?? []) as ProfileRow[]) {
    map.set(p.clerk_user_id, p);
  }
  return map;
}

async function harvestActivityOnDay(
  admin: SupabaseClient,
  companyId: string,
  day: string,
  dayStart: string,
  dayEnd: string,
): Promise<boolean> {
  const q1 = await admin
    .schema("harvest")
    .from("harvests")
    .select("id")
    .eq("company_id", companyId)
    .eq("harvest_date", day)
    .limit(1)
    .maybeSingle();
  if (!q1.error && q1.data) return true;

  const q2 = await admin
    .schema("harvest")
    .from("harvests")
    .select("id")
    .eq("company_id", companyId)
    .gte("created_at", dayStart)
    .lte("created_at", dayEnd)
    .limit(1)
    .maybeSingle();
  if (!q2.error && q2.data) return true;

  return false;
}

async function expenseActivityOnDay(
  admin: SupabaseClient,
  companyId: string,
  day: string,
  dayStart: string,
  dayEnd: string,
): Promise<boolean> {
  const q1 = await admin
    .schema("finance")
    .from("expenses")
    .select("id")
    .eq("company_id", companyId)
    .eq("expense_date", day)
    .limit(1)
    .maybeSingle();
  if (!q1.error && q1.data) return true;

  const q2 = await admin
    .schema("finance")
    .from("expenses")
    .select("id")
    .eq("company_id", companyId)
    .gte("created_at", dayStart)
    .lte("created_at", dayEnd)
    .limit(1)
    .maybeSingle();
  if (!q2.error && q2.data) return true;

  return false;
}

async function publicHarvestCollectionActivityOnDay(
  admin: SupabaseClient,
  companyId: string,
  day: string,
  dayStart: string,
  dayEnd: string,
): Promise<boolean> {
  const q1 = await admin
    .from("harvest_collections")
    .select("id")
    .eq("company_id", companyId)
    .eq("collection_date", day)
    .limit(1)
    .maybeSingle();
  if (!q1.error && q1.data) return true;

  const q2 = await admin
    .from("harvest_collections")
    .select("id")
    .eq("company_id", companyId)
    .gte("created_at", dayStart)
    .lte("created_at", dayEnd)
    .limit(1)
    .maybeSingle();
  if (!q2.error && q2.data) return true;

  return false;
}

async function companyHadActivityToday(
  admin: SupabaseClient,
  companyId: string,
  now = new Date(),
): Promise<boolean> {
  const day = utcDayString(now);
  const dayStart = startOfUtcDay(now).toISOString();
  const dayEnd = endOfUtcDay(now).toISOString();

  if (await harvestActivityOnDay(admin, companyId, day, dayStart, dayEnd)) return true;
  if (await expenseActivityOnDay(admin, companyId, day, dayStart, dayEnd)) return true;
  if (await publicHarvestCollectionActivityOnDay(admin, companyId, day, dayStart, dayEnd)) return true;
  return false;
}

type WeekStats = { harvestCount: number; expensesTotal: number; revenueTotal: number };

async function weeklyStatsForCompany(
  admin: SupabaseClient,
  companyId: string,
  weekStart: Date,
  weekEnd: Date,
): Promise<WeekStats> {
  const start = weekStart.toISOString().slice(0, 10);
  const end = weekEnd.toISOString().slice(0, 10);

  let harvestCount = 0;
  const h = await admin
    .schema("harvest")
    .from("harvests")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .gte("harvest_date", start)
    .lte("harvest_date", end);
  if (!h.error && typeof h.count === "number") harvestCount = h.count;

  let expensesTotal = 0;
  const e = await admin
    .schema("finance")
    .from("expenses")
    .select("amount")
    .eq("company_id", companyId)
    .gte("expense_date", start)
    .lte("expense_date", end);
  if (!e.error && e.data) {
    expensesTotal = (e.data as { amount: number | string }[]).reduce(
      (s, r) => s + Number(r.amount ?? 0),
      0,
    );
  }

  let revenueTotal = 0;
  const revRows = await admin
    .schema("harvest")
    .from("harvests")
    .select("quantity, price_per_unit")
    .eq("company_id", companyId)
    .gte("harvest_date", start)
    .lte("harvest_date", end);
  if (!revRows.error && revRows.data) {
    for (const row of revRows.data as {
      quantity: number | string | null;
      price_per_unit: number | string | null;
    }[]) {
      const q = Number(row.quantity ?? 0);
      const p = Number(row.price_per_unit ?? 0);
      revenueTotal += q * p;
    }
  }

  return { harvestCount, expensesTotal, revenueTotal };
}

function displayName(profile: ProfileRow | undefined): string {
  const n = profile?.full_name?.trim();
  if (n) return n;
  return "there";
}

function isPureAmbassador(profile: ProfileRow | undefined): boolean {
  return profile?.user_type === "ambassador";
}

async function runMorning(params: {
  admin: SupabaseClient;
  logAdmin: ReturnType<typeof getServiceRoleClientForEmailLogs>;
  resendKey: string;
  from: string;
  appUrl: string;
}): Promise<{ sent: number; skipped: number; errors: number }> {
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  const companies = await loadEligibleCompanies(params.admin);
  const members = await loadMembersForCompanies(
    params.admin,
    companies.map((c) => c.id),
  );
  const profiles = await loadProfiles(
    params.admin,
    [...new Set(members.map((m) => m.clerk_user_id))],
  );

  const companyNameById = new Map(companies.map((c) => [c.id, c.name]));

  for (const m of members) {
    const p = profiles.get(m.clerk_user_id);
    if (isPureAmbassador(p)) {
      skipped++;
      continue;
    }
    const email = p?.email?.trim() ?? "";
    if (!email || !EMAIL_RE.test(email)) {
      skipped++;
      continue;
    }
    const name = displayName(p);
    const companyName = companyNameById.get(m.company_id) ?? "your workspace";
    const subject = "Good Morning from FarmVault 🌱";
    const html =
      `<p>Good morning ${escapeHtml(name)},</p>` +
      `<p>Ready to plan your farm today?<br/>FarmVault can help you track everything.</p>` +
      `<p><a href="${escapeHtml(appUrl)}">Open FarmVault</a></p>`;

    const r = await sendResendWithEmailLog({
      admin: params.logAdmin,
      resendKey: params.resendKey,
      from: params.from,
      to: email,
      subject,
      html,
      email_type: TYPE_MORNING,
      company_id: m.company_id,
      company_name: companyName,
      metadata: { run: "morning", clerk_user_id: m.clerk_user_id },
    });
    if (r.ok) sent++;
    else {
      errors++;
      console.error("[engagement-email-cron] morning send failed", email, r.ok ? "" : r.error);
    }
    await sleep(80);
  }

  return { sent, skipped, errors };
}

async function runEvening(params: {
  admin: SupabaseClient;
  logAdmin: ReturnType<typeof getServiceRoleClientForEmailLogs>;
  resendKey: string;
  from: string;
  appUrl: string;
}): Promise<{ sent: number; skipped: number; errors: number }> {
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  const companies = await loadEligibleCompanies(params.admin);
  const now = new Date();

  for (const c of companies) {
    const active = await companyHadActivityToday(params.admin, c.id, now);
    if (active) continue;

    const members = await loadMembersForCompanies(params.admin, [c.id]);
    const profiles = await loadProfiles(
      params.admin,
      members.map((m) => m.clerk_user_id),
    );

    for (const m of members) {
      const p = profiles.get(m.clerk_user_id);
      if (isPureAmbassador(p)) {
        skipped++;
        continue;
      }
      const email = p?.email?.trim() ?? "";
      if (!email || !EMAIL_RE.test(email)) {
        skipped++;
        continue;
      }
      const name = displayName(p);
      const subject = "You haven’t recorded any farm activity today";
      const html =
        `<p>Hi ${escapeHtml(name)},</p>` +
        `<p>Your workspace <strong>${escapeHtml(c.name)}</strong> has no harvest or expense entries logged for today (UTC).</p>` +
        `<p>Take a minute to record what happened on the farm — it keeps your reports accurate.</p>` +
        `<p><a href="${escapeHtml(appUrl)}">Open FarmVault</a></p>`;

      const r = await sendResendWithEmailLog({
        admin: params.logAdmin,
        resendKey: params.resendKey,
        from: params.from,
        to: email,
        subject,
        html,
        email_type: TYPE_EVENING,
        company_id: m.company_id,
        company_name: c.name,
        metadata: { run: "evening", clerk_user_id: m.clerk_user_id },
      });
      if (r.ok) sent++;
      else {
        errors++;
        console.error("[engagement-email-cron] evening send failed", email, r.ok ? "" : r.error);
      }
      await sleep(80);
    }
  }

  return { sent, skipped, errors };
}

async function runInactivity(params: {
  admin: SupabaseClient;
  logAdmin: ReturnType<typeof getServiceRoleClientForEmailLogs>;
  resendKey: string;
  from: string;
  appUrl: string;
}): Promise<{ sent: number; skipped: number; errors: number }> {
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  const companies = await loadEligibleCompanies(params.admin);
  const members = await loadMembersForCompanies(
    params.admin,
    companies.map((c) => c.id),
  );
  const profiles = await loadProfiles(
    params.admin,
    [...new Set(members.map((m) => m.clerk_user_id))],
  );
  const companyNameById = new Map(companies.map((c) => [c.id, c.name]));
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const alreadyEmailed = new Set<string>();

  for (const m of members) {
    const p = profiles.get(m.clerk_user_id);
    if (isPureAmbassador(p)) {
      skipped++;
      continue;
    }
    const email = p?.email?.trim() ?? "";
    if (!email || !EMAIL_RE.test(email)) {
      skipped++;
      continue;
    }
    const emailLower = email.toLowerCase();
    if (alreadyEmailed.has(emailLower)) {
      skipped++;
      continue;
    }
    const updated = p?.updated_at ? new Date(p.updated_at).getTime() : 0;
    if (!updated || updated >= cutoff) {
      skipped++;
      continue;
    }

    const name = displayName(p);
    const companyName = companyNameById.get(m.company_id) ?? "your workspace";
    const subject = "We miss you on FarmVault";
    const html =
      `<p>Hi ${escapeHtml(name)},</p>` +
      `<p>It’s been a little while since we saw you in FarmVault. Your workspace <strong>${escapeHtml(companyName)}</strong> is ready when you are.</p>` +
      `<p><a href="${escapeHtml(appUrl)}">Come back to FarmVault</a></p>`;

    const r = await sendResendWithEmailLog({
      admin: params.logAdmin,
      resendKey: params.resendKey,
      from: params.from,
      to: email,
      subject,
      html,
      email_type: TYPE_INACTIVITY,
      company_id: m.company_id,
      company_name: companyName,
      metadata: { run: "inactivity", clerk_user_id: m.clerk_user_id },
    });
    if (r.ok) {
      sent++;
      alreadyEmailed.add(emailLower);
    } else {
      errors++;
      console.error("[engagement-email-cron] inactivity send failed", email, r.ok ? "" : r.error);
    }
    await sleep(80);
  }

  return { sent, skipped, errors };
}

async function runWeekly(params: {
  admin: SupabaseClient;
  logAdmin: ReturnType<typeof getServiceRoleClientForEmailLogs>;
  resendKey: string;
  from: string;
  appUrl: string;
}): Promise<{ sent: number; skipped: number; errors: number }> {
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  const companies = await loadEligibleCompanies(params.admin);
  const now = new Date();
  const weekEnd = endOfUtcDay(now);
  const weekStart = startOfUtcDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));

  const allMembers = await loadMembersForCompanies(
    params.admin,
    companies.map((c) => c.id),
  );
  const allProfiles = await loadProfiles(
    params.admin,
    [...new Set(allMembers.map((m) => m.clerk_user_id))],
  );

  for (const c of companies) {
    const stats = await weeklyStatsForCompany(params.admin, c.id, weekStart, weekEnd);
    const members = allMembers.filter((m) => m.company_id === c.id);

    const fmt = (n: number) =>
      new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(n);

    for (const m of members) {
      const p = allProfiles.get(m.clerk_user_id);
      if (isPureAmbassador(p)) {
        skipped++;
        continue;
      }
      const email = p?.email?.trim() ?? "";
      if (!email || !EMAIL_RE.test(email)) {
        skipped++;
        continue;
      }
      const name = displayName(p);
      const subject = `Your weekly farm summary — ${c.name}`;
      const html =
        `<p>Hi ${escapeHtml(name)},</p>` +
        `<p>Here’s your farm summary for the last 7 days (UTC) for <strong>${escapeHtml(c.name)}</strong>:</p>` +
        `<ul>` +
        `<li><strong>Harvests recorded:</strong> ${fmt(stats.harvestCount)}</li>` +
        `<li><strong>Expenses (tracked):</strong> ${fmt(stats.expensesTotal)}</li>` +
        `<li><strong>Revenue (harvest sales, qty × price):</strong> ${fmt(stats.revenueTotal)}</li>` +
        `</ul>` +
        `<p><a href="${escapeHtml(appUrl)}">Open FarmVault</a></p>`;

      const r = await sendResendWithEmailLog({
        admin: params.logAdmin,
        resendKey: params.resendKey,
        from: params.from,
        to: email,
        subject,
        html,
        email_type: TYPE_WEEKLY,
        company_id: m.company_id,
        company_name: c.name,
        metadata: { run: "weekly", clerk_user_id: m.clerk_user_id, stats },
      });
      if (r.ok) sent++;
      else {
        errors++;
        console.error("[engagement-email-cron] weekly send failed", email, r.ok ? "" : r.error);
      }
      await sleep(80);
    }
  }

  return { sent, skipped, errors };
}

function daysBetweenUtcDayStarts(from: Date, to: Date): number {
  const a = startOfUtcDay(from).getTime();
  const b = startOfUtcDay(to).getTime();
  return Math.round((b - a) / 86400000);
}

async function alreadySentDedupe(
  logAdmin: ReturnType<typeof getServiceRoleClientForEmailLogs>,
  emailType: string,
  dedupeKey: string,
): Promise<boolean> {
  if (!logAdmin) return false;
  const { data } = await logAdmin
    .from("email_logs")
    .select("id")
    .eq("email_type", emailType)
    .eq("status", "sent")
    .contains("metadata", { dedupe_key: dedupeKey })
    .limit(1)
    .maybeSingle();
  return !!(data as { id?: string } | null)?.id;
}

async function runTrialExpiring(params: {
  admin: SupabaseClient;
  logAdmin: ReturnType<typeof getServiceRoleClientForEmailLogs>;
  resendKey: string;
  from: string;
  appUrl: string;
}): Promise<{ sent: number; skipped: number; errors: number }> {
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  const now = new Date();

  const { data: subs, error } = await params.admin
    .from("company_subscriptions")
    .select("company_id,trial_ends_at,is_trial,status")
    .eq("is_trial", true);
  if (error) {
    console.error("[engagement-email-cron] trial expiring query", error.message);
    return { sent, skipped, errors: 1 };
  }

  const rows = (subs ?? []) as {
    company_id: string;
    trial_ends_at: string | null;
    is_trial?: boolean | null;
    status?: string | null;
  }[];

  for (const row of rows) {
    const endsRaw = row.trial_ends_at;
    if (!endsRaw) {
      skipped++;
      continue;
    }
    const ends = new Date(String(endsRaw));
    if (Number.isNaN(ends.getTime())) {
      skipped++;
      continue;
    }
    if (daysBetweenUtcDayStarts(now, ends) !== 2) {
      skipped++;
      continue;
    }

    const companyId = String(row.company_id ?? "").trim();
    if (!companyId) {
      skipped++;
      continue;
    }

    const { data: comp } = await params.admin
      .schema("core")
      .from("companies")
      .select("name,owner_email,onboarding_completed,created_by")
      .eq("id", companyId)
      .maybeSingle();
    const c = comp as {
      name?: string | null;
      owner_email?: string | null;
      onboarding_completed?: boolean | null;
      created_by?: string | null;
    } | null;
    if (!c?.onboarding_completed) {
      skipped++;
      continue;
    }

    let to = String(c.owner_email ?? "").trim().toLowerCase();
    if (!to || !EMAIL_RE.test(to)) {
      const cb = String(c.created_by ?? "").trim();
      if (cb) {
        const { data: prof } = await params.admin
          .schema("core")
          .from("profiles")
          .select("email")
          .eq("clerk_user_id", cb)
          .maybeSingle();
        to = String((prof as { email?: string } | null)?.email ?? "").trim().toLowerCase();
      }
    }
    if (!to || !EMAIL_RE.test(to)) {
      skipped++;
      continue;
    }

    const companyName = String(c.name ?? "your workspace").trim() || "your workspace";
    const dedupeKey = `trial_expiring:${companyId}:${ends.toISOString().slice(0, 10)}`;
    if (await alreadySentDedupe(params.logAdmin, TYPE_TRIAL_EXPIRING, dedupeKey)) {
      skipped++;
      continue;
    }

    const upgradeUrl = `${params.appUrl}/billing`;
    const rendered = buildTrialEndingEmail({
      companyName,
      daysLeft: 2,
      upgradeUrl,
    });

    const r = await sendResendWithEmailLog({
      admin: params.logAdmin,
      resendKey: params.resendKey,
      from: params.from,
      to,
      subject: rendered.subject,
      html: rendered.html,
      email_type: TYPE_TRIAL_EXPIRING,
      company_id: companyId,
      company_name: companyName,
      metadata: { run: "trial_expiring", dedupe_key: dedupeKey },
    });
    if (r.ok) sent++;
    else {
      errors++;
      console.error("[engagement-email-cron] trial expiring send failed", to, r.ok ? "" : r.error);
    }
    await sleep(80);
  }

  return { sent, skipped, errors };
}

async function runTrialExpired(params: {
  admin: SupabaseClient;
  logAdmin: ReturnType<typeof getServiceRoleClientForEmailLogs>;
  resendKey: string;
  from: string;
  appUrl: string;
}): Promise<{ sent: number; skipped: number; errors: number }> {
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  const now = new Date();

  const { data: subs, error } = await params.admin
    .from("company_subscriptions")
    .select("company_id,trial_ends_at,is_trial,status")
    .eq("is_trial", true);
  if (error) {
    console.error("[engagement-email-cron] trial expired query", error.message);
    return { sent, skipped, errors: 1 };
  }

  const rows = (subs ?? []) as {
    company_id: string;
    trial_ends_at: string | null;
    is_trial?: boolean | null;
    status?: string | null;
  }[];

  for (const row of rows) {
    const endsRaw = row.trial_ends_at;
    if (!endsRaw) {
      skipped++;
      continue;
    }
    const ends = new Date(String(endsRaw));
    if (Number.isNaN(ends.getTime()) || ends.getTime() >= now.getTime()) {
      skipped++;
      continue;
    }

    const companyId = String(row.company_id ?? "").trim();
    if (!companyId) {
      skipped++;
      continue;
    }

    const { data: comp } = await params.admin
      .schema("core")
      .from("companies")
      .select("name,owner_email,onboarding_completed,created_by")
      .eq("id", companyId)
      .maybeSingle();
    const c = comp as {
      name?: string | null;
      owner_email?: string | null;
      onboarding_completed?: boolean | null;
      created_by?: string | null;
    } | null;
    if (!c?.onboarding_completed) {
      skipped++;
      continue;
    }

    let to = String(c.owner_email ?? "").trim().toLowerCase();
    if (!to || !EMAIL_RE.test(to)) {
      const cb = String(c.created_by ?? "").trim();
      if (cb) {
        const { data: prof } = await params.admin
          .schema("core")
          .from("profiles")
          .select("email")
          .eq("clerk_user_id", cb)
          .maybeSingle();
        to = String((prof as { email?: string } | null)?.email ?? "").trim().toLowerCase();
      }
    }
    if (!to || !EMAIL_RE.test(to)) {
      skipped++;
      continue;
    }

    const companyName = String(c.name ?? "your workspace").trim() || "your workspace";
    const dedupeKey = `trial_expired:${companyId}:${ends.toISOString().slice(0, 10)}`;
    if (await alreadySentDedupe(params.logAdmin, TYPE_TRIAL_EXPIRED, dedupeKey)) {
      skipped++;
      continue;
    }

    const rendered = buildTrialExpiredEmail({
      companyName,
      billingUrl: `${params.appUrl}/billing`,
    });

    const r = await sendResendWithEmailLog({
      admin: params.logAdmin,
      resendKey: params.resendKey,
      from: params.from,
      to,
      subject: rendered.subject,
      html: rendered.html,
      email_type: TYPE_TRIAL_EXPIRED,
      company_id: companyId,
      company_name: companyName,
      metadata: { run: "trial_expired", dedupe_key: dedupeKey },
    });
    if (r.ok) sent++;
    else {
      errors++;
      console.error("[engagement-email-cron] trial expired send failed", to, r.ok ? "" : r.error);
    }
    await sleep(80);
  }

  return { sent, skipped, errors };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!authorizeCron(req)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const body = raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
  const run = typeof body?.run === "string" ? body.run.trim() : "";
  if (!["morning", "evening", "inactivity", "weekly", "trial_expiring", "trial_expired"].includes(run)) {
    return jsonResponse(
      {
        error: "Invalid payload",
        detail:
          'Body must include run: "morning" | "evening" | "inactivity" | "weekly" | "trial_expiring" | "trial_expired"',
      },
      400,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!supabaseUrl || !serviceKey || !resendKey) {
    return jsonResponse({ error: "Server misconfiguration", detail: "Missing SUPABASE_URL, service role, or RESEND_API_KEY" }, 500);
  }

  const admin = createServiceRoleSupabaseClient(supabaseUrl, serviceKey);
  const logAdmin = getServiceRoleClientForEmailLogs();
  const from = getFarmVaultEmailFrom("alerts");
  const appUrl = (Deno.env.get("FARMVAULT_PUBLIC_APP_URL") ?? "https://farmvault.africa").replace(/\/$/, "");

  const base = { admin, logAdmin, resendKey, from, appUrl };

  try {
    const summary =
      run === "morning"
        ? await runMorning(base)
        : run === "evening"
          ? await runEvening(base)
          : run === "inactivity"
            ? await runInactivity(base)
            : run === "weekly"
              ? await runWeekly(base)
              : run === "trial_expiring"
                ? await runTrialExpiring(base)
                : await runTrialExpired(base);

    console.log("[engagement-email-cron] completed", run, summary);
    return jsonResponse({ ok: true, run, ...summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[engagement-email-cron] fatal", run, msg);
    return jsonResponse({ error: "Internal error", detail: msg }, 500);
  }
});

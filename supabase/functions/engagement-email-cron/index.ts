// Scheduled engagement emails (Resend + email_logs). Invoked by pg_cron via net.http_post.
//
// Secrets (Edge Function):
//   RESEND_API_KEY                    — required
//   SUPABASE_SERVICE_ROLE_KEY         — required (DB reads + email_logs)
//   SUPABASE_URL                      — required
//   ENGAGEMENT_EMAIL_CRON_SECRET      — required; Bearer token from cron (match Vault secret)
// Optional: FARMVAULT_EMAIL_FROM_ALERTS (trial/daily/engagement); FARMVAULT_PUBLIC_APP_URL
// Optional: FARMVAULT_MESSAGING_TZ (default Africa/Nairobi) — local “today” for smart farmer messages
// Optional: FARMVAULT_SMS_WEBHOOK_URL (+ FARMVAULT_SMS_WEBHOOK_SECRET) — optional SMS fan-out
// Optional: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACT — Web Push (morning/evening/weekly + system_push)
//
// Body JSON: { "run": "morning" | "evening" | "inactivity" | "weekly" | "trial_expiring" | "trial_expired" | "system_push" }
// system_push (cron only): { "run":"system_push", "title", "body", "url"?: "/path", "clerk_user_ids": ["user_..."] }
//
// Smart daily messaging: morning/evening/weekly use real inventory, expenses, harvest, crop stage,
// and rotating pools (365 lines). In-app copy via public.farmer_smart_inbox.
//
// Cron (see 20260407261000_farmer_smart_messaging_inbox_and_cron.sql): 03:30 UTC morning,
// 16:00 UTC evening Mon–Sat, 16:00 UTC Sunday weekly (7:00 / 6:30 EAT Nairobi).
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
import { isWebPushConfigured, sendWebPushToClerkUser } from "../_shared/webPushSend.ts";
import {
  buildEveningMessage,
  buildMorningMessage,
  getMessagingTimezone,
  insertFarmerInbox,
  localDateString,
  loadMessagingState,
  saveMessagingGeneralLine,
  sendOptionalFarmerSms,
} from "../_shared/smartDailyMessaging.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TYPE_MORNING = "smart_farmer_morning";
const TYPE_EVENING = "smart_farmer_evening";
const TYPE_INACTIVITY = "engagement_inactivity";
const TYPE_WEEKLY = "smart_farmer_weekly";
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

function startOfUtcDay(d = new Date()): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
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

/** Daily/weekly smart messages go to farm operators, not field staff (`employee`). */
function isCompanyScheduledNotifyRole(role: string | null | undefined): boolean {
  const r = (role ?? "").toLowerCase().replace(/[-_\s]/g, "");
  if (r === "employee") return false;
  return true;
}
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
    .select("company_id, clerk_user_id, role")
    .in("company_id", companyIds);
  if (error) {
    console.error("[engagement-email-cron] company_members failed", error.message);
    return [];
  }
  const rows = (data ?? []) as { company_id: string; clerk_user_id: string; role: string | null }[];
  return rows
    .filter((r) => isCompanyScheduledNotifyRole(r.role))
    .map(({ company_id, clerk_user_id }) => ({ company_id, clerk_user_id }));
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

function displayName(profile: ProfileRow | undefined): string {
  const n = profile?.full_name?.trim();
  if (n) return n;
  return "there";
}

function isPureAmbassador(profile: ProfileRow | undefined): boolean {
  return profile?.user_type === "ambassador";
}

/** Deep link for smart daily message category (matches app routes). */
function smartDailyPushPath(category: string): string {
  switch (category) {
    case "inventory":
      return "/inventory";
    case "expenses":
      return "/expenses";
    case "harvest":
      return "/harvest-sales";
    case "cropStage":
      return "/crop-stages";
    case "summary":
      return "/dashboard";
    default:
      return "/dashboard";
  }
}

function smartDailyPushType(run: "morning" | "evening" | "weekly"): string {
  if (run === "morning") return "daily_morning";
  if (run === "weekly") return "daily_weekly";
  return "daily_evening";
}

/** One push per member per cron slot; tag dedupes replacement on the device. */
async function sendDailySmartFarmerPush(params: {
  admin: SupabaseClient;
  clerkUserId: string;
  run: "morning" | "evening" | "weekly";
  category: string;
  messageText: string;
  dedupeKey: string;
}): Promise<void> {
  if (!isWebPushConfigured()) return;
  const pushLine =
    params.messageText.split("\n")[0].trim().slice(0, 140) ||
    (params.run === "morning"
      ? "Good morning from FarmVault"
      : params.run === "weekly"
        ? "Your weekly FarmVault summary"
        : "Evening update from FarmVault");
  await sendWebPushToClerkUser(params.admin, params.clerkUserId, {
    type: smartDailyPushType(params.run),
    title: "FarmVault",
    body: pushLine,
    url: smartDailyPushPath(params.category),
    tag: params.dedupeKey.slice(0, 64),
  });
}

async function sendSmartFarmerEmail(params: {
  admin: SupabaseClient;
  logAdmin: ReturnType<typeof getServiceRoleClientForEmailLogs>;
  resendKey: string;
  from: string;
  appUrl: string;
  email: string;
  companyId: string;
  companyName: string;
  clerkUserId: string;
  run: "morning" | "evening" | "weekly";
  emailType: string;
  dedupeKey: string;
  subject: string;
  htmlBody: string;
  inboxSlot: "morning" | "evening" | "weekly";
  category: string;
  messageText: string;
}): Promise<"sent" | "skipped" | "error"> {
  if (await alreadySentDedupe(params.logAdmin, params.emailType, params.dedupeKey)) {
    return "skipped";
  }
  const html =
    params.htmlBody +
    `<p style="margin-top:14px"><a href="${escapeHtml(params.appUrl)}">Open FarmVault</a></p>`;
  const r = await sendResendWithEmailLog({
    admin: params.logAdmin,
    resendKey: params.resendKey,
    from: params.from,
    to: params.email,
    subject: params.subject,
    html,
    email_type: params.emailType,
    company_id: params.companyId,
    company_name: params.companyName,
    metadata: {
      run: params.run,
      clerk_user_id: params.clerkUserId,
      dedupe_key: params.dedupeKey,
      category: params.category,
    },
  });
  if (!r.ok) return "error";
  await insertFarmerInbox(params.admin, {
    companyId: params.companyId,
    clerkUserId: params.clerkUserId,
    slot: params.inboxSlot,
    category: params.category,
    title: params.subject,
    body: params.messageText,
    metadata: { run: params.run, dedupe_key: params.dedupeKey },
  });
  return "sent";
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
  const now = new Date();
  const tz = getMessagingTimezone();
  const localDay = localDateString(now, tz);

  for (const m of members) {
    const p = profiles.get(m.clerk_user_id);
    if (isPureAmbassador(p)) {
      skipped++;
      continue;
    }
    const companyName = companyNameById.get(m.company_id) ?? "your workspace";
    const dedupeKey = `smart_farmer:morning:${m.company_id}:${m.clerk_user_id}:${localDay}`;
    const state = await loadMessagingState(params.admin, m.company_id, m.clerk_user_id);
    const pick = await buildMorningMessage(
      params.admin,
      m.company_id,
      now,
      state?.last_morning_general_line ?? null,
    );
    await sendDailySmartFarmerPush({
      admin: params.admin,
      clerkUserId: m.clerk_user_id,
      run: "morning",
      category: pick.category,
      messageText: pick.text,
      dedupeKey,
    });
    const email = p?.email?.trim() ?? "";
    if (!email || !EMAIL_RE.test(email)) {
      skipped++;
      continue;
    }
    const subject = pick.text.split("\n")[0].slice(0, 140);
    const htmlBody = pick.html;
    const outcome = await sendSmartFarmerEmail({
      admin: params.admin,
      logAdmin: params.logAdmin,
      resendKey: params.resendKey,
      from: params.from,
      appUrl: params.appUrl,
      email,
      companyId: m.company_id,
      companyName,
      clerkUserId: m.clerk_user_id,
      run: "morning",
      emailType: TYPE_MORNING,
      dedupeKey,
      subject,
      htmlBody,
      inboxSlot: "morning",
      category: pick.category,
      messageText: pick.text,
    });
    if (outcome === "sent") {
      sent++;
      if (pick.category === "general") {
        await saveMessagingGeneralLine(params.admin, m.company_id, m.clerk_user_id, "morning", pick.text);
      }
    } else if (outcome === "skipped") skipped++;
    else {
      errors++;
      console.error("[engagement-email-cron] morning send failed", email);
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
  const members = await loadMembersForCompanies(
    params.admin,
    companies.map((c) => c.id),
  );
  const profiles = await loadProfiles(
    params.admin,
    [...new Set(members.map((m) => m.clerk_user_id))],
  );
  const companyNameById = new Map(companies.map((c) => [c.id, c.name]));
  const now = new Date();
  const tz = getMessagingTimezone();
  const localDay = localDateString(now, tz);

  for (const m of members) {
    const p = profiles.get(m.clerk_user_id);
    if (isPureAmbassador(p)) {
      skipped++;
      continue;
    }
    const companyName = companyNameById.get(m.company_id) ?? "your workspace";
    const dedupeKey = `smart_farmer:evening:${m.company_id}:${m.clerk_user_id}:${localDay}`;
    const state = await loadMessagingState(params.admin, m.company_id, m.clerk_user_id);
    const pick = await buildEveningMessage(
      params.admin,
      m.company_id,
      now,
      state?.last_evening_general_line ?? null,
      { weeklySummarySlot: false },
    );
    await sendDailySmartFarmerPush({
      admin: params.admin,
      clerkUserId: m.clerk_user_id,
      run: "evening",
      category: pick.category,
      messageText: pick.text,
      dedupeKey,
    });
    const email = p?.email?.trim() ?? "";
    if (!email || !EMAIL_RE.test(email)) {
      skipped++;
      continue;
    }
    const subject = pick.text.split("\n")[0].slice(0, 140);
    const outcome = await sendSmartFarmerEmail({
      admin: params.admin,
      logAdmin: params.logAdmin,
      resendKey: params.resendKey,
      from: params.from,
      appUrl: params.appUrl,
      email,
      companyId: m.company_id,
      companyName,
      clerkUserId: m.clerk_user_id,
      run: "evening",
      emailType: TYPE_EVENING,
      dedupeKey,
      subject,
      htmlBody: pick.html,
      inboxSlot: "evening",
      category: pick.category,
      messageText: pick.text,
    });
    if (outcome === "sent") {
      sent++;
      await sendOptionalFarmerSms(null, pick.text);
      if (pick.category === "general") {
        await saveMessagingGeneralLine(params.admin, m.company_id, m.clerk_user_id, "evening", pick.text);
      }
    } else if (outcome === "skipped") skipped++;
    else {
      errors++;
      console.error("[engagement-email-cron] evening send failed", email);
    }
    await sleep(80);
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
  const now = new Date();
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
  const tz = getMessagingTimezone();
  const inactivityLocalDay = localDateString(now, tz);
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
    const inactivityDedupe = `inactivity_push:${m.company_id}:${m.clerk_user_id}:${inactivityLocalDay}`;
    const subject = "We miss you on FarmVault";
    const html =
      `<p>Hi ${escapeHtml(name)},</p>` +
      `<p>It’s been a little while since we saw you in FarmVault. Your workspace <strong>${escapeHtml(companyName)}</strong> is ready when you are.</p>` +
      `<p><a href="${escapeHtml(params.appUrl)}">Come back to FarmVault</a></p>`;

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
      await sendWebPushToClerkUser(params.admin, m.clerk_user_id, {
        type: "insight_inactivity",
        title: "FarmVault",
        body: "It's been a while — open FarmVault when you're ready.",
        url: "/dashboard",
        tag: inactivityDedupe.slice(0, 64),
      });
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
  const allMembers = await loadMembersForCompanies(
    params.admin,
    companies.map((c) => c.id),
  );
  const allProfiles = await loadProfiles(
    params.admin,
    [...new Set(allMembers.map((m) => m.clerk_user_id))],
  );
  const companyNameById = new Map(companies.map((c) => [c.id, c.name]));
  const now = new Date();
  const tz = getMessagingTimezone();
  const localDay = localDateString(now, tz);

  for (const m of allMembers) {
    const p = allProfiles.get(m.clerk_user_id);
    if (isPureAmbassador(p)) {
      skipped++;
      continue;
    }
    const companyName = companyNameById.get(m.company_id) ?? "your workspace";
    const dedupeKey = `smart_farmer:weekly:${m.company_id}:${m.clerk_user_id}:${localDay}`;
    const state = await loadMessagingState(params.admin, m.company_id, m.clerk_user_id);
    const pick = await buildEveningMessage(
      params.admin,
      m.company_id,
      now,
      state?.last_evening_general_line ?? null,
      { weeklySummarySlot: true },
    );
    await sendDailySmartFarmerPush({
      admin: params.admin,
      clerkUserId: m.clerk_user_id,
      run: "weekly",
      category: pick.category,
      messageText: pick.text,
      dedupeKey,
    });
    const email = p?.email?.trim() ?? "";
    if (!email || !EMAIL_RE.test(email)) {
      skipped++;
      continue;
    }
    const subject = pick.text.split("\n")[0].slice(0, 140);
    const outcome = await sendSmartFarmerEmail({
      admin: params.admin,
      logAdmin: params.logAdmin,
      resendKey: params.resendKey,
      from: params.from,
      appUrl: params.appUrl,
      email,
      companyId: m.company_id,
      companyName,
      clerkUserId: m.clerk_user_id,
      run: "weekly",
      emailType: TYPE_WEEKLY,
      dedupeKey,
      subject,
      htmlBody: pick.html,
      inboxSlot: "weekly",
      category: pick.category,
      messageText: pick.text,
    });
    if (outcome === "sent") {
      sent++;
      await sendOptionalFarmerSms(null, pick.text);
      if (pick.category === "general") {
        await saveMessagingGeneralLine(params.admin, m.company_id, m.clerk_user_id, "evening", pick.text);
      }
    } else if (outcome === "skipped") skipped++;
    else {
      errors++;
      console.error("[engagement-email-cron] weekly send failed", email);
    }
    await sleep(80);
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
    if (r.ok) {
      sent++;
      const ownerClerk = String(c.created_by ?? "").trim();
      if (ownerClerk.startsWith("user_")) {
        await sendWebPushToClerkUser(params.admin, ownerClerk, {
          type: "premium_trial",
          title: "FarmVault",
          body: "Your trial ends in 2 days. Upgrade to keep full access.",
          url: "/billing",
          tag: dedupeKey.slice(0, 64),
        });
      }
    } else {
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
    if (r.ok) {
      sent++;
      const ownerClerk = String(c.created_by ?? "").trim();
      if (ownerClerk.startsWith("user_")) {
        await sendWebPushToClerkUser(params.admin, ownerClerk, {
          type: "premium_trial",
          title: "FarmVault",
          body: "Your trial has ended. Subscribe to continue with full access.",
          url: "/billing",
          tag: dedupeKey.slice(0, 64),
        });
      }
    } else {
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
  if (
    !["morning", "evening", "inactivity", "weekly", "trial_expiring", "trial_expired", "system_push"].includes(run)
  ) {
    return jsonResponse(
      {
        error: "Invalid payload",
        detail:
          'Body must include run: "morning" | "evening" | "inactivity" | "weekly" | "trial_expiring" | "trial_expired" | "system_push"',
      },
      400,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "Server misconfiguration", detail: "Missing SUPABASE_URL or service role" }, 500);
  }

  const admin = createServiceRoleSupabaseClient(supabaseUrl, serviceKey);

  if (run === "system_push") {
    if (!body) {
      return jsonResponse({ error: "Invalid payload" }, 400);
    }
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const pushBody = typeof body.body === "string" ? body.body.trim() : "";
    const pushUrl = typeof body.url === "string" && body.url.startsWith("/") ? body.url : "/dashboard";
    const idsRaw = body.clerk_user_ids;
    if (!title || !pushBody || !Array.isArray(idsRaw) || idsRaw.length === 0) {
      return jsonResponse(
        { error: "system_push requires title, body, and non-empty clerk_user_ids[]" },
        400,
      );
    }
    let delivered = 0;
    for (const id of idsRaw) {
      if (typeof id !== "string" || !id.trim()) continue;
      const r = await sendWebPushToClerkUser(admin, id.trim(), {
        type: "system_alert",
        title,
        body: pushBody,
        url: pushUrl,
      });
      delivered += r.delivered;
      await sleep(40);
    }
    console.log("[engagement-email-cron] system_push", { delivered });
    return jsonResponse({ ok: true, run, delivered });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!resendKey) {
    return jsonResponse({ error: "Server misconfiguration", detail: "Missing RESEND_API_KEY" }, 500);
  }
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

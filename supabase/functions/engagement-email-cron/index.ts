// Smart Companion Notification System — engagement-email-cron.
//
// Secrets (Edge Function):
//   RESEND_API_KEY                — required
//   SUPABASE_SERVICE_ROLE_KEY     — required (DB reads + email_logs)
//   SUPABASE_URL                  — required
//   ENGAGEMENT_EMAIL_CRON_SECRET  — required; Bearer token from cron
// Optional: FARMVAULT_EMAIL_FROM_ALERTS  FARMVAULT_PUBLIC_APP_URL
// Optional: FARMVAULT_MESSAGING_TZ (default Africa/Nairobi)
// Optional: FARMVAULT_SMS_WEBHOOK_URL (+ FARMVAULT_SMS_WEBHOOK_SECRET)
// Optional: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACT
//
// Body JSON: { "run": "morning" | "evening" | "inactivity" | "weekly" | "trial_expiring" | "trial_expired" | "system_push" }
//
// Cron schedule (pg_cron, UTC):
//   03:30  daily        → morning         (6:30 EAT)
//   16:00  Mon–Sat      → evening         (7:00 PM EAT)
//   16:00  Sunday       → weekly          (7:00 PM EAT)
//   09:00  daily        → inactivity      (12:00 noon EAT)
//
// Deploy: npx supabase functions deploy engagement-email-cron --no-verify-jwt

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceRoleClientForEmailLogs } from "../_shared/emailLogs.ts";
import { buildTrialEndingEmail } from "../_shared/farmvault-email/trialEndingTemplate.ts";
import { buildTrialExpiredEmail } from "../_shared/farmvault-email/trialExpiredTemplate.ts";
import {
  buildCompanionMorningEmail,
  buildCompanionEveningEmail,
  buildCompanionInactivityEmail,
  buildCompanionWeeklySummaryEmail,
  type WeeklySummaryStats,
} from "../_shared/farmvault-email/companionEmailTemplates.ts";
import { getFarmVaultEmailFrom } from "../_shared/farmvaultEmailFrom.ts";
import { sendResendWithEmailLog } from "../_shared/resendSendLogged.ts";
import { createServiceRoleSupabaseClient } from "../_shared/supabaseAdmin.ts";
import { isWebPushConfigured, sendWebPushToClerkUser } from "../_shared/webPushSend.ts";
import { serveFarmVaultEdge } from "../_shared/withEdgeLogging.ts";
import {
  buildEveningMessage,
  buildMorningMessage,
  detectInactivityTier,
  getMessagingTimezone,
  insertFarmerInbox,
  isInLocalTimeWindow,
  isLocalSunday,
  loadCompanionPreferences,
  localDateString,
  loadMessagingState,
  recordInactivityTierSent,
  saveMessagingGeneralLine,
  sendOptionalFarmerSms,
  fetchWeeklyAnalytics,
} from "../_shared/smartDailyMessaging.ts";
import { inactivityTierSubject } from "../_shared/smartDailyMessagingPools.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TYPE_MORNING    = "smart_farmer_morning";
const TYPE_EVENING    = "smart_farmer_evening";
const TYPE_INACTIVITY = "engagement_inactivity";
const TYPE_WEEKLY     = "smart_farmer_weekly";
const TYPE_TRIAL_EXPIRING = "company_trial_expiring_soon";
const TYPE_TRIAL_EXPIRED  = "company_trial_expired";

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

function smartDailyPushPath(category: string): string {
  switch (category) {
    case "inventory": return "/inventory";
    case "expenses":  return "/expenses";
    case "harvest":   return "/harvest-sales";
    case "cropStage": return "/crop-stages";
    default:          return "/home";
  }
}

function smartDailyPushType(run: "morning" | "evening" | "weekly"): string {
  if (run === "morning") return "daily_morning";
  if (run === "weekly")  return "daily_weekly";
  return "daily_evening";
}

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

// ---------------------------------------------------------------------------
// Morning
// ---------------------------------------------------------------------------

async function runMorning(params: {
  admin: SupabaseClient;
  logAdmin: ReturnType<typeof getServiceRoleClientForEmailLogs>;
  resendKey: string;
  from: string;
  appUrl: string;
}): Promise<{ sent: number; skipped: number; errors: number }> {
  let sent = 0, skipped = 0, errors = 0;
  const companies    = await loadEligibleCompanies(params.admin);
  const members      = await loadMembersForCompanies(params.admin, companies.map((c) => c.id));
  const profiles     = await loadProfiles(params.admin, [...new Set(members.map((m) => m.clerk_user_id))]);
  const companyById  = new Map(companies.map((c) => [c.id, c]));
  const now          = new Date();
  const tz           = getMessagingTimezone();
  const localDay     = localDateString(now, tz);

  for (const m of members) {
    const p           = profiles.get(m.clerk_user_id);
    if (isPureAmbassador(p)) { skipped++; continue; }

    const prefs = await loadCompanionPreferences(params.admin, m.clerk_user_id);
    if (!prefs.morning_enabled) { skipped++; continue; }
    // Timezone window: only send when it is 5:30 AM – 10:00 AM in the user's local timezone.
    // The pg_cron fires at 3:30 UTC (6:30 EAT). Users in other zones are skipped and
    // will be reached when additional cron entries cover their UTC morning window.
    if (!isInLocalTimeWindow(prefs.timezone, 5, 10)) { skipped++; continue; }

    const company    = companyById.get(m.company_id);
    const companyName = company?.name ?? "your workspace";
    const dedupeKey  = `smart_farmer:morning:${m.company_id}:${m.clerk_user_id}:${localDay}`;
    const state      = await loadMessagingState(params.admin, m.company_id, m.clerk_user_id);
    const pick       = await buildMorningMessage(params.admin, m.company_id, now, state?.last_morning_general_line ?? null);

    // Web push (respects device opt-in)
    await sendDailySmartFarmerPush({
      admin: params.admin, clerkUserId: m.clerk_user_id,
      run: "morning", category: pick.category, messageText: pick.text, dedupeKey,
    });

    // In-app inbox
    if (prefs.in_app_enabled) {
      await insertFarmerInbox(params.admin, {
        companyId: m.company_id, clerkUserId: m.clerk_user_id,
        slot: "morning", category: pick.category,
        title: pick.text.split("\n")[0].slice(0, 140),
        body: pick.text,
        metadata: { run: "morning", dedupe_key: dedupeKey },
      });
    }

    // Email
    if (!prefs.email_enabled) { skipped++; continue; }
    const email = p?.email?.trim() ?? "";
    if (!email || !EMAIL_RE.test(email)) { skipped++; continue; }
    if (await alreadySentDedupe(params.logAdmin, TYPE_MORNING, dedupeKey)) { skipped++; continue; }

    const name = displayName(p);
    const { subject, html } = buildCompanionMorningEmail({
      displayName: name,
      messageText: pick.text,
      messageHtml: pick.html,
      appUrl: params.appUrl,
      farmName: companyName !== "your workspace" ? companyName : undefined,
    });

    const r = await sendResendWithEmailLog({
      admin: params.logAdmin, resendKey: params.resendKey,
      from: params.from, to: email, subject, html,
      email_type: TYPE_MORNING, company_id: m.company_id, company_name: companyName,
      metadata: { run: "morning", clerk_user_id: m.clerk_user_id, dedupe_key: dedupeKey, category: pick.category },
    });

    if (r.ok) {
      sent++;
      if (pick.category === "general") {
        await saveMessagingGeneralLine(params.admin, m.company_id, m.clerk_user_id, "morning", pick.text);
      }
    } else {
      errors++;
      console.error("[engagement-email-cron] morning send failed", email);
    }
    await sleep(80);
  }
  return { sent, skipped, errors };
}

// ---------------------------------------------------------------------------
// Evening
// ---------------------------------------------------------------------------

async function runEvening(params: {
  admin: SupabaseClient;
  logAdmin: ReturnType<typeof getServiceRoleClientForEmailLogs>;
  resendKey: string;
  from: string;
  appUrl: string;
}): Promise<{ sent: number; skipped: number; errors: number }> {
  let sent = 0, skipped = 0, errors = 0;
  const companies   = await loadEligibleCompanies(params.admin);
  const members     = await loadMembersForCompanies(params.admin, companies.map((c) => c.id));
  const profiles    = await loadProfiles(params.admin, [...new Set(members.map((m) => m.clerk_user_id))]);
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const now         = new Date();
  const tz          = getMessagingTimezone();
  const localDay    = localDateString(now, tz);

  for (const m of members) {
    const p = profiles.get(m.clerk_user_id);
    if (isPureAmbassador(p)) { skipped++; continue; }

    const prefs = await loadCompanionPreferences(params.admin, m.clerk_user_id);
    if (!prefs.evening_enabled) { skipped++; continue; }
    // Timezone window: only send when it is 5:00 PM – 10:00 PM in the user's local timezone.
    if (!isInLocalTimeWindow(prefs.timezone, 17, 22)) { skipped++; continue; }

    const company     = companyById.get(m.company_id);
    const companyName = company?.name ?? "your workspace";
    const dedupeKey   = `smart_farmer:evening:${m.company_id}:${m.clerk_user_id}:${localDay}`;
    const state       = await loadMessagingState(params.admin, m.company_id, m.clerk_user_id);
    const pick        = await buildEveningMessage(params.admin, m.company_id, now, state?.last_evening_general_line ?? null, { weeklySummarySlot: false });

    await sendDailySmartFarmerPush({
      admin: params.admin, clerkUserId: m.clerk_user_id,
      run: "evening", category: pick.category, messageText: pick.text, dedupeKey,
    });

    if (prefs.in_app_enabled) {
      await insertFarmerInbox(params.admin, {
        companyId: m.company_id, clerkUserId: m.clerk_user_id,
        slot: "evening", category: pick.category,
        title: pick.text.split("\n")[0].slice(0, 140),
        body: pick.text,
        metadata: { run: "evening", dedupe_key: dedupeKey },
      });
    }

    if (!prefs.email_enabled) { skipped++; continue; }
    const email = p?.email?.trim() ?? "";
    if (!email || !EMAIL_RE.test(email)) { skipped++; continue; }
    if (await alreadySentDedupe(params.logAdmin, TYPE_EVENING, dedupeKey)) { skipped++; continue; }

    const name = displayName(p);
    const { subject, html } = buildCompanionEveningEmail({
      displayName: name,
      messageText: pick.text,
      messageHtml: pick.html,
      appUrl: params.appUrl,
      farmName: companyName !== "your workspace" ? companyName : undefined,
      isWeeklySummary: false,
    });

    const r = await sendResendWithEmailLog({
      admin: params.logAdmin, resendKey: params.resendKey,
      from: params.from, to: email, subject, html,
      email_type: TYPE_EVENING, company_id: m.company_id, company_name: companyName,
      metadata: { run: "evening", clerk_user_id: m.clerk_user_id, dedupe_key: dedupeKey, category: pick.category },
    });

    if (r.ok) {
      sent++;
      await sendOptionalFarmerSms(null, pick.text);
      if (pick.category === "general") {
        await saveMessagingGeneralLine(params.admin, m.company_id, m.clerk_user_id, "evening", pick.text);
      }
    } else {
      errors++;
      console.error("[engagement-email-cron] evening send failed", email);
    }
    await sleep(80);
  }
  return { sent, skipped, errors };
}

// ---------------------------------------------------------------------------
// Inactivity (tiered: 2d / 5d / 7d / 14d)
// ---------------------------------------------------------------------------

async function runInactivity(params: {
  admin: SupabaseClient;
  logAdmin: ReturnType<typeof getServiceRoleClientForEmailLogs>;
  resendKey: string;
  from: string;
  appUrl: string;
}): Promise<{ sent: number; skipped: number; errors: number }> {
  let sent = 0, skipped = 0, errors = 0;
  const companies   = await loadEligibleCompanies(params.admin);
  const members     = await loadMembersForCompanies(params.admin, companies.map((c) => c.id));
  const profiles    = await loadProfiles(params.admin, [...new Set(members.map((m) => m.clerk_user_id))]);
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const alreadyEmailed = new Set<string>();

  for (const m of members) {
    const p = profiles.get(m.clerk_user_id);
    if (isPureAmbassador(p)) { skipped++; continue; }

    const prefs = await loadCompanionPreferences(params.admin, m.clerk_user_id);
    if (!prefs.inactivity_enabled) { skipped++; continue; }

    const lastActivity = p?.updated_at ? new Date(p.updated_at) : null;
    const inactivity = await detectInactivityTier(
      params.admin, m.clerk_user_id, m.company_id, lastActivity, prefs,
    );
    if (!inactivity) { skipped++; continue; }
    if (inactivity.alreadySentThisWeek) { skipped++; continue; }

    const company     = companyById.get(m.company_id);
    const companyName = company?.name ?? "";

    const inactivityDedupeKey = `inactivity:${m.company_id}:${m.clerk_user_id}:${inactivity.tier}`;

    // In-app inbox nudge
    if (prefs.in_app_enabled) {
      await insertFarmerInbox(params.admin, {
        companyId: m.company_id, clerkUserId: m.clerk_user_id,
        slot: "morning", category: "general",
        title: inactivityTierSubject(inactivity.tier, companyName),
        body: inactivity.message,
        metadata: { run: "inactivity", tier: inactivity.tier, days_inactive: inactivity.daysInactive },
      });
    }

    // Web push nudge
    if (isWebPushConfigured()) {
      await sendWebPushToClerkUser(params.admin, m.clerk_user_id, {
        type: "insight_inactivity",
        title: "FarmVault",
        body: inactivity.message.slice(0, 120),
        url: "/home",
        tag: inactivityDedupeKey.slice(0, 64),
      });
    }

    // Email nudge (dedupe per user, not per company — one email per user per run)
    if (!prefs.email_enabled) {
      await recordInactivityTierSent(params.admin, m.clerk_user_id, m.company_id, inactivity.tier);
      skipped++;
      continue;
    }
    const email = p?.email?.trim() ?? "";
    if (!email || !EMAIL_RE.test(email)) { skipped++; continue; }
    const emailLower = email.toLowerCase();
    if (alreadyEmailed.has(emailLower)) { skipped++; continue; }

    const name = displayName(p);
    const { subject, html } = buildCompanionInactivityEmail({
      displayName: name,
      tier: inactivity.tier,
      nudgeMessage: inactivity.message,
      appUrl: params.appUrl,
      farmName: companyName || undefined,
    });

    const r = await sendResendWithEmailLog({
      admin: params.logAdmin, resendKey: params.resendKey,
      from: params.from, to: email, subject, html,
      email_type: TYPE_INACTIVITY, company_id: m.company_id, company_name: companyName,
      metadata: { run: "inactivity", clerk_user_id: m.clerk_user_id, tier: inactivity.tier, days_inactive: inactivity.daysInactive },
    });

    if (r.ok) {
      sent++;
      alreadyEmailed.add(emailLower);
      await recordInactivityTierSent(params.admin, m.clerk_user_id, m.company_id, inactivity.tier);
    } else {
      errors++;
      console.error("[engagement-email-cron] inactivity send failed", email, inactivity.tier);
    }
    await sleep(80);
  }
  return { sent, skipped, errors };
}

// ---------------------------------------------------------------------------
// Weekly Summary
// ---------------------------------------------------------------------------

async function runWeekly(params: {
  admin: SupabaseClient;
  logAdmin: ReturnType<typeof getServiceRoleClientForEmailLogs>;
  resendKey: string;
  from: string;
  appUrl: string;
}): Promise<{ sent: number; skipped: number; errors: number }> {
  let sent = 0, skipped = 0, errors = 0;
  const companies   = await loadEligibleCompanies(params.admin);
  const members     = await loadMembersForCompanies(params.admin, companies.map((c) => c.id));
  const profiles    = await loadProfiles(params.admin, [...new Set(members.map((m) => m.clerk_user_id))]);
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const now         = new Date();
  const tz          = getMessagingTimezone();
  const localDay    = localDateString(now, tz);

  for (const m of members) {
    const p = profiles.get(m.clerk_user_id);
    if (isPureAmbassador(p)) { skipped++; continue; }

    const prefs = await loadCompanionPreferences(params.admin, m.clerk_user_id);
    if (!prefs.weekly_summary_enabled) { skipped++; continue; }
    // Weekly summary is Sunday evening only. Skip if the farmer's local day is not Sunday
    // or is outside the 5 PM – 11 PM window.
    if (!isLocalSunday(prefs.timezone) || !isInLocalTimeWindow(prefs.timezone, 17, 23)) { skipped++; continue; }

    const company     = companyById.get(m.company_id);
    const companyName = company?.name ?? "your workspace";
    const dedupeKey   = `smart_farmer:weekly:${m.company_id}:${m.clerk_user_id}:${localDay}`;
    const state       = await loadMessagingState(params.admin, m.company_id, m.clerk_user_id);

    // Build the evening message (with weeklySummarySlot = true) for web push + in-app text
    const pick = await buildEveningMessage(
      params.admin, m.company_id, now, state?.last_evening_general_line ?? null,
      { weeklySummarySlot: true },
    );

    await sendDailySmartFarmerPush({
      admin: params.admin, clerkUserId: m.clerk_user_id,
      run: "weekly", category: pick.category, messageText: pick.text, dedupeKey,
    });

    if (prefs.in_app_enabled) {
      await insertFarmerInbox(params.admin, {
        companyId: m.company_id, clerkUserId: m.clerk_user_id,
        slot: "weekly", category: pick.category,
        title: "Your Weekly Farm Summary",
        body: pick.text,
        metadata: { run: "weekly", dedupe_key: dedupeKey },
      });
    }

    if (!prefs.email_enabled) { skipped++; continue; }
    const email = p?.email?.trim() ?? "";
    if (!email || !EMAIL_RE.test(email)) { skipped++; continue; }
    if (await alreadySentDedupe(params.logAdmin, TYPE_WEEKLY, dedupeKey)) { skipped++; continue; }

    // Fetch structured stats for the rich weekly email
    const analytics = await fetchWeeklyAnalytics(params.admin, m.company_id, now, tz);
    const weekStart = new Date(now);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const fmt = (d: Date) => d.toLocaleDateString("en-KE", { timeZone: tz, month: "short", day: "numeric" });

    const stats: WeeklySummaryStats = {
      operations:         analytics.operations,
      expenses:           analytics.expenses,
      harvestLabel:       analytics.harvestLabel,
      inventoryUsed:      analytics.inventoryUsed,
      weekStart:          fmt(weekStart),
      weekEnd:            fmt(now),
      revenue:            analytics.revenue,
      streakDays:         analytics.streakDays,
      activeDaysThisWeek: analytics.activeDaysThisWeek,
      topProject:         analytics.topProject,
    };

    const name = displayName(p);
    const { subject, html } = buildCompanionWeeklySummaryEmail({
      displayName: name,
      stats,
      summaryMessage: pick.text,
      summaryHtml: pick.html,
      appUrl: params.appUrl,
      farmName: companyName !== "your workspace" ? companyName : undefined,
    });

    const r = await sendResendWithEmailLog({
      admin: params.logAdmin, resendKey: params.resendKey,
      from: params.from, to: email, subject, html,
      email_type: TYPE_WEEKLY, company_id: m.company_id, company_name: companyName,
      metadata: { run: "weekly", clerk_user_id: m.clerk_user_id, dedupe_key: dedupeKey },
    });

    if (r.ok) {
      sent++;
      await sendOptionalFarmerSms(null, pick.text);
      if (pick.category === "general") {
        await saveMessagingGeneralLine(params.admin, m.company_id, m.clerk_user_id, "evening", pick.text);
      }
    } else {
      errors++;
      console.error("[engagement-email-cron] weekly send failed", email);
    }
    await sleep(80);
  }
  return { sent, skipped, errors };
}

// ---------------------------------------------------------------------------
// Trial expiring / expired (unchanged logic, kept from previous version)
// ---------------------------------------------------------------------------

function daysBetweenUtcDayStarts(from: Date, to: Date): number {
  const a = startOfUtcDay(from).getTime();
  const b = startOfUtcDay(to).getTime();
  return Math.round((b - a) / 86400000);
}

async function runTrialExpiring(params: {
  admin: SupabaseClient;
  logAdmin: ReturnType<typeof getServiceRoleClientForEmailLogs>;
  resendKey: string;
  from: string;
  appUrl: string;
}): Promise<{ sent: number; skipped: number; errors: number }> {
  let sent = 0, skipped = 0, errors = 0;
  const now = new Date();

  const { data: subs, error } = await params.admin
    .from("company_subscriptions")
    .select("company_id,trial_ends_at,is_trial,status")
    .eq("is_trial", true);
  if (error) {
    console.error("[engagement-email-cron] trial expiring query", error.message);
    return { sent, skipped, errors: 1 };
  }

  const rows = (subs ?? []) as { company_id: string; trial_ends_at: string | null }[];

  for (const row of rows) {
    const endsRaw = row.trial_ends_at;
    if (!endsRaw) { skipped++; continue; }
    const ends = new Date(String(endsRaw));
    if (Number.isNaN(ends.getTime())) { skipped++; continue; }
    if (daysBetweenUtcDayStarts(now, ends) !== 2) { skipped++; continue; }

    const companyId = String(row.company_id ?? "").trim();
    if (!companyId) { skipped++; continue; }

    const { data: comp } = await params.admin.schema("core").from("companies")
      .select("name,owner_email,onboarding_completed,created_by")
      .eq("id", companyId).maybeSingle();
    const c = comp as { name?: string | null; owner_email?: string | null; onboarding_completed?: boolean | null; created_by?: string | null } | null;
    if (!c?.onboarding_completed) { skipped++; continue; }

    let to = String(c.owner_email ?? "").trim().toLowerCase();
    if (!to || !EMAIL_RE.test(to)) {
      const cb = String(c.created_by ?? "").trim();
      if (cb) {
        const { data: prof } = await params.admin.schema("core").from("profiles")
          .select("email").eq("clerk_user_id", cb).maybeSingle();
        to = String((prof as { email?: string } | null)?.email ?? "").trim().toLowerCase();
      }
    }
    if (!to || !EMAIL_RE.test(to)) { skipped++; continue; }

    const companyName = String(c.name ?? "your workspace").trim() || "your workspace";
    const dedupeKey   = `trial_expiring:${companyId}:${ends.toISOString().slice(0, 10)}`;
    if (await alreadySentDedupe(params.logAdmin, TYPE_TRIAL_EXPIRING, dedupeKey)) { skipped++; continue; }

    const rendered = buildTrialEndingEmail({ companyName, daysLeft: 2, upgradeUrl: `${params.appUrl}/billing` });
    const r = await sendResendWithEmailLog({
      admin: params.logAdmin, resendKey: params.resendKey,
      from: params.from, to, subject: rendered.subject, html: rendered.html,
      email_type: TYPE_TRIAL_EXPIRING, company_id: companyId, company_name: companyName,
      metadata: { run: "trial_expiring", dedupe_key: dedupeKey },
    });
    if (r.ok) {
      sent++;
      const ownerClerk = String(c.created_by ?? "").trim();
      if (ownerClerk.startsWith("user_")) {
        await sendWebPushToClerkUser(params.admin, ownerClerk, {
          type: "premium_trial", title: "FarmVault",
          body: "Your trial ends in 2 days. Upgrade to keep full access.",
          url: "/billing", tag: dedupeKey.slice(0, 64),
        });
      }
    } else { errors++; }
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
  let sent = 0, skipped = 0, errors = 0;
  const now = new Date();

  const { data: subs, error } = await params.admin
    .from("company_subscriptions")
    .select("company_id,trial_ends_at,is_trial,status")
    .eq("is_trial", true);
  if (error) {
    console.error("[engagement-email-cron] trial expired query", error.message);
    return { sent, skipped, errors: 1 };
  }

  const rows = (subs ?? []) as { company_id: string; trial_ends_at: string | null }[];

  for (const row of rows) {
    const endsRaw = row.trial_ends_at;
    if (!endsRaw) { skipped++; continue; }
    const ends = new Date(String(endsRaw));
    if (Number.isNaN(ends.getTime()) || ends.getTime() >= now.getTime()) { skipped++; continue; }

    const companyId = String(row.company_id ?? "").trim();
    if (!companyId) { skipped++; continue; }

    const { data: comp } = await params.admin.schema("core").from("companies")
      .select("name,owner_email,onboarding_completed,created_by")
      .eq("id", companyId).maybeSingle();
    const c = comp as { name?: string | null; owner_email?: string | null; onboarding_completed?: boolean | null; created_by?: string | null } | null;
    if (!c?.onboarding_completed) { skipped++; continue; }

    let to = String(c.owner_email ?? "").trim().toLowerCase();
    if (!to || !EMAIL_RE.test(to)) {
      const cb = String(c.created_by ?? "").trim();
      if (cb) {
        const { data: prof } = await params.admin.schema("core").from("profiles")
          .select("email").eq("clerk_user_id", cb).maybeSingle();
        to = String((prof as { email?: string } | null)?.email ?? "").trim().toLowerCase();
      }
    }
    if (!to || !EMAIL_RE.test(to)) { skipped++; continue; }

    const companyName = String(c.name ?? "your workspace").trim() || "your workspace";
    const dedupeKey   = `trial_expired:${companyId}:${ends.toISOString().slice(0, 10)}`;
    if (await alreadySentDedupe(params.logAdmin, TYPE_TRIAL_EXPIRED, dedupeKey)) { skipped++; continue; }

    const rendered = buildTrialExpiredEmail({ companyName, billingUrl: `${params.appUrl}/billing` });
    const r = await sendResendWithEmailLog({
      admin: params.logAdmin, resendKey: params.resendKey,
      from: params.from, to, subject: rendered.subject, html: rendered.html,
      email_type: TYPE_TRIAL_EXPIRED, company_id: companyId, company_name: companyName,
      metadata: { run: "trial_expired", dedupe_key: dedupeKey },
    });
    if (r.ok) {
      sent++;
      const ownerClerk = String(c.created_by ?? "").trim();
      if (ownerClerk.startsWith("user_")) {
        await sendWebPushToClerkUser(params.admin, ownerClerk, {
          type: "premium_trial", title: "FarmVault",
          body: "Your trial has ended. Subscribe to continue with full access.",
          url: "/billing", tag: dedupeKey.slice(0, 64),
        });
      }
    } else { errors++; }
    await sleep(80);
  }
  return { sent, skipped, errors };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serveFarmVaultEdge("engagement-email-cron", async (req: Request, _ctx) => {
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
  try { raw = await req.json(); } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const body = raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>) : null;
  const run = typeof body?.run === "string" ? body.run.trim() : "";

  if (!["morning", "evening", "inactivity", "weekly", "trial_expiring", "trial_expired", "system_push"].includes(run)) {
    return jsonResponse({ error: "Invalid payload", detail: 'Body must include run: "morning" | "evening" | "inactivity" | "weekly" | "trial_expiring" | "trial_expired" | "system_push"' }, 400);
  }

  const supabaseUrl  = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "Server misconfiguration", detail: "Missing SUPABASE_URL or service role" }, 500);
  }

  const admin = createServiceRoleSupabaseClient(supabaseUrl, serviceKey);

  if (run === "system_push") {
    if (!body) return jsonResponse({ error: "Invalid payload" }, 400);
    const title    = typeof body.title === "string" ? body.title.trim() : "";
    const pushBody = typeof body.body  === "string" ? body.body.trim()  : "";
    const pushUrl  = typeof body.url   === "string" && body.url.startsWith("/") ? body.url : "/home";
    const idsRaw   = body.clerk_user_ids;
    if (!title || !pushBody || !Array.isArray(idsRaw) || idsRaw.length === 0) {
      return jsonResponse({ error: "system_push requires title, body, and non-empty clerk_user_ids[]" }, 400);
    }
    let delivered = 0;
    for (const id of idsRaw) {
      if (typeof id !== "string" || !id.trim()) continue;
      const r = await sendWebPushToClerkUser(admin, id.trim(), { type: "system_alert", title, body: pushBody, url: pushUrl });
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
  const logAdmin       = getServiceRoleClientForEmailLogs();
  const companionFrom  = getFarmVaultEmailFrom("companion"); // greetings@ — warm companion identity
  const alertsFrom     = getFarmVaultEmailFrom("alerts");    // alerts@    — trial / system alerts
  const appUrl         = (Deno.env.get("FARMVAULT_PUBLIC_APP_URL") ?? "https://farmvault.africa").replace(/\/$/, "");
  const companionBase  = { admin, logAdmin, resendKey, from: companionFrom, appUrl };
  const alertsBase     = { admin, logAdmin, resendKey, from: alertsFrom,    appUrl };

  try {
    const summary =
      run === "morning"          ? await runMorning(companionBase)
      : run === "evening"        ? await runEvening(companionBase)
      : run === "inactivity"     ? await runInactivity(companionBase)
      : run === "weekly"         ? await runWeekly(companionBase)
      : run === "trial_expiring" ? await runTrialExpiring(alertsBase)
      : await runTrialExpired(alertsBase);

    console.log("[engagement-email-cron] completed", run, summary);
    return jsonResponse({ ok: true, run, ...summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[engagement-email-cron] fatal", run, msg);
    return jsonResponse({ error: "Internal error", detail: msg }, 500);
  }
});

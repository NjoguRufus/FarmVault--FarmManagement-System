import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EVENING_GENERAL_POOL,
  MORNING_GENERAL_POOL,
  pickRotatingLine,
} from "./smartDailyMessagingPools.ts";

export type SmartMessageCategory =
  | "inventory"
  | "expenses"
  | "harvest"
  | "cropStage"
  | "summary"
  | "general";

export type SmartMessagePick = {
  text: string;
  category: SmartMessageCategory;
  html: string;
};

const DEFAULT_TZ = "Africa/Nairobi";

export function getMessagingTimezone(): string {
  return (Deno.env.get("FARMVAULT_MESSAGING_TZ") ?? DEFAULT_TZ).trim() || DEFAULT_TZ;
}

export function ymdInTimeZone(d: Date, timeZone: string): { y: number; m: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const m = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "1");
  return { y, m, day };
}

export function dayOfYearInTimeZone(d: Date, timeZone: string): number {
  const { y, m, day } = ymdInTimeZone(d, timeZone);
  const start = Date.UTC(y, 0, 1);
  const cur = Date.UTC(y, m - 1, day);
  return Math.floor((cur - start) / 86400000) + 1;
}

export function localDateString(d: Date, timeZone: string): string {
  const { y, m, day } = ymdInTimeZone(d, timeZone);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Inclusive local calendar bounds for `dateStr` (YYYY-MM-DD) in `timeZone`, as UTC ISO instants. */
export function localYmdBoundsUtc(dateStr: string, timeZone: string): { startIso: string; endIso: string } {
  const [y, m, day] = dateStr.split("-").map((x) => Number(x));
  if (!y || !m || !day) {
    const d = new Date();
    return { startIso: d.toISOString(), endIso: d.toISOString() };
  }
  if (timeZone === "Africa/Nairobi") {
    const offsetMs = 3 * 60 * 60 * 1000;
    const startMs = Date.UTC(y, m - 1, day, 0, 0, 0, 0) - offsetMs;
    const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
    return { startIso: new Date(startMs).toISOString(), endIso: new Date(endMs).toISOString() };
  }
  const startMs = Date.UTC(y, m - 1, day, 0, 0, 0, 0);
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return { startIso: new Date(startMs).toISOString(), endIso: new Date(endMs).toISOString() };
}

function localDayBoundsUtc(d: Date, timeZone: string): { startIso: string; endIso: string; dateStr: string } {
  const dateStr = localDateString(d, timeZone);
  const { startIso, endIso } = localYmdBoundsUtc(dateStr, timeZone);
  return { startIso, endIso, dateStr };
}

function addCalendarDaysYmd(y: number, m: number, day: number, delta: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m - 1, day + delta));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function weekBoundsEndingLocalDate(d: Date, timeZone: string): { startStr: string; endStr: string } {
  const { y, m, day } = ymdInTimeZone(d, timeZone);
  const endStr = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const start = addCalendarDaysYmd(y, m, day, -6);
  const startStr = `${start.y}-${String(start.m).padStart(2, "0")}-${String(start.d).padStart(2, "0")}`;
  return { startStr, endStr };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtKes(n: number): string {
  return new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(Math.round(n));
}

function rowQty(row: Record<string, unknown>): number {
  const q = row.current_quantity ?? row.quantity ?? 0;
  return Number(q) || 0;
}

function rowThreshold(row: Record<string, unknown>): number {
  const t = row.min_threshold;
  if (t != null && String(t).trim() !== "") return Number(t) || 0;
  return 10;
}

export async function fetchInventoryRows(
  admin: SupabaseClient,
  companyId: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await admin
    .schema("public")
    .from("inventory_items")
    .select("name, unit, min_threshold, current_quantity, quantity")
    .eq("company_id", companyId);
  if (error) {
    console.warn("[smartDailyMessaging] inventory_items", error.message);
    return [];
  }
  return (data ?? []) as Record<string, unknown>[];
}

export async function fetchInventoryDeductionsToday(
  admin: SupabaseClient,
  companyId: string,
  startIso: string,
  endIso: string,
): Promise<{ itemName: string; amount: number; unit: string } | null> {
  const { data, error } = await admin
    .schema("public")
    .from("inventory_audit_logs")
    .select("inventory_item_id, quantity, metadata, created_at")
    .eq("company_id", companyId)
    .eq("action", "DEDUCT")
    .gte("created_at", startIso)
    .lte("created_at", endIso);
  if (error) {
    console.warn("[smartDailyMessaging] inventory_audit_logs", error.message);
    return null;
  }
  const rows = (data ?? []) as {
    inventory_item_id: string | null;
    quantity: number | string | null;
  }[];
  if (rows.length === 0) return null;
  const totals = new Map<string, number>();
  for (const r of rows) {
    const id = r.inventory_item_id ?? "";
    const q = Math.abs(Number(r.quantity ?? 0));
    totals.set(id, (totals.get(id) ?? 0) + q);
  }
  let topId = "";
  let topAmt = 0;
  for (const [id, amt] of totals) {
    if (amt > topAmt) {
      topAmt = amt;
      topId = id;
    }
  }
  if (!topId || topAmt <= 0) return null;
  const { data: item } = await admin
    .schema("public")
    .from("inventory_items")
    .select("name, unit")
    .eq("id", topId)
    .maybeSingle();
  const it = item as { name?: string; unit?: string } | null;
  return {
    itemName: String(it?.name ?? "item").trim() || "item",
    amount: topAmt,
    unit: String(it?.unit ?? "units").trim() || "units",
  };
}

export async function fetchExpenseTotals(
  admin: SupabaseClient,
  companyId: string,
  localDay: string,
  weekStart: string,
  weekEnd: string,
): Promise<{ dayTotal: number; dayCount: number; weekTotal: number }> {
  let dayTotal = 0;
  let dayCount = 0;
  const d1 = await admin
    .schema("finance")
    .from("expenses")
    .select("amount")
    .eq("company_id", companyId)
    .eq("expense_date", localDay);
  if (!d1.error && d1.data) {
    for (const r of d1.data as { amount: number | string }[]) {
      dayTotal += Number(r.amount ?? 0);
      dayCount++;
    }
  }
  let weekTotal = 0;
  const w = await admin
    .schema("finance")
    .from("expenses")
    .select("amount")
    .eq("company_id", companyId)
    .gte("expense_date", weekStart)
    .lte("expense_date", weekEnd);
  if (!w.error && w.data) {
    for (const r of w.data as { amount: number | string }[]) {
      weekTotal += Number(r.amount ?? 0);
    }
  }
  return { dayTotal, dayCount, weekTotal };
}

export async function fetchHarvestToday(
  admin: SupabaseClient,
  companyId: string,
  localDay: string,
): Promise<{ quantity: number; unit: string } | null> {
  const { data, error } = await admin
    .schema("harvest")
    .from("harvests")
    .select("quantity, unit")
    .eq("company_id", companyId)
    .eq("harvest_date", localDay);
  if (error) {
    console.warn("[smartDailyMessaging] harvests today", error.message);
    return null;
  }
  const rows = (data ?? []) as { quantity: number | string; unit: string }[];
  if (rows.length === 0) return null;
  const byUnit = new Map<string, number>();
  for (const r of rows) {
    const u = String(r.unit ?? "kg").trim() || "kg";
    byUnit.set(u, (byUnit.get(u) ?? 0) + Number(r.quantity ?? 0));
  }
  let bestU = "";
  let bestQ = 0;
  for (const [u, q] of byUnit) {
    if (q > bestQ) {
      bestQ = q;
      bestU = u;
    }
  }
  return { quantity: bestQ, unit: bestU || "kg" };
}

export async function fetchHarvestWeekTotals(
  admin: SupabaseClient,
  companyId: string,
  start: string,
  end: string,
): Promise<string> {
  const { data, error } = await admin
    .schema("harvest")
    .from("harvests")
    .select("quantity, unit")
    .eq("company_id", companyId)
    .gte("harvest_date", start)
    .lte("harvest_date", end);
  if (error || !data) return "0 kg";
  const byUnit = new Map<string, number>();
  for (const r of data as { quantity: number | string; unit: string }[]) {
    const u = String(r.unit ?? "kg").trim() || "kg";
    byUnit.set(u, (byUnit.get(u) ?? 0) + Number(r.quantity ?? 0));
  }
  if (byUnit.size === 0) return "0 kg";
  if (byUnit.size === 1) {
    const [u, q] = [...byUnit.entries()][0];
    return `${fmtQuantity(q)} ${u}`;
  }
  const parts = [...byUnit.entries()].map(([u, q]) => `${fmtQuantity(q)} ${u}`);
  return parts.join(", ");
}

function fmtQuantity(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, "");
}

export async function fetchWorkLogsCount(
  admin: SupabaseClient,
  companyId: string,
  start: string,
  end: string,
): Promise<number> {
  const { count, error } = await admin
    .schema("public")
    .from("work_logs")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .gte("date", start)
    .lte("date", end);
  if (error) return 0;
  return typeof count === "number" ? count : 0;
}

export async function fetchInventoryDeductCountWeek(
  admin: SupabaseClient,
  companyId: string,
  startIso: string,
  endIso: string,
): Promise<number> {
  const { count, error } = await admin
    .schema("public")
    .from("inventory_audit_logs")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("action", "DEDUCT")
    .gte("created_at", startIso)
    .lte("created_at", endIso);
  if (error) return 0;
  return typeof count === "number" ? count : 0;
}

export async function fetchWeeklyAnalytics(
  admin: SupabaseClient,
  companyId: string,
  d: Date,
  timeZone: string,
): Promise<{ operations: number; expenses: number; harvestLabel: string; inventoryUsed: number }> {
  const { startStr, endStr } = weekBoundsEndingLocalDate(d, timeZone);
  const { startIso } = localYmdBoundsUtc(startStr, timeZone);
  const { endIso } = localYmdBoundsUtc(endStr, timeZone);
  const operations = await fetchWorkLogsCount(admin, companyId, startStr, endStr);
  const exp = await fetchExpenseTotals(admin, companyId, localDateString(d, timeZone), startStr, endStr);
  const harvestLabel = await fetchHarvestWeekTotals(admin, companyId, startStr, endStr);
  const inventoryUsed = await fetchInventoryDeductCountWeek(admin, companyId, startIso, endIso);
  let opCount = operations;
  if (opCount === 0) {
    const { count: h } = await admin
      .schema("harvest")
      .from("harvests")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("harvest_date", startStr)
      .lte("harvest_date", endStr);
    const { count: e } = await admin
      .schema("finance")
      .from("expenses")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("expense_date", startStr)
      .lte("expense_date", endStr);
    opCount = (typeof h === "number" ? h : 0) + (typeof e === "number" ? e : 0) + inventoryUsed;
  }
  return {
    operations: opCount,
    expenses: exp.weekTotal,
    harvestLabel,
    inventoryUsed,
  };
}

type CropStageKind = "planting" | "growing" | "harvest" | "spraying" | null;

function inferStageFromKey(key: string, name: string): CropStageKind {
  const s = `${key} ${name}`.toLowerCase();
  if (/spray|chemical|pest|fung|herb/.test(s)) return "spraying";
  if (/harvest|matur|ripe|pick|collect/.test(s)) return "harvest";
  if (/plant|nursery|seed|transplant|sow/.test(s)) return "planting";
  if (/grow|veg|flower|fruit|till|weed|water/.test(s)) return "growing";
  return "growing";
}

export async function fetchDominantCropStage(
  admin: SupabaseClient,
  companyId: string,
): Promise<CropStageKind> {
  const { data, error } = await admin
    .schema("projects")
    .from("project_stages")
    .select("stage_key, stage_name, is_current")
    .eq("company_id", companyId)
    .eq("is_current", true)
    .limit(5);
  if (error || !data?.length) return null;
  const rows = data as { stage_key: string; stage_name: string }[];
  return inferStageFromKey(rows[0].stage_key ?? "", rows[0].stage_name ?? "");
}

function cropStageMessage(kind: CropStageKind, morning: boolean): string | null {
  if (!kind) return null;
  const prefix = morning ? "Good morning" : "Good evening";
  const m: Record<Exclude<CropStageKind, null>, string> = {
    planting: `${prefix} 🌱 Planting in progress. Track seeds and inputs.`,
    growing: `${prefix} 🌿 Monitor crop progress and farm activities.`,
    harvest: `${prefix} 🌾 Harvest time. Record yields as you collect.`,
    spraying: `${prefix} 🧪 Spraying planned? Track chemicals and costs.`,
  };
  return m[kind];
}

function harvestSeasonHintMorning(adminHasHarvestWeek: boolean): string | null {
  if (!adminHasHarvestWeek) return null;
  return "Good morning 🌽 Harvest season is active. Track your yields.";
}

export async function buildMorningMessage(
  admin: SupabaseClient,
  companyId: string,
  now: Date,
  lastGeneral: string | null,
): Promise<SmartMessagePick> {
  const tz = getMessagingTimezone();
  const doy = dayOfYearInTimeZone(now, tz);
  const localDay = localDateString(now, tz);
  const { startIso, endIso } = localDayBoundsUtc(now, tz);
  const week = weekBoundsEndingLocalDate(now, tz);

  const invRows = await fetchInventoryRows(admin, companyId);
  const zero = invRows.find((r) => rowQty(r) <= 0);
  if (zero) {
    const name = String(zero.name ?? "item").trim() || "item";
    const text = `Good morning 📦 No ${name} recorded in inventory. Update before starting.`;
    return { text, category: "inventory", html: `<p>${escapeHtml(text)}</p>` };
  }
  const low = invRows.find((r) => {
    const q = rowQty(r);
    return q > 0 && q <= rowThreshold(r);
  });
  if (low) {
    const name = String(low.name ?? "item").trim() || "item";
    const q = rowQty(low);
    const unit = String(low.unit ?? "").trim();
    const qtyLabel = unit ? `${fmtQuantity(q)} ${unit}` : `${fmtQuantity(q)}`;
    const text = `Good morning 📦 You only have ${qtyLabel} ${name} remaining. Consider restocking.`;
    return { text, category: "inventory", html: `<p>${escapeHtml(text)}</p>` };
  }

  const exp = await fetchExpenseTotals(admin, companyId, localDay, week.startStr, week.endStr);
  if (exp.weekTotal > 0) {
    const text = `Good morning 💰 Your weekly expenses are KES ${fmtKes(exp.weekTotal)}.`;
    return { text, category: "expenses", html: `<p>${escapeHtml(text)}</p>` };
  }

  const { count: hw } = await admin
    .schema("harvest")
    .from("harvests")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .gte("harvest_date", week.startStr)
    .lte("harvest_date", week.endStr);
  const harvestWeek = typeof hw === "number" ? hw : 0;
  const hint = harvestSeasonHintMorning(harvestWeek > 0);
  if (hint) {
    return { text: hint, category: "harvest", html: `<p>${escapeHtml(hint)}</p>` };
  }

  const stage = await fetchDominantCropStage(admin, companyId);
  const stageLine = cropStageMessage(stage, true);
  if (stageLine) {
    return { text: stageLine, category: "cropStage", html: `<p>${escapeHtml(stageLine)}</p>` };
  }

  const line = pickRotatingLine(MORNING_GENERAL_POOL, doy, lastGeneral);
  return {
    text: line,
    category: "general",
    html: `<p>${escapeHtml(line)}</p>`,
  };
}

export async function buildEveningMessage(
  admin: SupabaseClient,
  companyId: string,
  now: Date,
  lastGeneral: string | null,
  opts: { weeklySummarySlot: boolean },
): Promise<SmartMessagePick> {
  const tz = getMessagingTimezone();
  const doy = dayOfYearInTimeZone(now, tz);
  const localDay = localDateString(now, tz);
  const { startIso, endIso } = localDayBoundsUtc(now, tz);
  const week = weekBoundsEndingLocalDate(now, tz);

  const usage = await fetchInventoryDeductionsToday(admin, companyId, startIso, endIso);
  if (usage) {
    const amt = fmtQuantity(usage.amount);
    const text =
      `Good evening 📦 You used ${amt} ${usage.unit} of ${usage.itemName} today. Inventory updated.`;
    return { text, category: "inventory", html: `<p>${escapeHtml(text)}</p>` };
  }

  const exp = await fetchExpenseTotals(admin, companyId, localDay, week.startStr, week.endStr);
  if (exp.dayTotal > 0) {
    const text = `Good evening 💰 Today's farm expenses total KES ${fmtKes(exp.dayTotal)}.`;
    return { text, category: "expenses", html: `<p>${escapeHtml(text)}</p>` };
  }
  if (exp.dayCount > 0) {
    const text = `Good evening 💰 You recorded ${exp.dayCount} expenses today.`;
    return { text, category: "expenses", html: `<p>${escapeHtml(text)}</p>` };
  }

  const hv = await fetchHarvestToday(admin, companyId, localDay);
  if (hv && hv.quantity > 0) {
    const text =
      `Good evening 🌾 You harvested ${fmtQuantity(hv.quantity)} ${hv.unit} today.`;
    return { text, category: "harvest", html: `<p>${escapeHtml(text)}</p>` };
  }

  const { startStr, endStr } = week;
  const weekHarvest = await fetchHarvestWeekTotals(admin, companyId, startStr, endStr);
  const weekHarvestNonZero = (() => {
    const t = weekHarvest.trim();
    if (!t || /^0(\.0+)?(\s+\w+)?$/i.test(t)) return false;
    for (const chunk of t.split(",")) {
      const m = chunk.trim().match(/^([\d.]+)/);
      if (m && Number(m[1]) !== 0) return true;
    }
    return false;
  })();
  if (weekHarvestNonZero) {
    const text = `Good evening 🚜 Total harvest this week: ${weekHarvest}.`;
    return { text, category: "harvest", html: `<p>${escapeHtml(text)}</p>` };
  }

  if (opts.weeklySummarySlot) {
    const a = await fetchWeeklyAnalytics(admin, companyId, now, tz);
    const text =
      `Good evening 📊 Here's your weekly farm summary:\n• ${fmtQuantity(a.operations)} activities recorded\n• KES ${fmtKes(a.expenses)} in expenses\n• ${a.harvestLabel} harvested\n• ${a.inventoryUsed} inventory items used\nKeep up the great work managing your farm.`;
    const html =
      `<p>Good evening 📊 Here's your weekly farm summary:</p><ul>` +
      `<li><strong>${escapeHtml(String(fmtQuantity(a.operations)))}</strong> activities recorded</li>` +
      `<li><strong>KES ${escapeHtml(fmtKes(a.expenses))}</strong> in expenses</li>` +
      `<li><strong>${escapeHtml(a.harvestLabel)}</strong> harvested</li>` +
      `<li><strong>${escapeHtml(String(a.inventoryUsed))}</strong> inventory items used</li>` +
      `</ul><p>Keep up the great work managing your farm.</p>`;
    return { text, category: "summary", html };
  }

  const stage = await fetchDominantCropStage(admin, companyId);
  const stageLine = cropStageMessage(stage, false);
  if (stageLine) {
    return { text: stageLine, category: "cropStage", html: `<p>${escapeHtml(stageLine)}</p>` };
  }

  const line = pickRotatingLine(EVENING_GENERAL_POOL, doy, lastGeneral);
  return { text: line, category: "general", html: `<p>${escapeHtml(line)}</p>` };
}

export async function loadMessagingState(
  admin: SupabaseClient,
  companyId: string,
  clerkUserId: string,
): Promise<{ last_morning_general_line: string | null; last_evening_general_line: string | null } | null> {
  const { data, error } = await admin
    .schema("public")
    .from("farmer_smart_messaging_state")
    .select("last_morning_general_line, last_evening_general_line")
    .eq("company_id", companyId)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) {
    console.warn("[smartDailyMessaging] load state", error.message);
    return null;
  }
  return data as {
    last_morning_general_line: string | null;
    last_evening_general_line: string | null;
  } | null;
}

export async function saveMessagingGeneralLine(
  admin: SupabaseClient,
  companyId: string,
  clerkUserId: string,
  slot: "morning" | "evening",
  line: string,
): Promise<void> {
  const prev = await loadMessagingState(admin, companyId, clerkUserId);
  const row = {
    company_id: companyId,
    clerk_user_id: clerkUserId,
    last_morning_general_line: slot === "morning"
      ? line
      : (prev?.last_morning_general_line ?? null),
    last_evening_general_line: slot === "evening"
      ? line
      : (prev?.last_evening_general_line ?? null),
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.schema("public").from("farmer_smart_messaging_state").upsert(row, {
    onConflict: "company_id,clerk_user_id",
  });
  if (error) console.warn("[smartDailyMessaging] save state", error.message);
}

export async function insertFarmerInbox(
  admin: SupabaseClient,
  params: {
    companyId: string;
    clerkUserId: string;
    slot: "morning" | "evening" | "weekly";
    category: SmartMessageCategory;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await admin.schema("public").from("farmer_smart_inbox").insert({
    company_id: params.companyId,
    clerk_user_id: params.clerkUserId,
    slot: params.slot,
    category: params.category,
    title: params.title,
    body: params.body,
    metadata: params.metadata ?? {},
  });
  if (error) console.warn("[smartDailyMessaging] inbox insert", error.message);
}

/** Optional SMS hook: POST JSON to FARMVAULT_SMS_WEBHOOK_URL if set. */
export async function sendOptionalFarmerSms(phone: string | null | undefined, body: string): Promise<void> {
  const url = Deno.env.get("FARMVAULT_SMS_WEBHOOK_URL")?.trim();
  if (!url || !phone?.trim()) return;
  const secret = Deno.env.get("FARMVAULT_SMS_WEBHOOK_SECRET")?.trim();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (secret) headers["Authorization"] = `Bearer ${secret}`;
    await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ to: phone.trim(), body }),
    });
  } catch (e) {
    console.warn("[smartDailyMessaging] SMS webhook failed", e);
  }
}

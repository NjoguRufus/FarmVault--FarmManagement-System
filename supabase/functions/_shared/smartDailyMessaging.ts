import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EVENING_GENERAL_POOL,
  MORNING_GENERAL_POOL,
  inactivityPoolForTier,
  inactivityTierFromDays,
  pickRotatingLine,
  type InactivityTier,
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

/** Service-role reads bypass RLS; scope harvests to projects that are not soft-deleted. */
async function activeProjectIdsForCompany(
  admin: SupabaseClient,
  companyId: string,
): Promise<string[]> {
  const { data, error } = await admin
    .schema("projects")
    .from("projects")
    .select("id")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  if (error || !data?.length) return [];
  return (data as { id: string }[]).map((r) => String(r.id));
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
    .lte("expense_date", weekEnd)
    .is("deleted_at", null);
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
  const projectIds = await activeProjectIdsForCompany(admin, companyId);
  if (projectIds.length === 0) return null;
  const { data, error } = await admin
    .schema("harvest")
    .from("harvests")
    .select("quantity, unit")
    .eq("company_id", companyId)
    .eq("harvest_date", localDay)
    .in("project_id", projectIds);
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
  const projectIds = await activeProjectIdsForCompany(admin, companyId);
  if (projectIds.length === 0) return "0 kg";
  const { data, error } = await admin
    .schema("harvest")
    .from("harvests")
    .select("quantity, unit")
    .eq("company_id", companyId)
    .gte("harvest_date", start)
    .lte("harvest_date", end)
    .in("project_id", projectIds);
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

/** Fetch total sales/revenue for the week from harvest_sales or sales records. */
async function fetchWeeklyRevenue(
  admin: SupabaseClient,
  companyId: string,
  startStr: string,
  endStr: string,
): Promise<number> {
  // Try finance.sales first, then harvest.harvest_sales, gracefully return 0 if neither exists.
  const tables: Array<{ schema: string; table: string; amountCol: string; dateCol: string }> = [
    { schema: "finance", table: "sales",           amountCol: "amount",       dateCol: "sale_date" },
    { schema: "harvest", table: "harvest_sales",   amountCol: "total_amount", dateCol: "sale_date" },
    { schema: "finance", table: "harvest_income",  amountCol: "amount",       dateCol: "income_date" },
    { schema: "public",  table: "sales",           amountCol: "amount",       dateCol: "sale_date" },
  ];
  for (const t of tables) {
    try {
      const { data, error } = await (admin as SupabaseClient)
        .schema(t.schema)
        .from(t.table)
        .select(t.amountCol)
        .eq("company_id", companyId)
        .gte(t.dateCol, startStr)
        .lte(t.dateCol, endStr);
      if (error || !data) continue;
      const total = (data as Record<string, unknown>[]).reduce(
        (sum, r) => sum + Number(r[t.amountCol] ?? 0),
        0,
      );
      if (total > 0) return total;
    } catch {
      // table doesn't exist in this project — try next
    }
  }
  return 0;
}

/**
 * Count how many distinct calendar days in the last `lookbackDays` had at least one work log.
 * Returns a streak (consecutive days ending today) and total active days in the window.
 */
async function fetchActivityStreak(
  admin: SupabaseClient,
  companyId: string,
  todayStr: string,
  timeZone: string,
): Promise<{ streakDays: number; activeDaysThisWeek: number }> {
  // Build array of last 28 date strings (YYYY-MM-DD) ending today.
  const days: string[] = [];
  const { y: ty, m: tm, day: td } = ymdInTimeZone(new Date(), timeZone);
  for (let i = 0; i < 28; i++) {
    const dt = new Date(Date.UTC(ty, tm - 1, td - i));
    const ds = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    days.push(ds);
  }
  if (days.length === 0) return { streakDays: 0, activeDaysThisWeek: 0 };

  const oldest = days[days.length - 1];
  const { data, error } = await admin
    .schema("public")
    .from("work_logs")
    .select("date")
    .eq("company_id", companyId)
    .gte("date", oldest)
    .lte("date", todayStr);
  if (error || !data) return { streakDays: 0, activeDaysThisWeek: 0 };

  const activeDays = new Set((data as { date: string }[]).map((r) => String(r.date ?? "").slice(0, 10)));

  // Streak: count consecutive days from today backwards that have activity.
  let streakDays = 0;
  for (const d of days) {
    if (activeDays.has(d)) streakDays++;
    else break;
  }

  // Active days this past week (last 7 days).
  const weekDays = days.slice(0, 7);
  const activeDaysThisWeek = weekDays.filter((d) => activeDays.has(d)).length;

  return { streakDays, activeDaysThisWeek };
}

/** Fetch the name of the most active project this week (by work log count). */
async function fetchTopProjectThisWeek(
  admin: SupabaseClient,
  companyId: string,
  startStr: string,
  endStr: string,
): Promise<string | null> {
  const { data, error } = await admin
    .schema("public")
    .from("work_logs")
    .select("project_id")
    .eq("company_id", companyId)
    .gte("date", startStr)
    .lte("date", endStr)
    .not("project_id", "is", null);
  if (error || !data?.length) return null;

  const counts = new Map<string, number>();
  for (const r of data as { project_id: string }[]) {
    const pid = String(r.project_id ?? "").trim();
    if (pid) counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  let topId = "";
  let topCount = 0;
  for (const [id, n] of counts) {
    if (n > topCount) { topCount = n; topId = id; }
  }
  if (!topId) return null;

  const { data: proj } = await admin
    .schema("projects")
    .from("projects")
    .select("name")
    .eq("id", topId)
    .maybeSingle();
  const name = String((proj as { name?: string } | null)?.name ?? "").trim();
  return name || null;
}

export type WeeklyAnalyticsResult = {
  operations: number;
  expenses: number;
  harvestLabel: string;
  inventoryUsed: number;
  revenue: number;
  streakDays: number;
  activeDaysThisWeek: number;
  topProject: string | null;
};

export async function fetchWeeklyAnalytics(
  admin: SupabaseClient,
  companyId: string,
  d: Date,
  timeZone: string,
): Promise<WeeklyAnalyticsResult> {
  const { startStr, endStr } = weekBoundsEndingLocalDate(d, timeZone);
  const { startIso } = localYmdBoundsUtc(startStr, timeZone);
  const { endIso } = localYmdBoundsUtc(endStr, timeZone);
  const todayStr = localDateString(d, timeZone);

  const operations = await fetchWorkLogsCount(admin, companyId, startStr, endStr);
  const exp = await fetchExpenseTotals(admin, companyId, todayStr, startStr, endStr);
  const harvestLabel = await fetchHarvestWeekTotals(admin, companyId, startStr, endStr);
  const inventoryUsed = await fetchInventoryDeductCountWeek(admin, companyId, startIso, endIso);

  let opCount = operations;
  if (opCount === 0) {
    const projectIds = await activeProjectIdsForCompany(admin, companyId);
    let hCount = 0;
    if (projectIds.length > 0) {
      const { count: h } = await admin
        .schema("harvest")
        .from("harvests")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId)
        .gte("harvest_date", startStr)
        .lte("harvest_date", endStr)
        .in("project_id", projectIds);
      hCount = typeof h === "number" ? h : 0;
    }
    const { count: e } = await admin
      .schema("finance")
      .from("expenses")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("expense_date", startStr)
      .lte("expense_date", endStr)
      .is("deleted_at", null);
    opCount = hCount + (typeof e === "number" ? e : 0) + inventoryUsed;
  }

  const [revenue, streak, topProject] = await Promise.all([
    fetchWeeklyRevenue(admin, companyId, startStr, endStr),
    fetchActivityStreak(admin, companyId, todayStr, timeZone),
    fetchTopProjectThisWeek(admin, companyId, startStr, endStr),
  ]);

  return {
    operations: opCount,
    expenses: exp.weekTotal,
    harvestLabel,
    inventoryUsed,
    revenue,
    streakDays: streak.streakDays,
    activeDaysThisWeek: streak.activeDaysThisWeek,
    topProject,
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

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

export type CompanionPreferences = {
  morning_enabled: boolean;
  evening_enabled: boolean;
  inactivity_enabled: boolean;
  weekly_summary_enabled: boolean;
  email_enabled: boolean;
  in_app_enabled: boolean;
  /** IANA timezone for per-user send-window filtering. Default: Africa/Nairobi. */
  timezone: string;
};

const DEFAULT_PREFS: CompanionPreferences = {
  morning_enabled: true,
  evening_enabled: true,
  inactivity_enabled: true,
  weekly_summary_enabled: true,
  email_enabled: true,
  in_app_enabled: true,
  timezone: "Africa/Nairobi",
};

export async function loadCompanionPreferences(
  admin: SupabaseClient,
  clerkUserId: string,
): Promise<CompanionPreferences> {
  const { data, error } = await admin
    .schema("public")
    .from("notification_preferences")
    .select(
      "morning_enabled,evening_enabled,inactivity_enabled,weekly_summary_enabled,email_enabled,in_app_enabled,preferred_time_zone",
    )
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) {
    console.warn("[smartDailyMessaging] load prefs", error.message);
    return { ...DEFAULT_PREFS };
  }
  if (!data) return { ...DEFAULT_PREFS };
  const r = data as Partial<CompanionPreferences> & { preferred_time_zone?: string };
  return {
    morning_enabled:        r.morning_enabled        ?? DEFAULT_PREFS.morning_enabled,
    evening_enabled:        r.evening_enabled        ?? DEFAULT_PREFS.evening_enabled,
    inactivity_enabled:     r.inactivity_enabled     ?? DEFAULT_PREFS.inactivity_enabled,
    weekly_summary_enabled: r.weekly_summary_enabled ?? DEFAULT_PREFS.weekly_summary_enabled,
    email_enabled:          r.email_enabled          ?? DEFAULT_PREFS.email_enabled,
    in_app_enabled:         r.in_app_enabled         ?? DEFAULT_PREFS.in_app_enabled,
    timezone:               r.preferred_time_zone?.trim() || DEFAULT_PREFS.timezone,
  };
}

// ─── Timezone window helpers ─────────────────────────────────────────────────

/**
 * Returns the current hour (0–23) in the given IANA timezone.
 * Used to determine whether it is "morning" or "evening" for a specific user.
 */
export function localHourInTimeZone(d: Date, tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false });
    const h = fmt.formatToParts(d).find((p) => p.type === "hour")?.value ?? "0";
    const n = parseInt(h === "24" ? "0" : h, 10);
    return Number.isNaN(n) ? 0 : n;
  } catch {
    return new Date().getUTCHours();
  }
}

/**
 * Returns true if the current time in `tz` falls within [startHour, endHour).
 * Used by the cron to skip companies whose farmers are asleep.
 */
export function isInLocalTimeWindow(tz: string, startHour: number, endHour: number): boolean {
  return isInLocalTimeWindowAt(new Date(), tz, startHour, endHour);
}

export function isInLocalTimeWindowAt(d: Date, tz: string, startHour: number, endHour: number): boolean {
  const h = localHourInTimeZone(d, tz);
  return h >= startHour && h < endHour;
}

/**
 * Returns true when the current day in `tz` is Sunday.
 * Used by the weekly-summary run to skip non-Sunday companies.
 */
export function isLocalSunday(tz: string): boolean {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" });
    return fmt.format(new Date()).toLowerCase().startsWith("sun");
  } catch {
    return new Date().getUTCDay() === 0;
  }
}

// ---------------------------------------------------------------------------
// Tiered inactivity detection
// ---------------------------------------------------------------------------

export type InactivityResult = {
  tier: InactivityTier;
  daysInactive: number;
  message: string;
  alreadySentThisWeek: boolean;
};

/** Days between two Date values (UTC day boundaries). */
function daysBetweenDates(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((to.getTime() - from.getTime()) / msPerDay);
}

/** Returns the ISO date string (YYYY-MM-DD) for the Sunday that starts the current UTC week. */
function currentUtcWeekStart(): string {
  const now = new Date();
  const dow = now.getUTCDay(); // 0 = Sunday
  const sunday = new Date(now);
  sunday.setUTCDate(now.getUTCDate() - dow);
  sunday.setUTCHours(0, 0, 0, 0);
  return sunday.toISOString().slice(0, 10);
}

/** Check whether a given tier was already sent this calendar week (UTC Sunday-based). */
async function inactivityTierSentThisWeek(
  admin: SupabaseClient,
  clerkUserId: string,
  companyId: string,
  tier: InactivityTier,
): Promise<boolean> {
  const weekStart = currentUtcWeekStart();
  const { data } = await admin
    .schema("public")
    .from("companion_inactivity_log")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .eq("company_id", companyId)
    .eq("tier", tier)
    .eq("week_start", weekStart)
    .limit(1)
    .maybeSingle();
  return !!(data as { id?: string } | null)?.id;
}

/** Record that a tier was sent so it won't repeat this week. */
export async function recordInactivityTierSent(
  admin: SupabaseClient,
  clerkUserId: string,
  companyId: string,
  tier: InactivityTier,
): Promise<void> {
  const weekStart = currentUtcWeekStart();
  const { error } = await admin
    .schema("public")
    .from("companion_inactivity_log")
    .insert({ clerk_user_id: clerkUserId, company_id: companyId, tier, week_start: weekStart });
  if (error && !error.message.includes("duplicate") && !error.message.includes("unique")) {
    console.warn("[smartDailyMessaging] record inactivity tier", error.message);
  }
}

/**
 * Determine if a user is inactive and which tier applies.
 * Returns null if the user is active, or if preferences disable inactivity nudges,
 * or if the tier was already sent this week.
 *
 * `lastActivityAt` should be the best available proxy for last active time —
 * typically profile.updated_at (updated on each Clerk sign-in sync).
 */
export async function detectInactivityTier(
  admin: SupabaseClient,
  clerkUserId: string,
  companyId: string,
  lastActivityAt: Date | null,
  prefs: CompanionPreferences,
): Promise<InactivityResult | null> {
  if (!prefs.inactivity_enabled) return null;
  if (!lastActivityAt) return null;

  const now = new Date();
  const daysInactive = daysBetweenDates(lastActivityAt, now);
  const tier = inactivityTierFromDays(daysInactive);
  if (!tier) return null; // active (< 2 days)

  const alreadySent = await inactivityTierSentThisWeek(admin, clerkUserId, companyId, tier);

  // Pick a rotating message from the tier pool using day-of-year as seed.
  const doy = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
  const pool = inactivityPoolForTier(tier);
  const idx = Math.abs(doy + clerkUserId.charCodeAt(0)) % pool.length;
  const message = pool[idx] ?? pool[0];

  return { tier, daysInactive, message, alreadySentThisWeek: alreadySent };
}

// ---------------------------------------------------------------------------
// Optional SMS hook
// ---------------------------------------------------------------------------

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

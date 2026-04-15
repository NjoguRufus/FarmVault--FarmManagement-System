import { db } from "@/lib/db";

export type CompanyRevenueSource = "mpesa_stk" | "subscription" | "manual" | string;

export type CompanyRevenueRow = {
  id: string;
  user_id: string | null;
  source: CompanyRevenueSource;
  amount: number;
  plan: string | null;
  customer_id: string | null;
  receipt_number: string;
  date: string;
  created_at: string;
};

export type CompanyRevenueFilters = {
  source?: string;
  plan?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  search?: string;
};

export type CompanyRevenuePage = {
  rows: CompanyRevenueRow[];
  total: number;
  page: number;
  pageSize: number;
};

type SubscriptionPaymentFallbackRow = {
  id: string;
  company_id: string | null;
  billing_mode: string | null;
  billing_cycle: string | null;
  transaction_code: string | null;
  amount: number | null;
  created_at: string | null;
  approved_at: string | null;
  status: string | null;
};

type FilterableQuery = {
  eq: (column: string, value: string) => FilterableQuery;
  gte: (column: string, value: string) => FilterableQuery;
  lte: (column: string, value: string) => FilterableQuery;
  ilike: (column: string, pattern: string) => FilterableQuery;
};

function applyFilters<T extends FilterableQuery>(query: T, filters: CompanyRevenueFilters): T {
  let next = query;
  if (filters.source && filters.source !== "all") {
    next = next.eq("source", filters.source);
  }
  if (filters.plan && filters.plan !== "all") {
    next = next.eq("plan", filters.plan);
  }
  if (filters.dateFrom) {
    next = next.gte("date", filters.dateFrom);
  }
  if (filters.dateTo) {
    next = next.lte("date", filters.dateTo);
  }
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    next = next.ilike("receipt_number", q);
  }
  return next;
}

function normalizeRows(rows: CompanyRevenueRow[]): CompanyRevenueRow[] {
  return rows.map((row) => ({
    ...row,
    amount: Number(row.amount ?? 0),
  }));
}

function shouldFallback(error: { code?: string } | null): boolean {
  if (!error?.code) return false;
  return error.code === "42P01" || error.code === "42501";
}

function mapSubscriptionPaymentToRevenue(row: SubscriptionPaymentFallbackRow): CompanyRevenueRow {
  const dateValue = row.approved_at ?? row.created_at ?? new Date().toISOString();
  return {
    id: `subscription:${row.id}`,
    user_id: null,
    source: (row.billing_mode?.trim() || "subscription") as CompanyRevenueSource,
    amount: Number(row.amount ?? 0),
    plan: row.billing_cycle?.trim() || null,
    customer_id: row.company_id,
    receipt_number: row.transaction_code?.trim() || `subscription_payment:${row.id}`,
    date: String(dateValue).slice(0, 10),
    created_at: dateValue,
  };
}

async function listRevenueFallback(filters: CompanyRevenueFilters): Promise<CompanyRevenueRow[]> {
  let query = db
    .public()
    .from("subscription_payments")
    .select("id,company_id,billing_mode,billing_cycle,transaction_code,amount,created_at,approved_at,status")
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.source && filters.source !== "all") {
    query = query.eq("billing_mode", filters.source);
  }
  if (filters.plan && filters.plan !== "all") {
    query = query.eq("billing_cycle", filters.plan);
  }
  if (filters.dateFrom) {
    query = query.gte("approved_at", filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte("approved_at", `${filters.dateTo}T23:59:59.999Z`);
  }
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    query = query.ilike("transaction_code", q);
  }

  const { data, error } = await query;
  if (error) throw error;
  const mapped = ((data ?? []) as SubscriptionPaymentFallbackRow[]).map(mapSubscriptionPaymentToRevenue);
  return normalizeRows(mapped);
}

export async function listCompanyRevenue(
  filters: CompanyRevenueFilters,
  page: number,
  pageSize: number,
): Promise<CompanyRevenuePage> {
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;
  let query = db
    .public()
    .from("company_revenue")
    .select("*", { count: "exact" })
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);
  query = applyFilters(query, filters);
  const { data, error, count } = await query;
  if (error && !shouldFallback(error)) throw error;
  if (error || !(data && data.length > 0)) {
    const fallbackRows = await listRevenueFallback(filters);
    const start = Math.max(0, from);
    const end = Math.min(fallbackRows.length, to + 1);
    return {
      rows: fallbackRows.slice(start, end),
      total: fallbackRows.length,
      page,
      pageSize,
    };
  }
  return {
    rows: normalizeRows((data ?? []) as CompanyRevenueRow[]),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function listCompanyRevenueForAnalytics(filters: CompanyRevenueFilters): Promise<CompanyRevenueRow[]> {
  let query = db
    .public()
    .from("company_revenue")
    .select("id,user_id,source,amount,plan,customer_id,receipt_number,date,created_at")
    .order("date", { ascending: true });
  query = applyFilters(query, filters);
  const { data, error } = await query;
  if (error && !shouldFallback(error)) throw error;
  if (error || !(data && data.length > 0)) {
    return listRevenueFallback(filters);
  }
  return normalizeRows((data ?? []) as CompanyRevenueRow[]);
}

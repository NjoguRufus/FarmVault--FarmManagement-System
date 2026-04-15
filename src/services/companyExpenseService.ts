import { db } from "@/lib/db";

export const COMPANY_EXPENSE_CATEGORY_PRESETS = [
  "Infrastructure",
  "Marketing",
  "Staff",
  "Operations",
  "Miscellaneous",
] as const;

export type CompanyExpenseSource = "manual" | "ambassador_payout" | "system";

export type CompanyExpenseRow = {
  id: string;
  user_id: string | null;
  name: string;
  category: string;
  amount: number;
  payment_method: string | null;
  date: string;
  notes: string | null;
  source: CompanyExpenseSource | string;
  reference_id: string | null;
  created_at: string;
};

export type CompanyExpenseFilters = {
  search?: string;
  category?: string;
  paymentMethod?: string;
  source?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type CompanyExpensesPage = {
  rows: CompanyExpenseRow[];
  total: number;
  page: number;
  pageSize: number;
};

type FilterableQuery = {
  ilike: (column: string, pattern: string) => FilterableQuery;
  eq: (column: string, value: string) => FilterableQuery;
  gte: (column: string, value: string) => FilterableQuery;
  lte: (column: string, value: string) => FilterableQuery;
};

function applyFilters<T extends FilterableQuery>(
  query: T,
  filters: CompanyExpenseFilters,
): T {
  let next = query;
  if (filters.search?.trim()) {
    next = next.ilike("name", `%${filters.search.trim()}%`);
  }
  if (filters.category && filters.category !== "all") {
    next = next.eq("category", filters.category);
  }
  if (filters.paymentMethod && filters.paymentMethod !== "all") {
    next = next.eq("payment_method", filters.paymentMethod);
  }
  if (filters.source && filters.source !== "all") {
    next = next.eq("source", filters.source);
  }
  if (filters.dateFrom) {
    next = next.gte("date", filters.dateFrom);
  }
  if (filters.dateTo) {
    next = next.lte("date", filters.dateTo);
  }
  return next;
}

export async function listCompanyExpenses(
  filters: CompanyExpenseFilters,
  page: number,
  pageSize: number,
): Promise<CompanyExpensesPage> {
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;
  let query = db
    .public()
    .from("company_expenses")
    .select("*", { count: "exact" })
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  query = applyFilters(query, filters);
  const { data, error, count } = await query;
  if (error) throw error;

  return {
    rows: ((data ?? []) as CompanyExpenseRow[]).map((row) => ({
      ...row,
      amount: Number(row.amount ?? 0),
    })),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function listCompanyExpensesForAnalytics(
  filters: CompanyExpenseFilters,
): Promise<CompanyExpenseRow[]> {
  let query = db
    .public()
    .from("company_expenses")
    .select("id,name,category,amount,payment_method,date,source,created_at")
    .order("date", { ascending: true });

  query = applyFilters(query, filters);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as CompanyExpenseRow[]).map((row) => ({
    ...row,
    amount: Number(row.amount ?? 0),
  }));
}

export async function createCompanyExpense(input: {
  name: string;
  category: string;
  amount: number;
  paymentMethod?: string | null;
  date?: string;
  notes?: string | null;
  source?: CompanyExpenseSource;
  referenceId?: string | null;
}): Promise<CompanyExpenseRow> {
  const { data, error } = await db
    .public()
    .from("company_expenses")
    .insert({
      name: input.name.trim(),
      category: input.category.trim(),
      amount: Number(input.amount),
      payment_method: input.paymentMethod?.trim() || null,
      date: input.date ?? new Date().toISOString().slice(0, 10),
      notes: input.notes?.trim() || null,
      source: input.source ?? "manual",
      reference_id: input.referenceId ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return { ...(data as CompanyExpenseRow), amount: Number((data as CompanyExpenseRow).amount ?? 0) };
}

export function groupExpensesByMonth(expenses: Pick<CompanyExpenseRow, "date" | "amount">[]): Map<string, number> {
  const map = new Map<string, number>();
  expenses.forEach((item) => {
    const key = String(item.date || "").slice(0, 7);
    if (!key) return;
    map.set(key, (map.get(key) ?? 0) + Number(item.amount ?? 0));
  });
  return map;
}

export function groupExpensesByCategory(
  expenses: Pick<CompanyExpenseRow, "category" | "amount">[],
): { category: string; amount: number }[] {
  const map = new Map<string, number>();
  expenses.forEach((item) => {
    const key = item.category || "Uncategorized";
    map.set(key, (map.get(key) ?? 0) + Number(item.amount ?? 0));
  });
  return Array.from(map.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

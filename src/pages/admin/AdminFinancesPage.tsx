import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, DollarSign, Landmark, SlidersHorizontal, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DeveloperStatGrid } from "@/components/developer/DeveloperStatGrid";
import { StatCard } from "@/components/dashboard/StatCard";
import { groupExpensesByCategory, listCompanyExpenses, listCompanyExpensesForAnalytics } from "@/services/companyExpenseService";
import { listCompanyRevenue, listCompanyRevenueForAnalytics } from "@/services/companyRevenueService";

const PAGE_SIZE = 10;
const PIE_COLORS = ["#D8B980", "#caa963", "#aa8747", "#8a6a38", "#6d542e", "#f0cea0", "#4e3f25"];
const FinancialDashboardCharts = lazy(() => import("@/components/admin/FinancialDashboardCharts"));

function formatKES(value: number): string {
  return `KES ${Math.round(Number(value || 0)).toLocaleString("en-KE")}`;
}

function toMonthKey(dateString: string): string {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-KE", { month: "short", year: "2-digit" });
}

function fmtPercent(value: number): string {
  return `${Math.max(0, value).toFixed(1)}%`;
}

function normalizeCategory(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (lower.includes("staff")) return "Staff";
  if (lower.includes("market")) return "Marketing";
  if (lower.includes("infra")) return "Infrastructure";
  if (lower.includes("operation")) return "Operations";
  return "Misc";
}

function displaySource(source: string): string {
  if (!source) return "Unknown";
  if (source === "mpesa_stk") return "M-Pesa STK";
  if (source === "ambassador_payout") return "Ambassador payout";
  return source.replace(/_/g, " ");
}

function shortId(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

type DatePreset = "month" | "all_time" | "custom";

function getMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function getPresetLabel(preset: DatePreset): string {
  if (preset === "month") return "This Month";
  if (preset === "all_time") return "All Time";
  return "Custom";
}

function DashboardSkeletonState() {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, idx) => (
          <div key={idx} className="fv-card p-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-6 w-36" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="fv-card p-4">
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
      <div className="fv-card p-4">
        <Skeleton className="h-[320px] w-full" />
      </div>
      <div className="fv-card p-3">
        <Skeleton className="mb-3 h-9 w-80" />
        {Array.from({ length: 6 }).map((_, idx) => (
          <Skeleton key={idx} className="mb-2 h-8 w-full" />
        ))}
      </div>
    </>
  );
}

export default function AdminFinancesPage({ embedded = false }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient();
  const monthRange = useMemo(() => getMonthRange(), []);
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [dateFrom, setDateFrom] = useState(monthRange.from);
  const [dateTo, setDateTo] = useState(monthRange.to);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState("all");
  const [source, setSource] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [plan, setPlan] = useState("all");
  const [searchRevenue, setSearchRevenue] = useState("");
  const [tableView, setTableView] = useState<"revenue" | "expenses">("revenue");
  const [revenuePage, setRevenuePage] = useState(1);
  const [expensePage, setExpensePage] = useState(1);

  const expenseFilters = useMemo(
    () => ({ dateFrom, dateTo, category, source, paymentMethod, search: "" }),
    [dateFrom, dateTo, category, source, paymentMethod],
  );
  const revenueFilters = useMemo(
    () => ({ dateFrom, dateTo, source, plan, search: searchRevenue }),
    [dateFrom, dateTo, source, plan, searchRevenue],
  );

  const { data: revenueRows = [], isLoading: loadingRevenueAnalytics, error: revenueError } = useQuery({
    queryKey: ["company-revenue-analytics", revenueFilters],
    queryFn: () => listCompanyRevenueForAnalytics(revenueFilters),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: (previousData) => previousData,
  });
  const { data: expenseRows = [], isLoading: loadingExpenseAnalytics } = useQuery({
    queryKey: ["company-expenses-analytics", expenseFilters],
    queryFn: () => listCompanyExpensesForAnalytics(expenseFilters),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: (previousData) => previousData,
  });
  const { data: revenuePaged, isLoading: loadingRevenuePage } = useQuery({
    queryKey: ["company-revenue-page", revenueFilters, revenuePage],
    queryFn: () => listCompanyRevenue(revenueFilters, revenuePage, PAGE_SIZE),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (previousData) => previousData,
  });
  const { data: expensePaged, isLoading: loadingExpensePage } = useQuery({
    queryKey: ["company-expenses-page", expenseFilters, expensePage],
    queryFn: () => listCompanyExpenses(expenseFilters, expensePage, PAGE_SIZE),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin-finances-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "company_revenue" }, () => {
        queryClient.invalidateQueries({ queryKey: ["company-revenue-analytics"] });
        queryClient.invalidateQueries({ queryKey: ["company-revenue-page"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "company_expenses" }, () => {
        queryClient.invalidateQueries({ queryKey: ["company-expenses-analytics"] });
        queryClient.invalidateQueries({ queryKey: ["company-expenses-page"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const isLoading = loadingRevenueAnalytics || loadingExpenseAnalytics;

  const analytics = useMemo(() => {
    const totalRevenue = revenueRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const totalExpenses = expenseRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const netProfit = totalRevenue - totalExpenses;
    const now = new Date();
    const currY = now.getFullYear();
    const currM = now.getMonth();
    const thisMonthRevenue = revenueRows
      .filter((row) => {
        const d = new Date(row.date);
        return d.getFullYear() === currY && d.getMonth() === currM;
      })
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const monthlyBurn = expenseRows
      .filter((row) => {
        const d = new Date(row.date);
        return d.getFullYear() === currY && d.getMonth() === currM;
      })
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const monthMap = new Map<string, { month: string; revenue: number; expenses: number; profit: number }>();
    revenueRows.forEach((row) => {
      const key = toMonthKey(row.date);
      if (!key) return;
      const current = monthMap.get(key) ?? { month: monthLabel(key), revenue: 0, expenses: 0, profit: 0 };
      current.revenue += Number(row.amount || 0);
      monthMap.set(key, current);
    });
    expenseRows.forEach((row) => {
      const key = toMonthKey(row.date);
      if (!key) return;
      const current = monthMap.get(key) ?? { month: monthLabel(key), revenue: 0, expenses: 0, profit: 0 };
      current.expenses += Number(row.amount || 0);
      monthMap.set(key, current);
    });
    const monthlyData = Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, row]) => ({ ...row, profit: row.revenue - row.expenses }));

    const expenseByCategory = groupExpensesByCategory(
      expenseRows.map((row) => ({
        category: normalizeCategory(String(row.category ?? "Misc")),
        amount: Number(row.amount || 0),
      })),
    );
    const revenueByPlanMap = new Map<string, number>();
    const revenueBySourceMap = new Map<string, number>();
    revenueRows.forEach((row) => {
      const planKey = row.plan?.trim() ? row.plan : "Unspecified";
      revenueByPlanMap.set(planKey, (revenueByPlanMap.get(planKey) ?? 0) + Number(row.amount || 0));
      const sourceKey = displaySource(String(row.source ?? "unknown"));
      revenueBySourceMap.set(sourceKey, (revenueBySourceMap.get(sourceKey) ?? 0) + Number(row.amount || 0));
    });
    const revenueByPlan = Array.from(revenueByPlanMap.entries())
      .map(([categoryName, amount]) => ({ category: categoryName, amount }))
      .sort((a, b) => b.amount - a.amount);
    const revenueBySource = Array.from(revenueBySourceMap.entries())
      .map(([categoryName, amount]) => ({ category: categoryName, amount }))
      .sort((a, b) => b.amount - a.amount);

    const thisMonthStaff = expenseRows
      .filter((row) => normalizeCategory(String(row.category ?? "")) === "Staff")
      .filter((row) => {
        const d = new Date(row.date);
        return d.getFullYear() === currY && d.getMonth() === currM;
      })
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const thisMonthPayouts = expenseRows
      .filter((row) => String(row.source ?? "") === "ambassador_payout")
      .filter((row) => {
        const d = new Date(row.date);
        return d.getFullYear() === currY && d.getMonth() === currM;
      })
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const sortedMonthly = monthlyData.slice(-2);
    const prevRevenue = sortedMonthly.length > 1 ? sortedMonthly[0].revenue : 0;
    const currRevenue = sortedMonthly.length > 0 ? sortedMonthly[sortedMonthly.length - 1].revenue : 0;
    const revenueGrowth = prevRevenue > 0 ? ((currRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    const staffShare = monthlyBurn > 0 ? (thisMonthStaff / monthlyBurn) * 100 : 0;
    const payoutShare = monthlyBurn > 0 ? (thisMonthPayouts / monthlyBurn) * 100 : 0;

    return {
      totalRevenue,
      totalExpenses,
      netProfit,
      monthlyBurn,
      thisMonthRevenue,
      monthlyData,
      expenseByCategory,
      revenueByPlan,
      revenueBySource,
      staffShare,
      payoutShare,
      revenueGrowth,
    };
  }, [expenseRows, revenueRows]);

  const expenseCategories = useMemo(
    () => ["all", ...Array.from(new Set(expenseRows.map((row) => normalizeCategory(String(row.category ?? "")))))],
    [expenseRows],
  );
  const revenueSources = useMemo(() => {
    const merged = [
      ...revenueRows.map((row) => String(row.source ?? "").trim()),
      ...expenseRows.map((row) => String(row.source ?? "").trim()),
    ].filter(Boolean);
    return ["all", ...Array.from(new Set(merged))];
  }, [expenseRows, revenueRows]);
  const paymentMethods = useMemo(
    () => ["all", ...Array.from(new Set(expenseRows.map((row) => String(row.payment_method ?? "").trim()).filter(Boolean)))],
    [expenseRows],
  );
  const planOptions = useMemo(
    () => ["all", ...Array.from(new Set(revenueRows.map((row) => String(row.plan ?? "").trim()).filter(Boolean)))],
    [revenueRows],
  );

  const revenueTableRows = revenuePaged?.rows ?? [];
  const expenseTableRows = expensePaged?.rows ?? [];
  const revenueTotalPages = Math.max(1, Math.ceil((revenuePaged?.total ?? 0) / PAGE_SIZE));
  const expenseTotalPages = Math.max(1, Math.ceil((expensePaged?.total ?? 0) / PAGE_SIZE));
  const hasProfit = analytics.netProfit >= 0;
  const burnRateSafe = analytics.thisMonthRevenue >= analytics.monthlyBurn;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {!embedded ? (
            <>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
                <Wallet className="h-6 w-6 text-primary" />
                Platform Finances Command Center
              </h1>
              <p className="text-sm text-muted-foreground">Real-time visibility into FarmVault revenue, expenses, profit, and burn.</p>
            </>
          ) : (
            <h2 className="text-sm font-semibold text-foreground">Platform Finances</h2>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{getPresetLabel(datePreset)}</span>
          <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="fv-btn fv-btn--secondary" aria-label="Open finance filters">
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[320px] space-y-3">
              <p className="text-sm font-medium text-foreground">Filter Finances</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cn("fv-btn", datePreset === "month" ? "fv-btn--primary" : "fv-btn--secondary")}
                  onClick={() => {
                    const m = getMonthRange();
                    setDatePreset("month");
                    setDateFrom(m.from);
                    setDateTo(m.to);
                    setRevenuePage(1);
                    setExpensePage(1);
                  }}
                >
                  This Month
                </button>
                <button
                  type="button"
                  className={cn("fv-btn", datePreset === "all_time" ? "fv-btn--primary" : "fv-btn--secondary")}
                  onClick={() => {
                    setDatePreset("all_time");
                    setDateFrom("");
                    setDateTo("");
                    setRevenuePage(1);
                    setExpensePage(1);
                  }}
                >
                  All Time
                </button>
                <button
                  type="button"
                  className={cn("fv-btn", datePreset === "custom" ? "fv-btn--primary" : "fv-btn--secondary")}
                  onClick={() => setDatePreset("custom")}
                >
                  Custom
                </button>
              </div>

              {datePreset === "custom" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">From</span>
                    <input
                      className="fv-input"
                      type="date"
                      value={dateFrom}
                      onChange={(e) => {
                        setDateFrom(e.target.value);
                        setRevenuePage(1);
                        setExpensePage(1);
                      }}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">To</span>
                    <input
                      className="fv-input"
                      type="date"
                      value={dateTo}
                      onChange={(e) => {
                        setDateTo(e.target.value);
                        setRevenuePage(1);
                        setExpensePage(1);
                      }}
                    />
                  </label>
                </div>
              ) : null}

              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Category</span>
                <select className="fv-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {expenseCategories.map((x) => (
                    <option key={x} value={x}>
                      {x === "all" ? "All expense categories" : x}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Source</span>
                <select className="fv-input" value={source} onChange={(e) => setSource(e.target.value)}>
                  {revenueSources.map((x) => (
                    <option key={x} value={x}>
                      {x === "all" ? "All sources" : displaySource(x)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Payment Method</span>
                <select className="fv-input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  {paymentMethods.map((x) => (
                    <option key={x} value={x}>
                      {x === "all" ? "All payment methods" : x}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Plan</span>
                <select className="fv-input" value={plan} onChange={(e) => setPlan(e.target.value)}>
                  {planOptions.map((x) => (
                    <option key={x} value={x}>
                      {x === "all" ? "All plans" : x}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="fv-btn fv-btn--secondary"
                  onClick={() => {
                    const m = getMonthRange();
                    setDatePreset("month");
                    setDateFrom(m.from);
                    setDateTo(m.to);
                    setCategory("all");
                    setSource("all");
                    setPaymentMethod("all");
                    setPlan("all");
                    setRevenuePage(1);
                    setExpensePage(1);
                  }}
                >
                  Reset Filters
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {!!revenueError && (
        <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm">
          {(revenueError as Error).message || "Revenue data failed to load."}
        </div>
      )}

      {isLoading ? (
        <DashboardSkeletonState />
      ) : (
        <>
          <DeveloperStatGrid cols="5">
            <StatCard
              title="Total Revenue"
              value={formatKES(analytics.totalRevenue)}
              icon={<DollarSign className="h-3.5 w-3.5" />}
              variant="info"
              valueVariant="info"
              compact
            />
            <StatCard
              title="Total Expenses"
              value={formatKES(analytics.totalExpenses)}
              icon={<TrendingDown className="h-3.5 w-3.5" />}
              variant="destructive"
              valueVariant="destructive"
              compact
            />
            <StatCard
              title={hasProfit ? "Net Profit" : "Net Loss"}
              value={formatKES(analytics.netProfit)}
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              variant={hasProfit ? "success" : "destructive"}
              valueVariant={hasProfit ? "success" : "destructive"}
              compact
            />
            <StatCard
              title="Monthly Burn Rate"
              value={formatKES(analytics.monthlyBurn)}
              icon={<Landmark className="h-3.5 w-3.5" />}
              variant={burnRateSafe ? "success" : "destructive"}
              valueVariant={burnRateSafe ? "success" : "destructive"}
              changeLabel={burnRateSafe ? "Safe burn rate" : "Unsafe burn rate"}
              compact
            />
            <StatCard
              title="This Month Revenue"
              value={formatKES(analytics.thisMonthRevenue)}
              icon={<Calendar className="h-3.5 w-3.5" />}
              variant="info"
              valueVariant="info"
              compact
            />
          </DeveloperStatGrid>

          <div className="grid gap-3 lg:grid-cols-3">
            <div className="fv-card p-4 text-sm text-muted-foreground">
              You spent <span className="font-semibold text-foreground">{fmtPercent(analytics.staffShare)}</span> on staff this month.
            </div>
            <div className="fv-card p-4 text-sm text-muted-foreground">
              Revenue changed by <span className="font-semibold text-foreground">{fmtPercent(Math.abs(analytics.revenueGrowth))}</span> {analytics.revenueGrowth >= 0 ? "up" : "down"} versus last month.
            </div>
            <div className="fv-card p-4 text-sm text-muted-foreground">
              Ambassador payouts are <span className="font-semibold text-foreground">{fmtPercent(analytics.payoutShare)}</span> of this month expenses.
            </div>
          </div>

          <Suspense fallback={<div className="fv-card p-4 text-sm text-muted-foreground">Loading charts...</div>}>
            <FinancialDashboardCharts
              monthlyData={analytics.monthlyData}
              expenseByCategory={analytics.expenseByCategory}
              revenueByPlan={analytics.revenueByPlan}
              revenueBySource={analytics.revenueBySource}
              pieColors={PIE_COLORS}
              formatKES={formatKES}
            />
          </Suspense>

          <div className="fv-card p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={cn("fv-btn", tableView === "revenue" ? "fv-btn--primary" : "fv-btn--secondary")}
                  onClick={() => setTableView("revenue")}
                >
                  Recent Revenue
                </button>
                <button
                  type="button"
                  className={cn("fv-btn", tableView === "expenses" ? "fv-btn--primary" : "fv-btn--secondary")}
                  onClick={() => setTableView("expenses")}
                >
                  Recent Expenses
                </button>
              </div>
              {tableView === "revenue" ? (
                <input
                  className="fv-input max-w-[220px]"
                  placeholder="Search by receipt..."
                  value={searchRevenue}
                  onChange={(e) => {
                    setSearchRevenue(e.target.value);
                    setRevenuePage(1);
                  }}
                />
              ) : null}
            </div>

            {tableView === "revenue" ? (
              <>
                {loadingRevenuePage ? (
                  <div className="space-y-2 py-2">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <Skeleton key={idx} className="h-8 w-full" />
                    ))}
                  </div>
                ) : revenueTableRows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No revenue records.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] text-sm">
                      <thead>
                        <tr className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
                          <th className="py-2">Date</th>
                          <th>Customer / Company</th>
                          <th>Plan</th>
                          <th className="text-right">Amount</th>
                          <th>Source</th>
                          <th>Receipt Number</th>
                        </tr>
                      </thead>
                      <tbody>
                        {revenueTableRows.map((row) => (
                          <tr key={row.id} className="border-b border-border/40">
                            <td className="py-2">{new Date(row.date).toLocaleDateString("en-KE")}</td>
                            <td>{shortId(row.customer_id)}</td>
                            <td>{row.plan || "—"}</td>
                            <td className="text-right font-semibold text-foreground">{formatKES(row.amount)}</td>
                            <td>{displaySource(String(row.source ?? ""))}</td>
                            <td>{row.receipt_number}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Page {revenuePage} of {revenueTotalPages}</span>
                  <div className="flex gap-2">
                    <button className="fv-btn fv-btn--secondary" disabled={revenuePage <= 1} onClick={() => setRevenuePage((p) => Math.max(1, p - 1))}>Previous</button>
                    <button className="fv-btn fv-btn--secondary" disabled={revenuePage >= revenueTotalPages} onClick={() => setRevenuePage((p) => Math.min(revenueTotalPages, p + 1))}>Next</button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {loadingExpensePage ? (
                  <div className="space-y-2 py-2">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <Skeleton key={idx} className="h-8 w-full" />
                    ))}
                  </div>
                ) : expenseTableRows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No expense records.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead>
                        <tr className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
                          <th className="py-2">Date</th>
                          <th>Name</th>
                          <th>Category</th>
                          <th className="text-right">Amount</th>
                          <th>Payment Method</th>
                          <th>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenseTableRows.map((row) => (
                          <tr key={row.id} className="border-b border-border/40">
                            <td className="py-2">{new Date(row.date).toLocaleDateString("en-KE")}</td>
                            <td>{row.name}</td>
                            <td>{normalizeCategory(String(row.category ?? ""))}</td>
                            <td className="text-right font-semibold text-foreground">{formatKES(row.amount)}</td>
                            <td>{row.payment_method || "—"}</td>
                            <td>{displaySource(String(row.source ?? ""))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Page {expensePage} of {expenseTotalPages}</span>
                  <div className="flex gap-2">
                    <button className="fv-btn fv-btn--secondary" disabled={expensePage <= 1} onClick={() => setExpensePage((p) => Math.max(1, p - 1))}>Previous</button>
                    <button className="fv-btn fv-btn--secondary" disabled={expensePage >= expenseTotalPages} onClick={() => setExpensePage((p) => Math.min(expenseTotalPages, p + 1))}>Next</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

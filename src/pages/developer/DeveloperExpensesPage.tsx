import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Filter, Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SimpleStatCard } from "@/components/dashboard/SimpleStatCard";
import { DeveloperPageShell } from "@/components/developer/DeveloperPageShell";
import { supabase } from "@/lib/supabase";
import { debounce } from "@/lib/debounce";
import {
  COMPANY_EXPENSE_CATEGORY_PRESETS,
  createCompanyExpense,
  groupExpensesByCategory,
  groupExpensesByMonth,
  listCompanyExpenses,
  listCompanyExpensesForAnalytics,
} from "@/services/companyExpenseService";

const PAGE_SIZE = 15;
const LARGE_EXPENSE_THRESHOLD = 20000;
const PIE_COLORS = ["#D8B980", "#C3A063", "#A98647", "#8E6F36", "#6F572B", "#F1CF98"];

function formatKES(value: number): string {
  return `KES ${Math.round(Number(value || 0)).toLocaleString("en-KE")}`;
}

function toMonthLabel(monthKey: string): string {
  if (!monthKey || monthKey.length !== 7) return monthKey;
  const [y, m] = monthKey.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-KE", { month: "short", year: "numeric" });
}

export default function DeveloperExpensesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [source, setSource] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [openAdd, setOpenAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addName, setAddName] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addCategory, setAddCategory] = useState(COMPANY_EXPENSE_CATEGORY_PRESETS[0]);
  const [addCustomCategory, setAddCustomCategory] = useState("");
  const [addPaymentMethod, setAddPaymentMethod] = useState("M-Pesa");
  const [addDate, setAddDate] = useState(new Date().toISOString().slice(0, 10));
  const [addNotes, setAddNotes] = useState("");

  const filters = useMemo(
    () => ({ search, category, paymentMethod, source, dateFrom, dateTo }),
    [search, category, paymentMethod, source, dateFrom, dateTo],
  );

  const { data: paged, isLoading, isRefetching } = useQuery({
    queryKey: ["company-expenses", filters, page],
    queryFn: () => listCompanyExpenses(filters, page, PAGE_SIZE),
    staleTime: 45_000,
  });

  const { data: analyticsRows = [] } = useQuery({
    queryKey: ["company-expenses-analytics", filters],
    queryFn: () => listCompanyExpensesForAnalytics(filters),
    staleTime: 45_000,
  });

  useEffect(() => {
    const flush = debounce(() => {
      void queryClient.invalidateQueries({ queryKey: ["company-expenses"] });
      void queryClient.invalidateQueries({ queryKey: ["company-expenses-analytics"] });
    }, 800);

    const channel = supabase
      .channel("company-expenses-realtime-developer")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "company_expenses" },
        () => flush(),
      )
      .subscribe();

    return () => {
      flush.cancel();
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const totalPages = Math.max(1, Math.ceil((paged?.total ?? 0) / PAGE_SIZE));
  const rows = paged?.rows ?? [];

  const totalExpenses = analyticsRows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const thisMonthExpenses = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return analyticsRows
      .filter((item) => {
        const d = new Date(item.date);
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }, [analyticsRows]);
  const staffCosts = analyticsRows
    .filter((item) => item.category.toLowerCase() === "staff")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const marketingCosts = analyticsRows
    .filter((item) => item.category.toLowerCase() === "marketing")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const burnRate = useMemo(() => {
    const monthTotals = groupExpensesByMonth(analyticsRows);
    if (!monthTotals.size) return 0;
    const allMonths = Array.from(monthTotals.values());
    return allMonths.reduce((a, b) => a + b, 0) / allMonths.length;
  }, [analyticsRows]);

  const monthlyTrend = useMemo(() => {
    return Array.from(groupExpensesByMonth(analyticsRows).entries()).map(([month, amount]) => ({
      month: toMonthLabel(month),
      amount,
    }));
  }, [analyticsRows]);

  const byCategory = useMemo(() => {
    const grouped = groupExpensesByCategory(analyticsRows);
    return grouped.map((item) => ({
      ...item,
      percent: totalExpenses > 0 ? (item.amount / totalExpenses) * 100 : 0,
    }));
  }, [analyticsRows, totalExpenses]);

  const sourceOptions = ["all", "manual", "ambassador_payout", "system"];
  const paymentOptions = ["all", "M-Pesa", "Cash", "Bank"];
  const categoryOptions = ["all", ...COMPANY_EXPENSE_CATEGORY_PRESETS, ...byCategory.map((x) => x.category)];
  const uniqueCategories = Array.from(new Set(categoryOptions));

  const rowsWithMonth = rows.map((row) => ({
    ...row,
    monthGroup: toMonthLabel(String(row.date).slice(0, 7)),
  }));

  async function handleCreateExpense() {
    const amount = Number(addAmount);
    const categoryValue = addCategory === "Miscellaneous" && addCustomCategory.trim() ? addCustomCategory.trim() : addCategory;
    if (!addName.trim()) return toast.error("Expense name is required");
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Amount must be greater than 0");
    if (!categoryValue.trim()) return toast.error("Category is required");

    setSaving(true);
    try {
      await createCompanyExpense({
        name: addName,
        amount,
        category: categoryValue,
        paymentMethod: addPaymentMethod,
        date: addDate,
        notes: addNotes,
        source: "manual",
      });
      setOpenAdd(false);
      setAddName("");
      setAddAmount("");
      setAddNotes("");
      setAddCustomCategory("");
      queryClient.invalidateQueries({ queryKey: ["company-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["company-expenses-analytics"] });
      toast.success("Expense recorded");
    } catch (error) {
      toast.error("Failed to save expense", { description: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <DeveloperPageShell
      title="FarmVault Expenses"
      description="Internal financial tracking with manual + automated expense recording."
      isLoading={isLoading}
      isRefetching={isRefetching}
      onRefresh={undefined}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="fv-btn fv-btn--secondary"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["company-expenses"] });
              queryClient.invalidateQueries({ queryKey: ["company-expenses-analytics"] });
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="fv-btn fv-btn--secondary">
                <Filter className="h-4 w-4" />
                Filters
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] space-y-3 p-3" align="end">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2 py-1">
                <Calendar className="h-4 w-4 text-primary" />
                <input type="date" className="bg-transparent text-xs" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <span className="text-xs text-muted-foreground">to</span>
                <input type="date" className="bg-transparent text-xs" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <select className="fv-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {uniqueCategories.map((option) => (
                    <option key={option} value={option}>
                      {option === "all" ? "All categories" : option}
                    </option>
                  ))}
                </select>
                <select className="fv-input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  {paymentOptions.map((option) => (
                    <option key={option} value={option}>
                      {option === "all" ? "All payment methods" : option}
                    </option>
                  ))}
                </select>
                <select className="fv-input" value={source} onChange={(e) => setSource(e.target.value)}>
                  {sourceOptions.map((option) => (
                    <option key={option} value={option}>
                      {option === "all" ? "All sources" : option}
                    </option>
                  ))}
                </select>
              </div>
            </PopoverContent>
          </Popover>
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <button type="button" className="fv-btn fv-btn--primary">
                <Plus className="h-4 w-4" />
                Add Expense
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Expense</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <input className="fv-input" placeholder="Expense name" value={addName} onChange={(e) => setAddName(e.target.value)} />
                <input
                  className="fv-input"
                  type="number"
                  min={1}
                  step="0.01"
                  placeholder="Amount (KES)"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                />
                <select className="fv-input" value={addCategory} onChange={(e) => setAddCategory(e.target.value)}>
                  {COMPANY_EXPENSE_CATEGORY_PRESETS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <input
                  className="fv-input"
                  placeholder="Create custom category (optional)"
                  value={addCustomCategory}
                  onChange={(e) => setAddCustomCategory(e.target.value)}
                />
                <select className="fv-input" value={addPaymentMethod} onChange={(e) => setAddPaymentMethod(e.target.value)}>
                  <option value="M-Pesa">M-Pesa</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank">Bank</option>
                </select>
                <input className="fv-input" type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} />
                <textarea className="fv-input min-h-[80px]" placeholder="Notes" value={addNotes} onChange={(e) => setAddNotes(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <button type="button" className="fv-btn fv-btn--secondary" onClick={() => setOpenAdd(false)}>
                    Cancel
                  </button>
                  <button type="button" className="fv-btn fv-btn--primary" disabled={saving} onClick={() => void handleCreateExpense()}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <SimpleStatCard
            title="Total Expenses"
            value={formatKES(totalExpenses)}
            subtitle={`${analyticsRows.length} transactions`}
            layout="vertical"
          />
          <SimpleStatCard
            title="This Month"
            value={formatKES(thisMonthExpenses)}
            subtitle="Current month spend"
            layout="vertical"
          />
          <SimpleStatCard
            title="Staff Costs"
            value={formatKES(staffCosts)}
            subtitle="Category total"
            layout="vertical"
          />
          <SimpleStatCard
            title="Marketing Costs"
            value={formatKES(marketingCosts)}
            subtitle="Category total"
            layout="vertical"
          />
        </div>

        <div className="grid grid-cols-1">
          <SimpleStatCard
            title="Burn Rate"
            value={`${formatKES(burnRate)} per month`}
            subtitle="Average monthly expense across available months"
            layout="horizontal"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="fv-card p-3">
            <h3 className="mb-2 text-sm font-semibold">Monthly Expenses Trend</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(v: number) => formatKES(v)} />
                  <Line dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Area dataKey="amount" stroke="none" fill="hsl(var(--primary) / 0.15)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="fv-card p-3">
            <h3 className="mb-2 text-sm font-semibold">Category Breakdown</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="amount" nameKey="category" outerRadius={90} label>
                    {byCategory.map((entry, index) => (
                      <Cell key={`${entry.category}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatKES(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {byCategory.map((entry) => (
                <div key={entry.category} className="flex items-center justify-between">
                  <span>{entry.category}</span>
                  <span>{entry.percent.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="fv-card space-y-3 p-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[220px] flex-1">
              <input
                className="fv-input w-full"
                placeholder="Search expenses..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>

        <div className="fv-card p-3">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : rowsWithMonth.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No expenses found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Date</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th className="text-right">Amount</th>
                    <th>Payment Method</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsWithMonth.map((row, idx) => (
                    <React.Fragment key={row.id}>
                      {(idx === 0 || rowsWithMonth[idx - 1].monthGroup !== row.monthGroup) && (
                        <tr>
                          <td colSpan={6} className="py-2 text-xs font-semibold text-primary">
                            {row.monthGroup}
                          </td>
                        </tr>
                      )}
                      <tr className="border-b border-border/50">
                        <td className="py-2 text-muted-foreground">{new Date(row.date).toLocaleDateString("en-KE")}</td>
                        <td className="font-medium">{row.name}</td>
                        <td>{row.category}</td>
                        <td className={`text-right font-semibold ${row.amount >= LARGE_EXPENSE_THRESHOLD ? "text-amber-600" : "text-foreground"}`}>
                          {formatKES(row.amount)}
                        </td>
                        <td>{row.payment_method || "—"}</td>
                        <td>{row.source}</td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button type="button" className="fv-btn fv-btn--secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </button>
              <button
                type="button"
                className="fv-btn fv-btn--secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </DeveloperPageShell>
  );
}


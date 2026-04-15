import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Filter, Loader2, Plus, Receipt } from "lucide-react";
import { toast } from "sonner";
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
import { supabase } from "@/lib/supabase";
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

export default function AdminExpensesPage() {
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

  const { data: paged, isLoading } = useQuery({
    queryKey: ["company-expenses", filters, page],
    queryFn: () => listCompanyExpenses(filters, page, PAGE_SIZE),
  });

  const { data: analyticsRows = [] } = useQuery({
    queryKey: ["company-expenses-analytics", filters],
    queryFn: () => listCompanyExpensesForAnalytics(filters),
  });

  useEffect(() => {
    const channel = supabase
      .channel("company-expenses-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "company_expenses" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["company-expenses"] });
          queryClient.invalidateQueries({ queryKey: ["company-expenses-analytics"] });
        },
      )
      .subscribe();

    return () => {
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
    if (!addName.trim()) {
      toast.error("Expense name is required");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    if (!categoryValue.trim()) {
      toast.error("Category is required");
      return;
    }
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
    <div className="space-y-5 rounded-2xl border border-[#2b2b2b] bg-[#0a0a0a] p-4 text-white sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[#D8B980]">
            <Receipt className="h-6 w-6" />
            FarmVault Internal Expenses
          </h1>
          <p className="mt-1 text-sm text-white/70">Track manual and automated company-level expenses in one place.</p>
        </div>
        <Dialog open={openAdd} onOpenChange={setOpenAdd}>
          <DialogTrigger asChild>
            <button type="button" className="fv-btn fv-btn--primary">
              <Plus className="h-4 w-4" />
              Add Expense
            </button>
          </DialogTrigger>
          <DialogContent className="border-[#2b2b2b] bg-[#101010] text-white">
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-[#2b2b2b] bg-black/40 p-3">
          <p className="text-xs text-white/60">Total Expenses</p>
          <p className="text-lg font-semibold">{formatKES(totalExpenses)}</p>
        </div>
        <div className="rounded-xl border border-[#2b2b2b] bg-black/40 p-3">
          <p className="text-xs text-white/60">This Month</p>
          <p className="text-lg font-semibold">{formatKES(thisMonthExpenses)}</p>
        </div>
        <div className="rounded-xl border border-[#2b2b2b] bg-black/40 p-3">
          <p className="text-xs text-white/60">Staff Costs</p>
          <p className="text-lg font-semibold">{formatKES(staffCosts)}</p>
        </div>
        <div className="rounded-xl border border-[#2b2b2b] bg-black/40 p-3">
          <p className="text-xs text-white/60">Marketing Costs</p>
          <p className="text-lg font-semibold">{formatKES(marketingCosts)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-[#2b2b2b] bg-black/40 p-3">
        <p className="text-sm text-white/70">Burn Rate</p>
        <p className="text-xl font-bold text-[#D8B980]">Burn Rate: {formatKES(burnRate)} per month</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[#2b2b2b] bg-black/40 p-3">
          <h3 className="mb-2 text-sm font-semibold">Monthly Expenses Trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrend}>
                <CartesianGrid stroke="#2a2a2a" />
                <XAxis dataKey="month" stroke="#999" />
                <YAxis stroke="#999" />
                <Tooltip formatter={(v: number) => formatKES(v)} />
                <Line dataKey="amount" stroke="#D8B980" strokeWidth={2} dot={false} />
                <Area dataKey="amount" stroke="none" fill="#D8B98022" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-[#2b2b2b] bg-black/40 p-3">
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
          <div className="mt-2 space-y-1 text-xs text-white/70">
            {byCategory.map((entry) => (
              <div key={entry.category} className="flex items-center justify-between">
                <span>{entry.category}</span>
                <span>{entry.percent.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-[#2b2b2b] bg-black/30 p-3">
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
          <button type="button" className="fv-btn fv-btn--secondary">
            <Filter className="h-4 w-4" />
            Filters
          </button>
          <div className="flex items-center gap-2 rounded-lg border border-[#2f2f2f] bg-[#111] px-2 py-1">
            <Calendar className="h-4 w-4 text-[#D8B980]" />
            <input type="date" className="bg-transparent text-xs" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <span className="text-xs text-white/60">to</span>
            <input type="date" className="bg-transparent text-xs" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
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
      </div>

      <div className="rounded-xl border border-[#2b2b2b] bg-black/40 p-3">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-[#D8B980]" />
          </div>
        ) : rowsWithMonth.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/60">No expenses found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-[#2b2b2b] text-left text-xs uppercase text-white/50">
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
                        <td colSpan={6} className="py-2 text-xs font-semibold text-[#D8B980]">
                          {row.monthGroup}
                        </td>
                      </tr>
                    )}
                    <tr className="border-b border-[#1f1f1f]">
                      <td className="py-2 text-white/75">{new Date(row.date).toLocaleDateString("en-KE")}</td>
                      <td className="font-medium">{row.name}</td>
                      <td>{row.category}</td>
                      <td className={`text-right font-semibold ${row.amount >= LARGE_EXPENSE_THRESHOLD ? "text-amber-300" : "text-white"}`}>
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
        <div className="mt-3 flex items-center justify-between text-sm text-white/70">
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
  );
}

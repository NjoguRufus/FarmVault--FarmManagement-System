import React from 'react';
import { Download, FileText, BarChart2, PieChart, TrendingUp, Info } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { ExpensesPieChart } from '@/components/dashboard/ExpensesPieChart';
import { ActivityChart } from '@/components/dashboard/ActivityChart';
import { mockExpensesByCategory, mockActivityData } from '@/data/mockData';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export default function ReportsPage() {
  const { activeProject } = useProject();

  const reportTypes = [
    {
      title: 'Expenses Report',
      description: 'Detailed breakdown of all expenses by category and period',
      icon: <PieChart className="h-6 w-6" />,
      color: 'bg-primary/10 text-primary',
    },
    {
      title: 'Harvest Report',
      description: 'Summary of harvest quantities, quality grades, and yields',
      icon: <BarChart2 className="h-6 w-6" />,
      color: 'bg-fv-success/10 text-fv-success',
    },
    {
      title: 'Sales Report',
      description: 'Complete sales data including buyers, quantities, and revenue',
      icon: <TrendingUp className="h-6 w-6" />,
      color: 'bg-fv-gold-soft text-fv-olive',
    },
    {
      title: 'Operations Report',
      description: 'Timeline of all operations performed with status tracking',
      icon: <FileText className="h-6 w-6" />,
      color: 'bg-fv-info/10 text-fv-info',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeProject ? (
              <>Generate reports for <span className="font-medium">{activeProject.name}</span></>
            ) : (
              'View and export detailed reports'
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <select className="fv-select">
            <option>This Month</option>
            <option>Last Month</option>
            <option>This Quarter</option>
            <option>This Year</option>
          </select>
        </div>
      </div>

      {/* Report Types: 2 per row on mobile (compact), full content on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-3 md:gap-6" data-tour="reports-export">
        {reportTypes.map((report) => (
          <div key={report.title} className="fv-card hover:shadow-card-hover transition-shadow cursor-pointer p-3 md:p-4 flex flex-col gap-3">
            <div className="flex items-start gap-2 md:gap-4">
              <div className={`flex h-9 w-9 md:h-14 md:w-14 shrink-0 items-center justify-center rounded-lg md:rounded-xl ${report.color}`}>
                <span className="[&>svg]:h-4 [&>svg]:w-4 md:[&>svg]:h-6 md:[&>svg]:w-6">{report.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 w-full">
                  <h3 className="font-semibold text-foreground text-xs md:text-base break-words">{report.title}</h3>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
                        aria-label={`Info: ${report.title}`}
                      >
                        <Info className="h-3.5 w-3.5 md:h-4 md:w-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="max-w-[min(90vw,320px)] text-sm" align="start" side="bottom">
                      <p className="text-muted-foreground">{report.description}</p>
                    </PopoverContent>
                  </Popover>
                </div>
                {/* Description always visible on desktop; on mobile shown via info popover */}
                <p className="hidden md:block text-sm text-muted-foreground mt-1">{report.description}</p>
              </div>
            </div>
            <button
              type="button"
              className="fv-btn fv-btn--secondary w-full sm:w-auto self-start p-1.5 md:px-3 md:py-2 text-xs md:text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <Download className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5" />
              <span>Export</span>
            </button>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExpensesPieChart data={mockExpensesByCategory} />
        <ActivityChart data={mockActivityData} />
      </div>
    </div>
  );
}

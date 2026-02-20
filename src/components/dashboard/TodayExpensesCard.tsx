import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import type { DateRangePreset, DateRangeResult } from '@/lib/dashboardDateRange';

interface TodayExpensesCardProps {
  range: DateRangeResult;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomRangeChange: (start: Date, end: Date) => void;
  totalAmount: number;
  isEmpty?: boolean;
}

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'custom', label: 'Custom' },
];

export function TodayExpensesCard({
  range,
  onPresetChange,
  onCustomRangeChange,
  totalAmount,
  isEmpty,
}: TodayExpensesCardProps) {
  const [customOpen, setCustomOpen] = React.useState(false);
  const [customRange, setCustomRange] = React.useState<{ from?: Date; to?: Date }>(() => ({
    from: range.start,
    to: range.end,
  }));

  React.useEffect(() => {
    if (range.preset === 'custom') {
      setCustomRange({ from: range.start, to: range.end });
    }
  }, [range.preset, range.start, range.end]);

  const handleSelectCustom = (from: Date | undefined, to: Date | undefined) => {
    if (from && to) {
      setCustomRange({ from, to });
      onCustomRangeChange(from, to);
      setCustomOpen(false);
    } else if (from) {
      setCustomRange({ from, to: from });
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-4 transition-all after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-gradient-to-r after:from-primary/60 after:via-primary/20 after:to-transparent">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Total expenses
        </span>
        <div className="flex items-center gap-1.5">
          <Select
            value={range.preset}
            onValueChange={(v) => onPresetChange(v as DateRangePreset)}
          >
            <SelectTrigger className="h-8 w-[110px] text-xs rounded-lg border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {range.preset === 'custom' && (
            <Popover open={customOpen} onOpenChange={setCustomOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg">
                  <CalendarIcon className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={{ from: customRange.from, to: customRange.to }}
                  onSelect={(sel) => handleSelectCustom(sel?.from, sel?.to)}
                  numberOfMonths={1}
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-xl font-bold tracking-tight text-foreground">
          {isEmpty ? '—' : `KES ${totalAmount.toLocaleString()}`}
        </span>
      </div>
      <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
        Based on logged expenses
      </p>
    </div>
  );
}

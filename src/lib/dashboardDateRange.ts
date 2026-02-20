import { startOfDay, endOfDay, subDays, startOfWeek, endOfWeek } from 'date-fns';

export type DateRangePreset = 'today' | 'yesterday' | 'last7' | 'custom';

export interface DateRangeResult {
  start: Date;
  end: Date;
  preset: DateRangePreset;
  label: string;
}

export function getDateRange(
  preset: DateRangePreset,
  customStart?: Date,
  customEnd?: Date
): DateRangeResult {
  const now = new Date();

  switch (preset) {
    case 'today': {
      const start = startOfDay(now);
      const end = endOfDay(now);
      return { start, end, preset, label: 'Today' };
    }
    case 'yesterday': {
      const yesterday = subDays(now, 1);
      const start = startOfDay(yesterday);
      const end = endOfDay(yesterday);
      return { start, end, preset, label: 'Yesterday' };
    }
    case 'last7': {
      const start = startOfDay(subDays(now, 6));
      const end = endOfDay(now);
      return { start, end, preset, label: 'Last 7 days' };
    }
    case 'custom': {
      const start = customStart ? startOfDay(customStart) : startOfDay(now);
      const end = customEnd ? endOfDay(customEnd) : endOfDay(now);
      const label =
        customStart && customEnd
          ? `${customStart.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })} – ${customEnd.toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' })}`
          : 'Custom';
      return { start, end, preset, label };
    }
    default:
      return getDateRange('today');
  }
}

export function isDateInRange(date: Date | null, start: Date, end: Date): boolean {
  if (!date) return false;
  const t = date.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

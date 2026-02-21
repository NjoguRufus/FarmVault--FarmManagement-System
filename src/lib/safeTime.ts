type TimestampLike = {
  toDate?: () => Date;
};

export function safeToDate(input: unknown): Date | null {
  if (input == null) return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }

  if (typeof input === 'number') {
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof input === 'string') {
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const ts = input as TimestampLike;
  if (typeof ts?.toDate === 'function') {
    const parsed = ts.toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

export function safeFormatDate(input: unknown): string {
  const date = safeToDate(input);
  if (!date) return '—';
  return date.toLocaleDateString();
}

export function getSortTime(input: unknown): number {
  const date = safeToDate(input);
  return date ? date.getTime() : 0;
}

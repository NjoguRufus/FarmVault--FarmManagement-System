export function formatDevDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

export function formatDevDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return String(iso);
  }
}

export function formatMoney(n: unknown, currency = 'KES'): string {
  const num = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(num)) return '—';
  return `${currency} ${num.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

export function formatNumber(n: unknown, digits = 0): string {
  const num = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(num)) return '—';
  return num.toLocaleString('en-US', { maximumFractionDigits: digits });
}

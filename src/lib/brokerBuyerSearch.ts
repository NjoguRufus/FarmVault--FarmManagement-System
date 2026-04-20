function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

/** Client-side filter for broker buyer list: name, phone digits, or entry # substring. */
export function brokerBuyerSearchMatches(
  row: {
    buyer_label: string | null;
    buyer_phone?: string | null;
    entry_number: number;
  },
  rawQuery: string,
): boolean {
  const q = rawQuery.trim();
  if (!q) return true;
  const lower = q.toLowerCase();
  const name = (row.buyer_label ?? '').toLowerCase();
  if (name.includes(lower)) return true;
  const phone = row.buyer_phone ?? '';
  if (phone.toLowerCase().includes(lower)) return true;
  const dq = digitsOnly(q);
  if (dq.length >= 2 && digitsOnly(phone).includes(dq)) return true;
  const numQ = q.replace(/\s/g, '');
  if (numQ.length > 0 && String(row.entry_number).includes(numQ)) return true;
  return false;
}

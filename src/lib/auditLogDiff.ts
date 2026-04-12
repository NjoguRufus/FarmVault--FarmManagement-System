export type AuditDiffEntry = {
  field: string;
  oldDisplay: string;
  newDisplay: string;
};

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Shallow diff of old_data vs new_data; only keys whose serialized values differ. */
export function computeAuditDiff(
  oldData: Record<string, unknown> | null | undefined,
  newData: Record<string, unknown> | null | undefined,
): AuditDiffEntry[] {
  const oldObj = oldData && typeof oldData === 'object' && !Array.isArray(oldData) ? oldData : {};
  const newObj = newData && typeof newData === 'object' && !Array.isArray(newData) ? newData : {};
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const out: AuditDiffEntry[] = [];
  for (const field of keys) {
    const o = oldObj[field];
    const n = newObj[field];
    const os = formatAuditValue(o);
    const ns = formatAuditValue(n);
    if (os === ns) continue;
    out.push({ field, oldDisplay: os, newDisplay: ns });
  }
  return out.sort((a, b) => a.field.localeCompare(b.field));
}

/** Plain-text lines for tooltips, exports, or compact logs. */
export function formatAuditDiffLines(entries: AuditDiffEntry[]): string[] {
  return entries.map((e) => `${e.field}: ${e.oldDisplay} → ${e.newDisplay}`);
}

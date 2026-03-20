import { toOrdinal } from '@/lib/ordinal';

/**
 * Fixed base label for project harvest collection auto-naming.
 */
export function normalizeHarvestBaseName(baseName: string | null | undefined): string {
  const name = (baseName ?? '').trim();
  if (!name) return '';
  return name.replace(/\s+/g, ' ').trim();
}

/**
 * Build auto name:
 *   [BaseName] [Ordinal] Harvest
 * Fallback:
 *   Harvest [Ordinal]
 */
export function buildHarvestCollectionAutoName(params: {
  baseName: string | null | undefined;
  sequenceNumber: number;
}): string {
  const base = normalizeHarvestBaseName(params.baseName);
  const ordinal = toOrdinal(params.sequenceNumber);
  if (!base) return `Harvest ${ordinal}`.trim();
  return `${base} ${ordinal} Harvest`.trim();
}


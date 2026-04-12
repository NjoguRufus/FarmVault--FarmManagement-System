import type { PostgrestError } from '@supabase/supabase-js';

/** User-facing copy for optimistic concurrency failures (matches product tone). */
export const CONCURRENT_UPDATE_MESSAGE =
  'This data was updated by someone else. Please refresh and try again.';

export class ConcurrentUpdateConflictError extends Error {
  readonly code = 'CONCURRENT_UPDATE_CONFLICT';

  constructor(message: string = CONCURRENT_UPDATE_MESSAGE) {
    super(message);
    this.name = 'ConcurrentUpdateConflictError';
  }
}

export function isConcurrentUpdateConflict(e: unknown): boolean {
  return e instanceof ConcurrentUpdateConflictError;
}

/**
 * PostgREST update with `.select()` returns the updated rows. Empty array + no error
 * means zero rows matched filters (e.g. stale row_version).
 */
export function throwIfUpdateReturnedNoRows<T>(data: T[] | null, error: PostgrestError | null): void {
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new ConcurrentUpdateConflictError();
  }
}

/**
 * Retry scheduling with exponential backoff + jitter.
 * Used by the sync engine when a queue item fails.
 */

const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 120_000;

/** Returns the milliseconds to wait before the next attempt. */
export function backoffDelayMs(attemptCount: number): number {
  const exp = Math.min(attemptCount, 6);
  const base = BASE_DELAY_MS * 2 ** exp;
  const jitter = Math.random() * base * 0.2;
  return Math.min(base + jitter, MAX_DELAY_MS);
}

/** Returns the absolute timestamp (ms) for the next retry. */
export function nextRetryAt(attemptCount: number): number {
  return Date.now() + backoffDelayMs(attemptCount);
}

/** True when this item should be retried (not a permanent failure). */
export function isRetryable(attemptCount: number, maxRetries: number): boolean {
  return attemptCount < maxRetries;
}

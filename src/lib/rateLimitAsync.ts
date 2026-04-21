type AsyncFn<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>;

export type RateLimitAsyncOptions = {
  /**
   * Minimum time between *network* executions.
   * Calls inside this window return the last resolved result (if any),
   * otherwise they dedupe to the in-flight request.
   */
  minIntervalMs: number;
};

/**
 * Client-side rate limiter for async functions.
 *
 * Guarantees:
 * - **Dedupe**: concurrent calls share one in-flight promise.
 * - **Throttle**: if called again within `minIntervalMs`, returns the last resolved result (if available)
 *   without re-hitting the network.
 *
 * Notes:
 * - This is an in-memory guard (per tab). It complements React Query caching.
 * - If the last call failed, a subsequent call is allowed immediately (no "error caching").
 */
export function rateLimitAsync<TArgs extends unknown[], TResult>(
  fn: AsyncFn<TArgs, TResult>,
  { minIntervalMs }: RateLimitAsyncOptions,
): AsyncFn<TArgs, TResult> {
  let inFlight: Promise<TResult> | null = null;
  let lastSuccessAt = 0;
  let lastSuccessValue: TResult | undefined;
  let hasSuccessValue = false;

  return async (...args: TArgs) => {
    const now = Date.now();

    // If a request is already running, reuse it.
    if (inFlight) return inFlight;

    // If we have a recent successful value, serve it without hitting network.
    if (hasSuccessValue && now - lastSuccessAt < minIntervalMs) {
      return lastSuccessValue as TResult;
    }

    inFlight = fn(...args)
      .then((res) => {
        lastSuccessAt = Date.now();
        lastSuccessValue = res;
        hasSuccessValue = true;
        return res;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };
}


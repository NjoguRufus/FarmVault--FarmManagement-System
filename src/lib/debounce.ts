/**
 * Trailing debounce — coalesces rapid calls (e.g. Supabase realtime bursts) into one invocation.
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): ((...args: Args) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };

  const out = debounced as typeof debounced & { cancel: () => void };
  out.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  return out;
}

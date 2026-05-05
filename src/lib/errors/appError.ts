/**
 * Centralized error types and logging for FarmVault.
 *
 * Rules:
 * - NEVER use empty catch{} blocks — always call logError or re-throw.
 * - logError always writes to console.error regardless of environment.
 * - In production this is the hook point for Sentry / PostHog error capture.
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

export interface ErrorLogContext {
  operation: string;
  userId?: string | null;
  companyId?: string | null;
  [key: string]: unknown;
}

/**
 * Log an error unconditionally (not gated by DEV).
 * Replace the body with a Sentry/PostHog call in production deployments.
 */
export function logError(error: unknown, ctx: ErrorLogContext): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const code = error instanceof AppError ? error.code : 'UNKNOWN';

  // Always emit — not gated by import.meta.env.DEV
  // eslint-disable-next-line no-console
  console.error(
    `[FarmVault] ${ctx.operation} failed [${code}]: ${message}`,
    { context: ctx, stack },
  );

  // TODO: wire up Sentry or PostHog in production:
  // if (typeof window !== 'undefined' && window.__SENTRY__) {
  //   Sentry.captureException(error, { extra: ctx });
  // }
}

/**
 * Wrap an async operation so any thrown error is logged before being re-thrown.
 * Use this for critical paths (auth bootstrap, employee creation) to ensure
 * no error is ever silently swallowed.
 */
export async function withLogging<T>(
  operation: string,
  fn: () => Promise<T>,
  ctx?: Omit<ErrorLogContext, 'operation'>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logError(error, { operation, ...ctx });
    throw error;
  }
}

/**
 * Same as withLogging but returns null on failure instead of re-throwing.
 * Use for non-critical background paths where the caller already handles null.
 */
export async function withLoggingOrNull<T>(
  operation: string,
  fn: () => Promise<T>,
  ctx?: Omit<ErrorLogContext, 'operation'>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    logError(error, { operation, ...ctx });
    return null;
  }
}

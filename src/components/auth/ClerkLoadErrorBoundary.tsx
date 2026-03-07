/**
 * Catches Clerk JS load failures (e.g. CORS, failed_to_load_clerk_js) so the app
 * does not freeze. Shows fallback UI with link to emergency access.
 */
import React, { Component, type ErrorInfo, type ReactNode } from "react";

/** Explicit detection for Clerk JS load failures so we can show fallback UI instead of blank page. */
export const CLERK_FAILURE_PATTERNS = [
  "failed_to_load_clerk_js",
  "clerk",
  "Clerk",
  "loadScript",
  "loadScriptUrl",
  "fetch",
  "CORS",
  "NetworkError",
  "Failed to fetch",
  "Loading chunk",
] as const;

export function isClerkLoadFailure(error: Error): boolean {
  const message = (error?.message ?? "").toLowerCase();
  const stack = (error?.stack ?? "").toLowerCase();
  const combined = `${message} ${stack}`;
  return CLERK_FAILURE_PATTERNS.some(
    (p) => combined.includes(p.toLowerCase())
  );
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ClerkLoadErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[Clerk Load Failure]", error, errorInfo?.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      const error = this.state.error;
      const showClerkFallback =
        isClerkLoadFailure(error) || true; /* treat any boundary error as auth-related when wrapping Clerk tree */

      return (
        <div
          className="min-h-screen flex items-center justify-center bg-background p-4"
          data-farmvault-fallback="clerk-load-failed"
        >
          <div className="w-full max-w-md text-center space-y-6">
            <div className="flex justify-center">
              <img
                src="/Logo/FarmVault_Logo dark mode.png"
                alt="FarmVault"
                className="h-14 w-auto object-contain"
              />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-semibold text-foreground">
                {showClerkFallback
                  ? "Authentication service temporarily unavailable"
                  : "Something went wrong"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {showClerkFallback
                  ? "Sign-in could not load. Use emergency access to continue farm operations, or try again later."
                  : "An unexpected error occurred. Try reloading or use emergency access."}
              </p>
              {import.meta.env.DEV && error && (
                <pre className="mt-4 text-left text-xs bg-muted p-3 rounded-md overflow-auto max-h-32">
                  {error.toString()}
                </pre>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <a
                href="/emergency-access"
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Use emergency access
              </a>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="text-sm text-muted-foreground hover:text-foreground underline"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

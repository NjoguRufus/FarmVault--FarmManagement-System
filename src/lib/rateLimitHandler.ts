/**
 * FarmVault — Rate Limit & Feature Restriction Handler
 *
 * Usage pattern (call BEFORE the Supabase insert):
 *
 *   const ok = await checkRateLimit('projects_create');
 *   if (!ok) return;          // toast already shown; abort
 *   await supabase.from('projects').insert(...);
 *
 * For feature limit checks (project/employee/picker counts):
 *   use the useFeatureLimits() hook or handleInsertError() for DB-side errors.
 */

import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RateLimitAction =
  | "projects_create"
  | "harvest_collection_create"
  | "harvest_picker_add"
  | "expenses_create"
  | "inventory_create"
  | "records_create"
  | "season_challenges_create"
  | "suppliers_create";

export type FarmPlan = "basic" | "pro";

export interface FeatureLimits {
  maxProjects:        number | null;   // null = unlimited
  maxEmployees:       number | null;
  maxPickersRoster:   number | null;   // company-wide picker roster cap
}

// ---------------------------------------------------------------------------
// Per-plan feature limits (mirrors the DB migration)
// ---------------------------------------------------------------------------

export const PLAN_FEATURE_LIMITS: Record<FarmPlan, FeatureLimits> = {
  basic: {
    maxProjects:      2,
    maxEmployees:     2,
    maxPickersRoster: 50,
  },
  pro: {
    maxProjects:      null,
    maxEmployees:     null,
    maxPickersRoster: null,
  },
};

// ---------------------------------------------------------------------------
// Per-plan rate limits per minute (mirrors get_rate_limit_for_action() in DB)
// ---------------------------------------------------------------------------

export const RATE_LIMITS: Record<RateLimitAction, Record<FarmPlan, number>> = {
  projects_create:           { basic:  20, pro: 100 },
  harvest_collection_create: { basic:  10, pro:  40 },
  harvest_picker_add:        { basic:  30, pro: 120 },
  expenses_create:           { basic:  40, pro: 120 },
  inventory_create:          { basic:  30, pro: 100 },
  records_create:            { basic:  50, pro: 150 },
  season_challenges_create:  { basic:  10, pro:  40 },
  suppliers_create:          { basic:   5, pro:  20 },
};

// ---------------------------------------------------------------------------
// checkRateLimit — pre-flight gate via Edge Function
//
// Returns true  → proceed with the DB insert
// Returns false → rate limit hit (toast already fired); abort the insert
// ---------------------------------------------------------------------------

export async function checkRateLimit(action: RateLimitAction): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const response = await fetch(
      `${supabaseUrl}/functions/v1/rate-limit-check`,
      {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action }),
      },
    );

    if (response.status === 429) {
      const data = await response.json();
      toast.error("Too many requests", {
        description: data.message ?? "You're doing this too fast. Please wait a moment.",
      });
      return false;
    }

    if (!response.ok) {
      // Non-429 errors → fail-open (don't block the user)
      console.warn("[rateLimitHandler] Edge Function returned", response.status);
      return true;
    }

    return true;
  } catch (err) {
    // Network error or Edge Function offline → fail-open
    console.warn("[rateLimitHandler] checkRateLimit failed:", err);
    return true;
  }
}

// ---------------------------------------------------------------------------
// handleInsertError — parses errors thrown by Supabase inserts
//
// The DB-side RESTRICTIVE RLS policies raise a PostgreSQL permission-denied
// error (code 42501) when a rate limit or feature limit is exceeded.
//
// Returns true if the error was handled (and a toast was shown), false otherwise.
// ---------------------------------------------------------------------------

export function handleInsertError(error: unknown, context?: string): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);

  const lower = message.toLowerCase();

  // RLS / permission denied → almost certainly a limit was hit
  if (
    lower.includes("new row violates row-level security") ||
    lower.includes("permission denied") ||
    lower.includes("42501")
  ) {
    toast.error("Action blocked", {
      description:
        context
          ? `Could not create ${context}. You may have reached your plan limit.`
          : "You may have reached your plan limit.",
      action: {
        label: "Upgrade to PRO",
        onClick: () => (window.location.href = "/settings/billing"),
      },
    });
    return true;
  }

  // Explicit rate-limit keyword (edge function error forwarded to client)
  if (lower.includes("rate limit") || lower.includes("too fast")) {
    toast.error("Too many requests", {
      description: "You're doing this too fast. Please wait a moment.",
    });
    return true;
  }

  // Feature-limit keywords
  if (
    lower.includes("maximum") ||
    lower.includes("limit reached") ||
    lower.includes("upgrade")
  ) {
    toast.error("Plan limit reached", {
      description: message,
      action: {
        label: "Upgrade to PRO",
        onClick: () => (window.location.href = "/settings/billing"),
      },
    });
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// getUserPlan — fetches the current user's plan from DB
// get_user_plan() takes no arguments — resolves via current session context.
// ---------------------------------------------------------------------------

export async function getUserPlan(): Promise<FarmPlan> {
  try {
    const { data, error } = await supabase.rpc("get_user_plan");
    if (error || !data) return "basic";
    return data === "pro" ? "pro" : "basic";
  } catch {
    return "basic";
  }
}

// ---------------------------------------------------------------------------
// isFeatureBlocked — checks whether a feature is unavailable on the given plan
//
// Example:
//   const blocked = isFeatureBlocked('maxProjects', plan, currentCount);
//   if (blocked) { showUpgradeCTA(); return; }
// ---------------------------------------------------------------------------

export function isFeatureBlocked(
  feature: keyof FeatureLimits,
  plan: FarmPlan,
  currentCount: number,
): boolean {
  const limit = PLAN_FEATURE_LIMITS[plan][feature];
  if (limit === null) return false;           // unlimited on this plan
  return currentCount >= limit;
}

// ---------------------------------------------------------------------------
// withRateLimit — higher-order helper for async action handlers
//
// Wraps an async function with a rate-limit pre-check.
//
// Usage:
//   const createProject = withRateLimit('projects_create', async () => {
//     await supabase.from('projects').insert({ ... });
//   });
//   <button onClick={createProject} />
// ---------------------------------------------------------------------------

export function withRateLimit<T>(
  action: RateLimitAction,
  fn: () => Promise<T>,
): () => Promise<T | undefined> {
  return async (): Promise<T | undefined> => {
    const ok = await checkRateLimit(action);
    if (!ok) return undefined;
    return fn();
  };
}

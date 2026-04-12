/**
 * FarmVault Edge Function: rate-limit-check
 *
 * Pre-flight gate called by the frontend BEFORE any DB insert.
 * Resolves the caller's Clerk identity, looks up their plan via
 * company_members → company_subscriptions (no session context needed),
 * then calls check_rate_limit.
 *
 * POST /functions/v1/rate-limit-check
 * Body: { action: RateLimitAction }
 *
 * 200 → { allowed: true,  plan: 'basic' | 'pro' }
 * 429 → { error: 'Rate limit exceeded', message: '...' }
 * 401 → { error: 'Unauthorized' }
 * 400 → { error: 'Bad Request', message: '...' }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serveFarmVaultEdge } from "../_shared/withEdgeLogging.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Plan = "basic" | "pro";

type RateLimitAction =
  | "projects_create"
  | "harvest_collection_create"
  | "harvest_picker_add"
  | "expenses_create"
  | "inventory_create"
  | "records_create"
  | "season_challenges_create"
  | "suppliers_create";

interface ActionLimits { basic: number; pro: number }

// Per-plan per-minute caps — keep in sync with get_rate_limit_for_action() in SQL
const RATE_LIMITS: Record<RateLimitAction, ActionLimits> = {
  projects_create:           { basic:  20, pro: 100 },
  harvest_collection_create: { basic:  10, pro:  40 },
  harvest_picker_add:        { basic:  30, pro: 120 },
  expenses_create:           { basic:  40, pro: 120 },
  inventory_create:          { basic:  30, pro: 100 },
  records_create:            { basic:  50, pro: 150 },
  season_challenges_create:  { basic:  10, pro:  40 },
  suppliers_create:          { basic:   5, pro:  20 },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Decode Clerk user ID from the JWT payload (no signature verification needed
// — Supabase already validated the token before reaching this function).
// ---------------------------------------------------------------------------

function extractClerkUserId(token: string): string | null {
  try {
    const b64 = token.split(".")[1];
    const payload = JSON.parse(atob(b64.replace(/-/g, "+").replace(/_/g, "/")));
    return (
      (payload["user_id"] as string | undefined)?.trim() ||
      (payload["sub"]     as string | undefined)?.trim() ||
      null
    );
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Resolve plan for a Clerk user ID using the service-role client.
// Goes through core.company_members (clerk_user_id) → company_subscriptions.
// Falls back to public.profiles if company_members has no match.
// Returns 'basic' on any failure (fail-open for plan resolution).
// ---------------------------------------------------------------------------

async function resolvePlan(
  adminClient: ReturnType<typeof createClient>,
  clerkUserId: string,
): Promise<Plan> {
  try {
    // 1. Look up company_id from core.company_members (most reliable path)
    let companyId: string | null = null;

    const { data: member } = await adminClient
      .schema("core")
      .from("company_members")
      .select("company_id")
      .eq("clerk_user_id", clerkUserId)
      .limit(1)
      .maybeSingle();

    if (member?.company_id) {
      companyId = String(member.company_id);
    }

    // 2. Fallback: check public.company_members if it exists
    if (!companyId) {
      const { data: pubMember } = await adminClient
        .from("company_members")
        .select("company_id")
        .eq("clerk_user_id", clerkUserId)
        .limit(1)
        .maybeSingle();
      if (pubMember?.company_id) {
        companyId = String(pubMember.company_id);
      }
    }

    if (!companyId) {
      return "basic";
    }

    // 3. Resolve plan from company_subscriptions
    const { data: sub } = await adminClient
      .from("company_subscriptions")
      .select("plan_code, plan_id, plan")
      .filter("company_id::text", "eq", companyId)
      .limit(1)
      .maybeSingle();

    const raw =
      (sub?.plan_code as string | undefined)?.trim() ||
      (sub?.plan_id   as string | undefined)?.trim() ||
      (sub?.plan      as string | undefined)?.trim() ||
      "";

    return raw === "pro" ? "pro" : "basic";
  } catch (err) {
    console.warn("[rate-limit-check] resolvePlan error:", err);
    return "basic";
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serveFarmVaultEdge("rate-limit-check", async (req: Request, _ctx): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── 1. Authenticate ─────────────────────────────────────────────────────

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Unauthorized", message: "Missing Authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Verify JWT via the user-scoped client
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return json({ error: "Unauthorized", message: userError?.message ?? "Invalid token" }, 401);
  }

  // ── 2. Extract Clerk user ID from JWT ───────────────────────────────────

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const clerkUserId = extractClerkUserId(token) ?? user.id; // last resort: Supabase uid

  if (!clerkUserId) {
    return json({ error: "Unauthorized", message: "Could not resolve user identity" }, 401);
  }

  // ── 3. Parse & validate request body ───────────────────────────────────

  let action: RateLimitAction;
  try {
    const body = await req.json();
    action = body?.action;
  } catch {
    return json({ error: "Bad Request", message: "Body must be valid JSON" }, 400);
  }

  if (!action || !(action in RATE_LIMITS)) {
    return json({
      error: "Bad Request",
      message: `Unknown action. Valid: ${Object.keys(RATE_LIMITS).join(", ")}`,
    }, 400);
  }

  // ── 4. Resolve plan + compute limit ────────────────────────────────────

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const plan       = await resolvePlan(adminClient, clerkUserId);
  const limitCount = RATE_LIMITS[action][plan];

  // ── 5. Check (and record) rate limit ───────────────────────────────────

  const { data: allowed, error: rlError } = await adminClient.rpc("check_rate_limit", {
    p_user_id:          clerkUserId,
    p_action:           action,
    p_limit_count:      limitCount,
    p_time_window_secs: 60,
  });

  if (rlError) {
    console.error("[rate-limit-check] check_rate_limit error:", rlError);
    return json({ allowed: true, plan }); // fail-open on internal error
  }

  // ── 6. Respond ──────────────────────────────────────────────────────────

  if (!allowed) {
    return json({
      error:   "Rate limit exceeded",
      message: "You're doing this too fast. Please wait a moment.",
      action,
      plan,
      limit: limitCount,
    }, 429);
  }

  return json({ allowed: true, plan, action });
});

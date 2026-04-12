// Upsert or remove Web Push subscription for the signed-in Clerk user (Bearer JWT).
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
//
// Body JSON:
//   { "subscription": { "endpoint", "keys": { "p256dh", "auth" } } }  — upsert
//   { "removeEndpoint": "https://..." }  — delete this device
//
// Deploy: npx supabase functions deploy sync-push-subscription --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clerkUserIdFromAuth } from "../_shared/clerkSubFromAuth.ts";
import { serveFarmVaultEdge } from "../_shared/withEdgeLogging.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isSubscription(
  x: unknown,
): x is { endpoint: string; keys: { p256dh: string; auth: string } } {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const keys = o.keys as Record<string, unknown> | undefined;
  return (
    typeof o.endpoint === "string" &&
    !!keys &&
    typeof keys.p256dh === "string" &&
    typeof keys.auth === "string"
  );
}

serveFarmVaultEdge("sync-push-subscription", async (req: Request, _ctx) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: "Server misconfiguration" }, 500);
  }

  const clerkUserId = await clerkUserIdFromAuth(
    req.headers.get("Authorization"),
    supabaseUrl,
    anonKey,
  );
  if (!clerkUserId) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const removeEndpoint = typeof body.removeEndpoint === "string" ? body.removeEndpoint.trim() : "";
  if (removeEndpoint) {
    const { error } = await admin
      .from("push_subscriptions")
      .delete()
      .eq("clerk_user_id", clerkUserId)
      .eq("endpoint", removeEndpoint);
    if (error) {
      return json({ error: "Delete failed", detail: error.message }, 500);
    }
    return json({ ok: true, removed: true });
  }

  if (!isSubscription(body.subscription)) {
    return json({ error: "Expected subscription object or removeEndpoint" }, 400);
  }

  const sub = body.subscription;
  const companyId =
    typeof body.company_id === "string" && body.company_id.trim().length > 0
      ? body.company_id.trim()
      : null;
  const role =
    typeof body.role === "string" && body.role.trim().length > 0 ? body.role.trim() : null;
  const deviceInfo =
    body.device_info != null && typeof body.device_info === "object" && !Array.isArray(body.device_info)
      ? body.device_info
      : null;

  const row = {
    clerk_user_id: clerkUserId,
    endpoint: sub.endpoint,
    subscription_json: sub,
    updated_at: new Date().toISOString(),
    company_id: companyId,
    role,
    device_info: deviceInfo,
  };

  const { error } = await admin.from("push_subscriptions").upsert(row, {
    onConflict: "endpoint",
  });
  if (error) {
    return json({ error: "Upsert failed", detail: error.message }, 500);
  }
  return json({ ok: true });
});

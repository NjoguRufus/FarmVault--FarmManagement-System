// Invoked after INSERT on public.notifications (DB trigger + pg_net) or manually with shared secret.
// Sends Web Push to the recipient's registered endpoints via VAPID.
//
// Auth: Authorization: Bearer <NOTIFICATION_PUSH_SECRET>
// Body: { "notification_id": "<uuid>" }
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NOTIFICATION_PUSH_SECRET,
//          VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, optional VAPID_CONTACT
//
// Deploy: npx supabase functions deploy notification-push-dispatch --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isWebPushConfigured, sendWebPushToClerkUser } from "../_shared/webPushSend.ts";
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

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

function mapTypeToPushKind(
  t: string,
): "inventory_alert" | "system_alert" | "weekly_summary" | "morning_message" | "evening_message" {
  const x = t.toLowerCase();
  if (x === "developer") return "system_alert";
  if (x === "ambassador") return "system_alert";
  return "inventory_alert";
}

serveFarmVaultEdge("notification-push-dispatch", async (req: Request, _ctx) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const expected = Deno.env.get("NOTIFICATION_PUSH_SECRET")?.trim();
  const auth = req.headers.get("Authorization")?.trim() ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!expected || bearer !== expected) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!isWebPushConfigured()) {
    return json({ ok: true, skipped: true, reason: "vapid_not_configured" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Server misconfiguration" }, 500);
  }

  let body: { notification_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const rawId = typeof body.notification_id === "string" ? body.notification_id.trim() : "";
  if (!rawId || !isUuid(rawId)) {
    return json({ error: "Missing or invalid notification_id" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: row, error } = await admin
    .from("notifications")
    .select("id, clerk_user_id, title, message, type, click_url, group_key, read, created_at")
    .eq("id", rawId)
    .maybeSingle();

  if (error || !row) {
    return json({ error: "Notification not found" }, 404);
  }

  const r = row as {
    clerk_user_id: string;
    title: string;
    message: string | null;
    type: string;
    click_url: string | null;
    group_key: string | null;
    read: boolean;
    created_at: string;
  };

  if (r.read) {
    return json({ ok: true, skipped: true, reason: "already_read" });
  }

  const uid = String(r.clerk_user_id ?? "").trim();
  if (!uid) {
    return json({ error: "Invalid row" }, 400);
  }

  const path = (() => {
    const u = r.click_url?.trim() ?? "";
    if (u.startsWith("/")) return u;
    return "/dashboard";
  })();

  const title = r.title?.trim() || "FarmVault";
  const bodyText = (r.message ?? "").trim() || "You have a new update.";
  const pushType = mapTypeToPushKind(r.type);
  const tag = (r.group_key?.trim() || `notification-${r.id}`).slice(0, 64);
  const ts = Math.floor(new Date(r.created_at).getTime() / 1000);

  const result = await sendWebPushToClerkUser(admin, uid, {
    title,
    body: bodyText,
    url: path,
    type: pushType,
    tag,
    notification_id: r.id,
    ts,
    notification_type: r.type,
  });

  return json({
    ok: true,
    delivered: result.delivered,
    attempts: result.attempts,
    pruned: result.pruned,
  });
});

// After an admin_alerts row is created, fan out Web Push to company recipients with push enabled.
//
// Body: { "alertId": "<uuid>" }
// Auth: Bearer Clerk JWT (caller must be a member of the alert's company).
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, optional VAPID_CONTACT
//
// Deploy: npx supabase functions deploy admin-alert-push-notify --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clerkUserIdFromAuth } from "../_shared/clerkSubFromAuth.ts";
import { isWebPushConfigured, sendWebPushToClerkUser } from "../_shared/webPushSend.ts";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!isWebPushConfigured()) {
    return json({ ok: true, skipped: true, reason: "vapid_not_configured" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: "Server misconfiguration" }, 500);
  }

  const callerId = await clerkUserIdFromAuth(req.headers.get("Authorization"), supabaseUrl, anonKey);
  if (!callerId) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { alertId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const alertId = typeof body.alertId === "string" ? body.alertId.trim() : "";
  if (!alertId) {
    return json({ error: "Missing alertId" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: alertRow, error: alertErr } = await admin
    .from("admin_alerts")
    .select("id, company_id, module, action, target_label, detail_path, severity")
    .eq("id", alertId)
    .maybeSingle();

  if (alertErr || !alertRow) {
    return json({ error: "Alert not found" }, 404);
  }

  const companyId = String((alertRow as { company_id: string }).company_id ?? "").trim();
  if (!companyId) {
    return json({ error: "Invalid alert" }, 400);
  }

  const { data: callerMember, error: memErr } = await admin
    .schema("core")
    .from("company_members")
    .select("clerk_user_id")
    .eq("company_id", companyId)
    .eq("clerk_user_id", callerId)
    .maybeSingle();

  if (memErr || !callerMember) {
    return json({ error: "Forbidden" }, 403);
  }

  const { count: arCount, error: arCountErr } = await admin
    .from("alert_recipients")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);

  const hasRecipients = !arCountErr && (arCount ?? 0) > 0;

  let recipientIds: string[] = [];

  if (hasRecipients) {
    const { data: recRows, error: recErr } = await admin
      .from("alert_recipients")
      .select("clerk_user_id")
      .eq("company_id", companyId)
      .eq("receive_push", true);
    if (!recErr && recRows?.length) {
      recipientIds = (recRows as { clerk_user_id: string }[]).map((r) => r.clerk_user_id);
    }
  } else {
    const { data: members, error: mErr } = await admin
      .schema("core")
      .from("company_members")
      .select("clerk_user_id, role")
      .eq("company_id", companyId);
    if (!mErr && members?.length) {
      const rows = members as { clerk_user_id: string; role: string | null }[];
      recipientIds = rows
        .filter((m) => {
          const r = (m.role ?? "").toLowerCase().replace(/[-_\s]/g, "");
          return r !== "employee";
        })
        .map((m) => m.clerk_user_id);
    }
  }

  if (recipientIds.length > 0) {
    const { data: memForFilter } = await admin
      .schema("core")
      .from("company_members")
      .select("clerk_user_id, role")
      .eq("company_id", companyId)
      .in("clerk_user_id", recipientIds);
    const roleBy = new Map<string, string | null>();
    for (const m of (memForFilter ?? []) as { clerk_user_id: string; role: string | null }[]) {
      roleBy.set(m.clerk_user_id, m.role);
    }
    recipientIds = recipientIds.filter((id) => {
      const role = roleBy.get(id);
      const r = (role ?? "").toLowerCase().replace(/[-_\s]/g, "");
      return r !== "employee";
    });
  }

  if (recipientIds.length === 0) {
    return json({ ok: true, delivered: 0, recipients: 0 });
  }

  const { data: profiles } = await admin
    .schema("core")
    .from("profiles")
    .select("clerk_user_id, user_type")
    .in("clerk_user_id", recipientIds);

  const profileMap = new Map<string, string | null>();
  for (const p of (profiles ?? []) as { clerk_user_id: string; user_type: string | null }[]) {
    profileMap.set(p.clerk_user_id, p.user_type ?? null);
  }
  const filteredRecipients = recipientIds.filter((id) => {
    const ut = profileMap.get(id);
    return ut !== "ambassador";
  });

  const ar = alertRow as {
    module: string;
    action: string;
    target_label: string | null;
    detail_path: string | null;
  };
  const title = "FarmVault";
  const label = ar.target_label?.trim() || "Inventory";
  const bodyText = `${ar.module}: ${ar.action} — ${label}`;
  const url = ar.detail_path?.startsWith("/") ? ar.detail_path : "/dashboard";

  let delivered = 0;
  for (const uid of filteredRecipients) {
    const r = await sendWebPushToClerkUser(admin, uid, {
      title,
      body: bodyText,
      url,
      type: "inventory_alert",
      tag: `inventory-${alertId}`,
    });
    delivered += r.delivered;
  }

  return json({ ok: true, delivered, recipients: filteredRecipients.length });
});

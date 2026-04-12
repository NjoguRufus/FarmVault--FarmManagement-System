// Sends OneSignal notifications using role-based templates or custom payloads.
//
// Auth: Authorization: Bearer <ONESIGNAL_INTERNAL_NOTIFY_SECRET>
// Env: ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY, ONESIGNAL_INTERNAL_NOTIFY_SECRET
//
// Deploy: npx supabase functions deploy onesignal-notify --no-verify-jwt
import { isOneSignalConfigured, sendNotification } from "../_shared/oneSignal.ts";
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

type TemplateKey =
  | "payment_success_company"
  | "new_referral_ambassador"
  | "subscription_expiry_company"
  | "system_error_developer";

const templates: Record<TemplateKey, { role: "company" | "ambassador" | "developer"; heading: string; content: string }> = {
  payment_success_company: {
    role: "company",
    heading: "Payment Confirmed",
    content: "Your subscription is now active",
  },
  new_referral_ambassador: {
    role: "ambassador",
    heading: "New Referral",
    content: "You earned KES 600",
  },
  subscription_expiry_company: {
    role: "company",
    heading: "Subscription Expiring",
    content: "Your FarmVault plan expires soon",
  },
  system_error_developer: {
    role: "developer",
    heading: "System Alert",
    content: "Check logs",
  },
};

serveFarmVaultEdge("onesignal-notify", async (req: Request, _ctx) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("ONESIGNAL_INTERNAL_NOTIFY_SECRET")?.trim();
  const auth = req.headers.get("Authorization")?.trim() ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!expectedSecret || bearer !== expectedSecret) return json({ error: "Unauthorized" }, 401);

  if (!isOneSignalConfigured()) {
    return json({ ok: false, error: "OneSignal is not configured" }, 500);
  }

  let body: {
    template?: TemplateKey;
    headings?: Record<string, string>;
    contents?: Record<string, string>;
    filters?: Array<{ field: string; key?: string; relation?: string; value?: string }>;
    include_external_user_ids?: string[];
    data?: Record<string, unknown>;
    url?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  try {
    if (body.template && templates[body.template]) {
      const t = templates[body.template];
      const result = await sendNotification({
        headings: { en: t.heading },
        contents: { en: t.content },
        filters: [{ field: "tag", key: "role", relation: "=", value: t.role }],
      });
      return json({ ok: true, template: body.template, result });
    }

    if (!body.headings || !body.contents) {
      return json({ error: "Provide template OR headings + contents" }, 400);
    }

    const result = await sendNotification({
      headings: body.headings,
      contents: body.contents,
      filters: body.filters,
      include_external_user_ids: body.include_external_user_ids,
      data: body.data,
      url: body.url,
    });
    return json({ ok: true, result });
  } catch (error) {
    return json({ ok: false, error: (error as Error).message }, 500);
  }
});


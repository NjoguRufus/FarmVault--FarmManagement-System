// FarmVault Edge Function: create company + company-admin profile (Supabase onboarding).
// Requires: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serveFarmVaultEdge } from "../_shared/withEdgeLogging.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serveFarmVaultEdge("create-company", async (req: Request, _ctx) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const trialDaysEnv = Deno.env.get("TRIAL_DAYS");
    const trialDays = Number.isFinite(Number(trialDaysEnv)) && Number(trialDaysEnv) > 0
      ? Number(trialDaysEnv)
      : 7;

    const token = authHeader.replace("Bearer ", "").trim();

    // User-scoped client to verify JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", detail: userError?.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const {
      companyName,
      companyEmail,
      selectedPlan,
      billingMode,
      adminName,
      adminEmail,
    } = body as {
      companyName: string;
      companyEmail: string;
      selectedPlan: string | null;
      billingMode: string | null;
      adminName: string;
      adminEmail: string;
    };

    if (!companyName || !companyEmail || !adminEmail) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const planRaw = (selectedPlan || "").toString().toLowerCase().trim();
    let companyPlan: "basic" | "pro" | "enterprise" = "basic";
    if (planRaw === "enterprise") companyPlan = "enterprise";
    else if (planRaw === "pro" || planRaw === "professional") companyPlan = "pro";
    else if (planRaw === "basic" || planRaw === "starter") companyPlan = "basic";
    else companyPlan = "basic";

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    const companyId = crypto.randomUUID();

    const subscription = {
      plan: "trial",
      status: "active",
      trialStartAt: now.toISOString(),
      trialEndsAt: trialEndsAt.toISOString(),
      paidUntil: null as string | null,
      billingMode: (billingMode || "monthly") as string,
      override: {
        enabled: false,
        type: "custom",
        overrideEndsAt: null as string | null,
        reason: null as string | null,
        grantedBy: "",
        grantedAt: now.toISOString(),
      },
    };

    const { error: companyError } = await adminClient
      .from("companies")
      .insert({
        id: companyId,
        name: companyName.trim(),
        status: "active",
        plan: companyPlan,
        user_count: 1,
        project_count: 0,
        revenue: 0,
        subscription,
      });

    if (companyError) {
      return new Response(
        JSON.stringify({ error: "Failed to create company", detail: companyError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const profileName = (adminName && adminName.trim()) || adminEmail.trim();
    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert(
        {
          user_id: user.id,
          company_id: companyId,
          role: "company-admin",
          name: profileName,
          email: adminEmail.trim(),
        },
        { onConflict: "user_id" },
      );

    if (profileError) {
      return new Response(
        JSON.stringify({ error: "Company created but profile failed", detail: profileError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ companyId, userId: user.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});


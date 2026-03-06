// FarmVault Edge Function: Clerk-based company onboarding.
// Creates a company + company-admin profile in one step using a Clerk-issued JWT.
// Idempotent: if the caller already has a profile with company_id, returns that company_id.
// Requires env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, optional TRIAL_DAYS.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
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

    // Get Clerk user id from JWT sub claim (Clerk sends sub = user_xxx).
    let clerkUserId: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      clerkUserId = (payload.sub as string) ?? null;
    } catch {
      // fallback: try Supabase Auth if JWT is Supabase-issued
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser(token);
      clerkUserId = user?.id ?? null;
    }

    if (!clerkUserId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", detail: "Invalid or missing user in token" }),
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

    // Idempotency: if profile already has a company_id, return it instead of creating a new company.
    const { data: existingProfile, error: profileLookupError } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();

    if (profileLookupError) {
      return new Response(
        JSON.stringify({ error: "Failed to read profile", detail: profileLookupError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (existingProfile?.company_id) {
      return new Response(
        JSON.stringify({ companyId: existingProfile.company_id, userId: clerkUserId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const planRaw = (selectedPlan || "").toString();
    let companyPlan: "starter" | "professional" | "enterprise" = "starter";
    if (planRaw === "enterprise") companyPlan = "enterprise";
    else if (planRaw === "pro" || planRaw === "professional") companyPlan = "professional";
    else companyPlan = "starter"; // basic/pro default to starter, matching Firebase quirk

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

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

    const { data: companyRow, error: companyError } = await adminClient
      .from("companies")
      .insert({
        clerk_org_id: null,
        name: companyName.trim(),
        logo_url: null,
        created_by_clerk_user_id: clerkUserId,
      })
      .select("id")
      .single();

    if (companyError || !companyRow) {
      return new Response(
        JSON.stringify({ error: "Failed to create company", detail: companyError?.message ?? "Unknown error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const companyId = companyRow.id as string;

    const profileName = (adminName && adminName.trim()) || adminEmail.trim();
    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert(
        {
          clerk_user_id: clerkUserId,
          company_id: companyId,
          role: "company-admin",
          name: profileName,
          email: adminEmail.trim(),
          updated_at: now.toISOString(),
        },
        { onConflict: "clerk_user_id" },
      );

    if (profileError) {
      return new Response(
        JSON.stringify({ error: "Company created but profile failed", detail: profileError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ companyId, userId: clerkUserId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});


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

    const normalizedCompanyEmail = companyEmail.trim().toLowerCase();
    const normalizedAdminEmail = adminEmail.trim().toLowerCase();
    const normalizedPlan = ((selectedPlan || "basic").toString().toLowerCase() === "pro" ? "pro" : "basic");
    const normalizedBillingMode = "manual";
    const now = new Date();

    const { data: existingProfileEmail } = await adminClient
      .schema("core")
      .from("profiles")
      .select("clerk_user_id")
      .eq("email", normalizedAdminEmail)
      .maybeSingle();
    if (existingProfileEmail && existingProfileEmail.clerk_user_id !== clerkUserId) {
      return new Response(
        JSON.stringify({ error: "Email already exists", detail: "This admin email is already used by another account." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: companyRow, error: companyError } = await adminClient
      .from("companies")
      .insert({
        clerk_org_id: null,
        name: companyName.trim(),
        email: normalizedCompanyEmail,
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
          email: normalizedAdminEmail,
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

    await adminClient
      .from("company_subscriptions")
      .upsert({
        company_id: companyId,
        plan_id: normalizedPlan,
        plan_code: normalizedPlan,
        billing_mode: normalizedBillingMode,
        status: "pending_approval",
        approved_at: null,
        approved_by: null,
        rejection_reason: null,
        override_reason: null,
        updated_at: now.toISOString(),
      }, { onConflict: "company_id" });

    await adminClient.from("admin_alerts").insert({
      company_id: companyId,
      severity: "normal",
      module: "subscriptions",
      action: "COMPANY_PENDING_APPROVAL",
      actor_user_id: clerkUserId,
      actor_name: profileName,
      target_id: companyId,
      target_label: companyName.trim(),
      metadata: {
        company_name: companyName.trim(),
        owner_email: normalizedAdminEmail,
        selected_plan: normalizedPlan,
        created_at: now.toISOString(),
      },
      read: false,
    });

    const adminEmailTarget = Deno.env.get("DEVELOPER_ADMIN_EMAIL") || Deno.env.get("ADMIN_EMAIL");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (adminEmailTarget && resendApiKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "FarmVault <no-reply@farmvault.co.ke>",
          to: [adminEmailTarget],
          subject: `New company pending approval: ${companyName.trim()}`,
          html: `
            <p>A new company requires manual review.</p>
            <ul>
              <li><strong>Company:</strong> ${companyName.trim()}</li>
              <li><strong>Owner email:</strong> ${normalizedAdminEmail}</li>
              <li><strong>Selected plan:</strong> ${normalizedPlan}</li>
              <li><strong>Created:</strong> ${now.toISOString()}</li>
            </ul>
            <p>Please review and approve from Developer Dashboard → Companies.</p>
          `,
        }),
      });
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


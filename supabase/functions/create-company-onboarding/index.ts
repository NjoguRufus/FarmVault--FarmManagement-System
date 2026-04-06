// FarmVault Edge Function: Clerk-based company onboarding.
// Creates a company + company-admin profile in one step using a Clerk-issued JWT.
// Idempotent: if the caller already has a profile with company_id, returns that company_id.
// Requires env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, optional TRIAL_DAYS.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getFarmvaultDeveloperInboxEmail } from "../_shared/farmvaultDeveloperInbox.ts";
import { farmVaultEmailShell } from "../_shared/farmvault-email/farmVaultEmailShell.ts";
import { escapeHtml } from "../_shared/farmvault-email/escapeHtml.ts";

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

    const trimmedCompanyName = typeof companyName === "string" ? companyName.trim() : "";
    if (!trimmedCompanyName || trimmedCompanyName.length < 2 || !companyEmail || !adminEmail) {
      return new Response(
        JSON.stringify({
          error: "Missing or invalid fields",
          detail: "Company name (at least 2 characters), company email, and admin email are required.",
        }),
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
        name: trimmedCompanyName,
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
          full_name: profileName,
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
      target_label: trimmedCompanyName,
      metadata: {
        company_name: trimmedCompanyName,
        owner_email: normalizedAdminEmail,
        selected_plan: normalizedPlan,
        created_at: now.toISOString(),
      },
      read: false,
    });

    const adminEmailTarget = getFarmvaultDeveloperInboxEmail();
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (adminEmailTarget && resendApiKey) {
      const font = "Arial, Helvetica, sans-serif";
      const safeCompany = escapeHtml(trimmedCompanyName);
      const safeOwner = escapeHtml(normalizedAdminEmail);
      const safePlan = escapeHtml(normalizedPlan);
      const safeCreated = escapeHtml(now.toISOString());
      const adminHtml = farmVaultEmailShell({
        preheader: `New company pending approval: ${trimmedCompanyName}`,
        title: "New company pending approval",
        subtitle: "Manual review required in the developer console",
        content: `
<p style="margin:0 0 18px 0;font-family:${font};font-size:15px;line-height:1.7;color:#1f2937;">A new company requires manual review.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;border-collapse:collapse;">
  <tr><td style="padding:6px 0;font-family:${font};font-size:14px;color:#6b7280;width:140px;vertical-align:top;">Company</td><td style="padding:6px 0;font-family:${font};font-size:14px;color:#111827;font-weight:600;">${safeCompany}</td></tr>
  <tr><td style="padding:6px 0;font-family:${font};font-size:14px;color:#6b7280;vertical-align:top;">Owner email</td><td style="padding:6px 0;font-family:${font};font-size:14px;color:#111827;">${safeOwner}</td></tr>
  <tr><td style="padding:6px 0;font-family:${font};font-size:14px;color:#6b7280;vertical-align:top;">Selected plan</td><td style="padding:6px 0;font-family:${font};font-size:14px;color:#111827;">${safePlan}</td></tr>
  <tr><td style="padding:6px 0;font-family:${font};font-size:14px;color:#6b7280;vertical-align:top;">Created</td><td style="padding:6px 0;font-family:${font};font-size:14px;color:#111827;">${safeCreated}</td></tr>
</table>
<p style="margin:0;font-family:${font};font-size:15px;line-height:1.7;color:#1f2937;">Please review and approve from <strong>Developer Dashboard</strong> → <strong>Companies</strong>.</p>`,
      });
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "FarmVault <no-reply@farmvault.co.ke>",
          to: [adminEmailTarget],
          subject: `New company pending approval: ${trimmedCompanyName}`,
          html: adminHtml,
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


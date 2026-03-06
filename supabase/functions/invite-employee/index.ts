// FarmVault Edge Function: invite employee by email (Supabase Auth invite).
// Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Caller must be company-admin or developer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getRedirectTo(req: Request): string {
  const url = new URL(req.url);
  const host = url.host;
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
  if (isLocal) return "http://localhost:8080/auth/callback";
  return "https://farmvaultco.vercel.app/auth/callback";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? supabaseServiceKey;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "").trim();
    const {
      data: { user: caller },
      error: callerError,
    } = await supabaseAuth.auth.getUser(token);
    if (callerError || !caller) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", detail: callerError?.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile } = await admin
      .from("profiles")
      .select("company_id, role")
      .eq("user_id", caller.id)
      .single();

    if (!profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found. Contact admin." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isCompanyAdmin =
      profile.role === "company-admin" || profile.role === "company_admin";
    const isDeveloper = profile.role === "developer";
    if (!isCompanyAdmin && !isDeveloper) {
      return new Response(
        JSON.stringify({ error: "Only company admins or developers can invite employees." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companyId = profile.company_id;
    if (!companyId && !isDeveloper) {
      return new Response(
        JSON.stringify({ error: "Your account is not linked to a company." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const {
      email,
      name,
      role: employeeRole,
      department,
      phone,
      permissions,
      employee_role,
      company_id: bodyCompanyId,
    } = body as {
      email: string;
      name: string;
      role?: string | null;
      department?: string;
      phone?: string;
      permissions?: Record<string, unknown>;
      employee_role?: string | null;
      company_id?: string | null;
    };

    if (!email || typeof email !== "string" || !email.trim()) {
      return new Response(
        JSON.stringify({ error: "email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const effectiveCompanyId = companyId ?? bodyCompanyId ?? null;
    if (!effectiveCompanyId) {
      return new Response(
        JSON.stringify({ error: "company_id is required (caller has no company; pass company_id in body)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const redirectTo = getRedirectTo(req);

    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email.trim(),
      { redirectTo }
    );

    if (inviteError) {
      const msg = inviteError.message ?? "Invite failed";
      const status = msg.includes("already") ? 409 : 400;
      return new Response(
        JSON.stringify({ error: msg }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const invitedUser = inviteData?.user;
    if (!invitedUser?.id) {
      return new Response(
        JSON.stringify({ error: "Invite succeeded but no user id returned" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const appRole = employeeRole === "operations-manager" ? "manager"
      : employeeRole === "sales-broker" ? "broker"
      : employeeRole === "logistics-driver" ? "employee"
      : "employee";
    const roleForProfile = employeeRole ?? null;
    const permissionsPayload = permissions ?? null;

    await admin.from("profiles").upsert(
      {
        user_id: invitedUser.id,
        company_id: effectiveCompanyId,
        role: appRole,
        employee_role: roleForProfile,
        permissions: permissionsPayload,
        name: name?.trim() || email.trim(),
        email: email.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    const { error: empError } = await admin.from("employees").insert({
      company_id: effectiveCompanyId,
      auth_user_id: invitedUser.id,
      name: (name?.trim() || email.trim()) as string,
      email: email.trim(),
      department: department?.trim() || null,
      phone: phone?.trim() || null,
      contact: phone?.trim() || null,
      role: roleForProfile,
      employee_role: roleForProfile,
      permissions: permissionsPayload,
      status: "active",
      created_by: caller.id,
    });

    if (empError) {
      return new Response(
        JSON.stringify({ error: "Profile created but employee insert failed", detail: empError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, invited_user_id: invitedUser.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

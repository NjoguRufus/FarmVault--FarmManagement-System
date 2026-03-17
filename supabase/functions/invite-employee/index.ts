// FarmVault Edge Function: invite employee via Clerk (real invitation emails).
// Clerk = auth + invitations. Supabase = database only. No Supabase Auth.
//
// IMPORTANT: Deploy with JWT verification DISABLED so Supabase does not reject Clerk tokens:
//   supabase functions deploy invite-employee --no-verify-jwt
// This function verifies the Clerk session token itself via CLERK_SECRET_KEY + JWKS.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.2.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function log(msg: string, data?: unknown) {
  console.log(`[invite-employee] ${msg}`, data !== undefined ? JSON.stringify(data) : "");
}

function logErr(msg: string, err?: unknown) {
  console.error(`[invite-employee] ${msg}`, err !== undefined ? String(err) : "");
}

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

// Extract issuer (iss) from JWT without verification to determine the correct JWKS URL
function extractIssuerFromToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.iss ?? null;
  } catch {
    return null;
  }
}

// Verify Clerk session JWT via JWKS and return sub (user id)
// Uses instance-specific JWKS URL derived from token's issuer for reliability
async function getClerkUserIdFromToken(token: string, clerkSecretKey: string): Promise<{ userId: string } | { error: string }> {
  try {
    // First, extract the issuer to determine which JWKS to use
    const issuer = extractIssuerFromToken(token);
    log("JWT issuer extracted", { issuer: issuer ?? "(none)" });

    // Clerk JWTs have issuer like "https://pro-aardvark-46.clerk.accounts.dev" or "https://clerk.yourdomain.com"
    // The JWKS URL is {issuer}/.well-known/jwks.json OR use the Backend API with secret key
    
    let jwksUrl: string;
    let jwksHeaders: Record<string, string> = {};
    
    if (issuer && (issuer.includes(".clerk.accounts.dev") || issuer.includes("clerk."))) {
      // Use instance-specific JWKS URL (no secret key needed, publicly accessible)
      jwksUrl = `${issuer.replace(/\/$/, "")}/.well-known/jwks.json`;
      log("Using instance-specific JWKS URL", { jwksUrl });
    } else {
      // Fallback to Backend API JWKS (requires secret key auth)
      jwksUrl = "https://api.clerk.com/v1/jwks";
      jwksHeaders = { "Authorization": `Bearer ${clerkSecretKey}` };
      log("Using Backend API JWKS URL with secret key", { jwksUrl });
    }

    const JWKS = createRemoteJWKSet(new URL(jwksUrl), {
      headers: Object.keys(jwksHeaders).length > 0 ? jwksHeaders : undefined,
    });
    
    const { payload } = await jwtVerify(token, JWKS, {
      // Optionally validate issuer to ensure token matches expected instance
      issuer: issuer ?? undefined,
    });
    
    const sub = payload.sub as string | undefined;
    log("JWT verification successful", { 
      sub: sub ? sub.slice(0, 12) + "..." : "(none)",
      aud: payload.aud,
      exp: payload.exp,
    });
    
    if (sub) return { userId: sub };
    return { error: "JWT missing sub" };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    logErr("Clerk JWT verification failed", { 
      error: errMsg,
      hint: errMsg.includes("no applicable key") 
        ? "Token was likely signed by a different Clerk instance than the CLERK_SECRET_KEY belongs to. Ensure CLERK_SECRET_KEY matches the frontend's VITE_CLERK_PUBLISHABLE_KEY instance."
        : undefined,
    });
    return { error: errMsg };
  }
}

// Create Clerk invitation via Backend REST API only. No browser/client URLs.
// Endpoint: https://api.clerk.com/v1/invitations
// Headers: Authorization: Bearer CLERK_SECRET_KEY, Content-Type: application/json
// Body: { email_address, public_metadata, redirect_url }
async function createClerkInvitation(params: {
  email: string;
  company_id: string;
  role: string;
  full_name: string;
  permission_preset: string;
  employee_id: string;
  redirect_url: string;
  clerkSecretKey: string;
}): Promise<{ id?: string; error?: string; clerkResponseBody?: unknown }> {
  const url = "https://api.clerk.com/v1/invitations";
  const body = {
    email_address: params.email,
    public_metadata: {
      company_id: params.company_id,
      employee_id: params.employee_id,
      role: params.role,
      permission_preset: params.permission_preset,
      full_name: params.full_name,
    },
    redirect_url: params.redirect_url,
  };
  log("Clerk API request", { url, body: { ...body, email_address: body.email_address } });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${params.clerkSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = { _parseError: "Response was not JSON" };
    }

    if (!res.ok) {
      logErr("Clerk API response (non-2xx)", { status: res.status, statusText: res.statusText, body: data });
      const msg =
        (data as { message?: string }).message ??
        (data as { errors?: Array<{ message?: string; code?: string }> }).errors?.[0]?.message ??
        (data as { error?: { message?: string } }).error?.message ??
        "Clerk invite failed";
      return { error: msg, clerkResponseBody: data };
    }

    return { id: (data as { id?: string }).id };
  } catch (e) {
    logErr("Clerk API request threw", e);
    return { error: String(e), clerkResponseBody: { _throw: String(e) } };
  }
}

function classifyClerkError(errorMsg: string, body: unknown): { message: string; isDuplicate: boolean; status: number } {
  const lower = errorMsg.toLowerCase();
  const bodyStr = JSON.stringify(body ?? {});
  const alreadyInvited =
    /already invited|invitation.*exist|pending invitation/i.test(errorMsg) ||
    /already invited|invitation.*exist|pending/i.test(bodyStr);
  const alreadyUser =
    /already signed up|user already exist|identifier.*taken|email.*taken/i.test(errorMsg) ||
    /already signed up|user.*exist|identifier.*taken/i.test(bodyStr);
  if (alreadyInvited) {
    return { message: "An invitation was already sent to this email. They can accept it or sign in with the same email.", isDuplicate: true, status: 409 };
  }
  if (alreadyUser) {
    return { message: "This email is already registered. They can sign in; add them as an existing user instead of inviting.", isDuplicate: true, status: 409 };
  }
  return { message: errorMsg, isDuplicate: false, status: 400 };
}

// Build permissions JSON from preset + overrides (preset keys + overrides merge)
function buildPermissions(preset: string, overrides: Record<string, boolean> | null): Record<string, boolean> {
  const presetMap: Record<string, string[]> = {
    admin: ["dashboard.view","projects.view","projects.create","projects.edit","projects.delete","crop_monitoring.view","crop_monitoring.progress","crop_monitoring.edit","records.view","records.create","records.edit","inventory.view","inventory.create","inventory.edit","inventory.delete","suppliers.view","suppliers.create","suppliers.edit","expenses.view","expenses.create","expenses.edit","expenses.approve","harvest.view","harvest.create","harvest.edit","harvest_collections.view","harvest_collections.create","harvest_collections.edit","harvest_collections.confirm","harvest_collections.pay","logistics.view","logistics.create","logistics.edit","employees.view","employees.create","employees.edit","employees.suspend","employees.permissions.manage","reports.view","reports.export","financials.view","financials.manage","settings.view","settings.manage"],
    farm_manager: ["dashboard.view","projects.view","projects.create","projects.edit","crop_monitoring.view","crop_monitoring.progress","crop_monitoring.edit","records.view","records.create","records.edit","inventory.view","inventory.create","inventory.edit","suppliers.view","suppliers.create","suppliers.edit","expenses.view","expenses.create","expenses.edit","expenses.approve","harvest.view","harvest.create","harvest.edit","harvest_collections.view","harvest_collections.create","harvest_collections.edit","harvest_collections.confirm","harvest_collections.pay","logistics.view","logistics.create","logistics.edit","employees.view","reports.view","reports.export","financials.view","settings.view"],
    supervisor: ["dashboard.view","projects.view","crop_monitoring.view","crop_monitoring.progress","crop_monitoring.edit","records.view","records.create","records.edit","inventory.view","harvest.view","harvest_collections.view","harvest_collections.create","harvest_collections.edit","harvest_collections.confirm","harvest_collections.pay","logistics.view","reports.view"],
    weighing_clerk: ["dashboard.view","projects.view","harvest.view","harvest_collections.view","harvest_collections.create","harvest_collections.edit","harvest_collections.pay"],
    finance_officer: ["dashboard.view","projects.view","expenses.view","expenses.create","expenses.edit","expenses.approve","harvest_collections.view","reports.view","reports.export","financials.view"],
    inventory_officer: ["dashboard.view","projects.view","inventory.view","inventory.create","inventory.edit","inventory.delete","suppliers.view","suppliers.create","suppliers.edit","records.view","reports.view"],
    viewer: ["dashboard.view","projects.view","crop_monitoring.view","crop_monitoring.progress","records.view","inventory.view","expenses.view","harvest.view","harvest_collections.view","reports.view"],
    custom: [],
  };
  const keys = presetMap[preset] ?? presetMap.viewer;
  const out: Record<string, boolean> = {};
  keys.forEach((k) => { out[k] = true; });
  if (overrides && typeof overrides === "object") {
    Object.entries(overrides).forEach(([k, v]) => { out[k] = Boolean(v); });
  }
  return out;
}

Deno.serve(async (req: Request) => {
  log("Request", { method: req.method, url: req.url });

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      log("Rejected: method not allowed");
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      logErr("Rejected: missing or invalid Authorization header");
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    const clerkSecretKey = Deno.env.get("CLERK_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!clerkSecretKey || !supabaseUrl || !supabaseServiceKey) {
      logErr("Rejected: missing env (CLERK_SECRET_KEY, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY)");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    // Log Clerk secret key type (test vs live) for debugging instance mismatch issues
    const secretKeyType = clerkSecretKey.startsWith("sk_test_") 
      ? "test" 
      : clerkSecretKey.startsWith("sk_live_") 
        ? "live" 
        : "unknown";
    log("Clerk secret key type", { type: secretKeyType });

    const clerkResult = await getClerkUserIdFromToken(token, clerkSecretKey);
    if ("error" in clerkResult) {
      logErr("Rejected: Clerk token invalid", clerkResult.error);
      // Provide actionable hint for common configuration issues
      const hint = clerkResult.error.includes("no applicable key")
        ? `JWT signed by a different Clerk instance. The CLERK_SECRET_KEY (${secretKeyType}) may not match the frontend's Clerk publishable key.`
        : undefined;
      return jsonResponse({ 
        error: "Unauthorized", 
        detail: clerkResult.error,
        hint,
      }, 401);
    }
    const callerClerkId = clerkResult.userId;
    log("Caller verified", { callerClerkId: callerClerkId?.slice(0, 12) + "..." });

    let body: {
      companyId?: string;
      fullName?: string;
      email?: string;
      phone?: string;
      role?: string;
      department?: string;
      permissionPreset?: string;
      permissionOverrides?: Record<string, boolean>;
      assignedProjectIds?: string[];
      actorEmployeeId?: string;
    };
    try {
      body = await req.json();
    } catch (e) {
      logErr("Invalid JSON body", e);
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    log("Parsed request body", body);

    const companyId = typeof body.companyId === "string" ? body.companyId.trim() : null;
    const fullNameRaw = typeof body.fullName === "string" ? body.fullName.trim() : null;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
    const permissionPreset = typeof body.permissionPreset === "string" ? body.permissionPreset.trim() || "viewer" : "viewer";
    const roleRaw = typeof body.role === "string" ? body.role.trim() || null : null;
    const fullName = fullNameRaw || (email ?? "") || null;
    const role = roleRaw || permissionPreset || "viewer";
    const phone = typeof body.phone === "string" ? body.phone.trim() || null : null;
    const department = typeof body.department === "string" ? body.department.trim() || null : null;
    const permissionOverrides = body.permissionOverrides && typeof body.permissionOverrides === "object" ? body.permissionOverrides : null;
    const assignedProjectIds = Array.isArray(body.assignedProjectIds) ? body.assignedProjectIds.filter((id): id is string => typeof id === "string") : [];
    const actorEmployeeId = typeof body.actorEmployeeId === "string" ? body.actorEmployeeId.trim() || null : null;

    if (!companyId) {
      log("Rejected: Missing companyId");
      return jsonResponse({ error: "Missing companyId" }, 400);
    }
    if (!fullName) {
      log("Rejected: Missing fullName");
      return jsonResponse({ error: "Missing fullName" }, 400);
    }
    if (!email) {
      log("Rejected: Missing email");
      return jsonResponse({ error: "Missing email" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      log("Rejected: Invalid email format");
      return jsonResponse({ error: "Invalid email" }, 400);
    }

    log("Creating invite", { companyId, email });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let existing: { id: string; status: string; clerk_user_id: string | null } | null = null;
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("id, status, clerk_user_id")
        .eq("company_id", companyId)
        .ilike("email", email)
        .maybeSingle();
      if (error) {
        logErr("Employee duplicate check failed", { error: error.message, code: error.code });
        return jsonResponse({ error: "Database error", detail: error.message }, 500);
      }
      existing = data;
    } catch (e) {
      logErr("Employee duplicate check threw", e);
      return jsonResponse({ error: "Database error", detail: String(e) }, 500);
    }

    if (existing) {
      if (existing.status === "active" && existing.clerk_user_id) {
        log("Rejected: employee already active", { email });
        return jsonResponse({ error: "Employee already exists", detail: "A user with this email is already active in this company." }, 409);
      }
      if (existing.status === "invited") {
        log("Rejected: already invited", { email });
        return jsonResponse({ error: "Already invited", detail: "An invitation was already sent to this email for this company. You can resend from Clerk Dashboard or wait for them to accept." }, 409);
      }
    }

    const permissions = buildPermissions(permissionPreset, permissionOverrides);

    let employeeId: string;
    const nowIso = new Date().toISOString();
    if (existing?.id) {
      const employeeUpdatePayload = {
        full_name: fullName,
        email,
        phone,
        role: role ?? permissionPreset,
        department,
        permission_preset: permissionPreset,
        permissions,
        status: "invited",
        invite_status: "sent",
        invite_sent_at: nowIso,
        clerk_user_id: null,
      };

      // Temporary debugging: log exact employees payload right before update
      log("employees.update payload", employeeUpdatePayload);
      if ("name" in (employeeUpdatePayload as any) || "created_by" in (employeeUpdatePayload as any)) {
        logErr("Forbidden employees columns detected in update payload", employeeUpdatePayload);
      }

      await supabase
        .from("employees")
        .update(employeeUpdatePayload)
        .eq("id", existing.id);
      employeeId = existing.id;
    } else {
      const employeeInsertPayload = {
        company_id: companyId,
        clerk_user_id: null,
        email,
        full_name: fullName,
        phone,
        role: role ?? permissionPreset,
        department,
        permission_preset: permissionPreset,
        permissions,
        status: "invited",
        invite_status: "sent",
        invite_sent_at: nowIso,
      };

      // Temporary debugging: log exact employees payload right before insert
      log("employees.insert payload", employeeInsertPayload);
      if ("name" in (employeeInsertPayload as any) || "created_by" in (employeeInsertPayload as any)) {
        logErr("Forbidden employees columns detected in insert payload", employeeInsertPayload);
      }

      const { data: inserted, error: insertErr } = await supabase
        .from("employees")
        .insert(employeeInsertPayload)
        .select("id")
        .single();

      if (insertErr) {
        logErr("Employee insert failed", insertErr.message);
        return jsonResponse({ error: "Employee record failed", detail: insertErr.message }, 500);
      }
      employeeId = inserted?.id;
      if (!employeeId) {
        logErr("Employee insert returned no id");
        return jsonResponse({ error: "Employee insert returned no id" }, 500);
      }
    }

    const denoEnv = Deno.env.get("DENO_ENV") ?? Deno.env.get("NODE_ENV") ?? "unknown";
    const appBaseUrlEnv =
      Deno.env.get("APP_BASE_URL") ??
      Deno.env.get("FARMVAULT_APP_URL") ??
      "";

    // Resolve base URL for Clerk invite redirects (used in invitation emails).
    // IMPORTANT for production: Set APP_BASE_URL in Supabase Edge Function secrets
    // so invite emails use your production domain, not dev branding.
    // Priority:
    // 1) APP_BASE_URL / FARMVAULT_APP_URL when set (use for production)
    // 2) Production domain when denoEnv is production and no env configured
    // 3) Localhost:8088 for local development
    let appBaseUrlRaw = (appBaseUrlEnv || "").trim();
    if (!appBaseUrlRaw) {
      if (denoEnv === "production") {
        // Production fallback: use main FarmVault domain
        appBaseUrlRaw = "https://farmvault.africa";
      } else {
        appBaseUrlRaw = "http://localhost:8088";
      }
    }
    const appBaseUrl = appBaseUrlRaw.replace(/\/$/, "");
    const redirectParams = new URLSearchParams({
      email,
      company_id: companyId,
      employee_id: employeeId,
      role: role ?? permissionPreset,
      permission_preset: permissionPreset,
    });
    const redirectUrl = `${appBaseUrl}/accept-invitation?${redirectParams.toString()}`;

    log("Clerk invitation redirectUrl resolved", {
      environment: denoEnv,
      appBaseUrlEnv,
      appBaseUrl,
      redirectUrl,
      metadata: {
        email,
        company_id: companyId,
        employee_id: employeeId,
        role,
        permission_preset: permissionPreset,
      },
    });

    const clerkInvite = await createClerkInvitation({
      email,
      company_id: companyId,
      role,
      full_name: fullName,
      permission_preset: permissionPreset,
      employee_id: employeeId,
      redirect_url: redirectUrl,
      clerkSecretKey,
    });

    if (clerkInvite.error) {
      logErr("Clerk invitation failed", clerkInvite.error);
      const classified = classifyClerkError(clerkInvite.error, clerkInvite.clerkResponseBody);
      return jsonResponse(
        {
          error: classified.isDuplicate ? "Already invited" : "Clerk invitation failed",
          detail: classified.message,
          details: clerkInvite.clerkResponseBody,
        },
        classified.status
      );
    }

    const { error: deleteAccessErr } = await supabase.from("employee_project_access").delete().eq("employee_id", employeeId).eq("company_id", companyId);
    if (deleteAccessErr) {
      logErr("Project access delete failed (non-blocking)", deleteAccessErr.message);
    }
    if (assignedProjectIds.length > 0) {
      const { error: insertAccessErr } = await supabase.from("employee_project_access").insert(
        assignedProjectIds.map((project_id) => ({
          company_id: companyId,
          employee_id: employeeId,
          project_id,
        }))
      );
      if (insertAccessErr) {
        logErr("Project access insertion failed", { error: insertAccessErr.message, code: insertAccessErr.code, assignedProjectIds });
        return jsonResponse({ error: "Project access failed", detail: insertAccessErr.message }, 500);
      }
    }

    try {
      await supabase.rpc("log_employee_activity", {
        p_company_id: companyId,
        p_actor_employee_id: actorEmployeeId ?? null,
        p_target_employee_id: employeeId,
        p_action: "employee_invited",
        p_module: "employees",
        p_metadata: { email, full_name: fullName, role: role ?? permissionPreset, clerk_invitation_id: clerkInvite.id },
      });
    } catch (e) {
      logErr("Activity log failed (non-blocking)", e);
    }

    log("Success", { employeeId, email });
    return jsonResponse({
      ok: true,
      employee_id: employeeId,
      message: "Invitation sent successfully. An invitation email has been sent.",
    }, 200);
  } catch (e) {
    logErr("Unhandled error", e);
    return jsonResponse({ error: "Internal error", detail: String(e) }, 500);
  }
});

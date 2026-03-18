// FarmVault Edge Function: resend an existing employee invitation via Clerk.
// Reuses the same Clerk + Supabase flow as invite-employee, but:
// - Works only on existing employees with status=invited
// - Does NOT create duplicate employee records
// - Updates invite resend metadata on the same row

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.2.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function log(msg: string, data?: unknown) {
  console.log(`[resend-employee-invite] ${msg}`, data !== undefined ? JSON.stringify(data) : "");
}

function logErr(msg: string, err?: unknown) {
  console.error(
    `[resend-employee-invite] ${msg}`,
    err !== undefined ? (typeof err === "string" ? err : JSON.stringify(err)) : ""
  );
}

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

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

async function getClerkUserIdFromToken(
  token: string,
  clerkSecretKey: string
): Promise<{ userId: string } | { error: string }> {
  try {
    const issuer = extractIssuerFromToken(token);
    log("JWT issuer extracted", { issuer: issuer ?? "(none)" });

    let jwksUrl: string;
    let jwksHeaders: Record<string, string> = {};

    if (issuer && (issuer.includes(".clerk.accounts.dev") || issuer.includes("clerk."))) {
      jwksUrl = `${issuer.replace(/\/$/, "")}/.well-known/jwks.json`;
      log("Using instance-specific JWKS URL", { jwksUrl });
    } else {
      jwksUrl = "https://api.clerk.com/v1/jwks";
      jwksHeaders = { Authorization: `Bearer ${clerkSecretKey}` };
      log("Using Backend API JWKS URL with secret key", { jwksUrl });
    }

    const JWKS = createRemoteJWKSet(new URL(jwksUrl), {
      headers: Object.keys(jwksHeaders).length > 0 ? jwksHeaders : undefined,
    });

    const { payload } = await jwtVerify(token, JWKS, {
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
    });
    return { error: errMsg };
  }
}

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
        Authorization: `Bearer ${params.clerkSecretKey}`,
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

function classifyClerkError(
  errorMsg: string,
  body: unknown
): { message: string; isDuplicate: boolean; status: number } {
  const lower = errorMsg.toLowerCase();
  const bodyStr = JSON.stringify(body ?? {});
  const alreadyInvited =
    /already invited|invitation.*exist|pending invitation/i.test(errorMsg) ||
    /already invited|invitation.*exist|pending/i.test(bodyStr);
  const alreadyUser =
    /already signed up|user already exist|identifier.*taken|email.*taken/i.test(errorMsg) ||
    /already signed up|user.*exist|identifier.*taken/i.test(bodyStr);
  if (alreadyInvited) {
    return {
      message:
        "An invitation is already pending for this email. You can ask them to check their inbox or accept from the same email.",
      isDuplicate: true,
      status: 409,
    };
  }
  if (alreadyUser) {
    return {
      message:
        "This email is already registered. They can sign in; add them as an existing user instead of resending an invite.",
      isDuplicate: true,
      status: 409,
    };
  }
  return { message: lower || errorMsg, isDuplicate: false, status: 400 };
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

    const secretKeyType = clerkSecretKey.startsWith("sk_test_")
      ? "test"
      : clerkSecretKey.startsWith("sk_live_")
      ? "live"
      : "unknown";
    log("Clerk secret key type", { type: secretKeyType });

    const clerkResult = await getClerkUserIdFromToken(token, clerkSecretKey);
    if ("error" in clerkResult) {
      logErr("Rejected: Clerk token invalid", clerkResult.error);
      const hint = clerkResult.error.includes("no applicable key")
        ? `JWT signed by a different Clerk instance. The CLERK_SECRET_KEY (${secretKeyType}) may not match the frontend's Clerk publishable key.`
        : undefined;
      return jsonResponse(
        {
          error: "Unauthorized",
          detail: clerkResult.error,
          hint,
        },
        401
      );
    }
    const callerClerkId = clerkResult.userId;
    log("Caller verified", { callerClerkId: callerClerkId?.slice(0, 12) + "..." });

    let body: {
      companyId?: string;
      employeeId?: string;
      invite_id?: string;
      email?: string;
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
    const employeeIdFromBody =
      typeof body.employeeId === "string" && body.employeeId.trim()
        ? body.employeeId.trim()
        : typeof body.invite_id === "string" && body.invite_id.trim()
        ? body.invite_id.trim()
        : null;
    const emailFromBody =
      typeof body.email === "string" && body.email.trim()
        ? body.email.trim().toLowerCase()
        : null;
    const actorEmployeeId =
      typeof body.actorEmployeeId === "string" ? body.actorEmployeeId.trim() || null : null;

    if (!companyId) {
      log("Rejected: Missing companyId");
      return jsonResponse({ success: false, error: "Missing companyId" }, 400);
    }
    if (!employeeIdFromBody && !emailFromBody) {
      log("Rejected: Missing identifier (employeeId/invite_id or email)");
      return jsonResponse(
        {
          success: false,
          error: "Missing invite identifier",
          detail: "Provide either invite_id (or employeeId) or email.",
        },
        400
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load existing invite record by id (invite_id/employeeId) or by email+companyId
    let employeeId = employeeIdFromBody;
    let employee;
    let empErr;

    if (employeeId) {
      const { data, error } = await supabase
        .from("employees")
        .select(
          "id, company_id, status, email, full_name, role, department, permission_preset, permissions, invite_sent_at, invite_last_sent_at, invite_resend_count, invite_last_resent_at, invite_last_resent_by"
        )
        .eq("company_id", companyId)
        .eq("id", employeeId)
        .maybeSingle();
      employee = data;
      empErr = error;
    } else {
      const { data, error } = await supabase
        .from("employees")
        .select(
          "id, company_id, status, email, full_name, role, department, permission_preset, permissions, invite_sent_at, invite_last_sent_at, invite_resend_count, invite_last_resent_at, invite_last_resent_by"
        )
        .eq("company_id", companyId)
        .ilike("email", emailFromBody!)
        .maybeSingle();
      employee = data;
      empErr = error;
      if (employee && !employeeId) {
        employeeId = employee.id as string;
      }
    }

    if (empErr) {
      logErr("Employee lookup failed", { error: empErr.message, code: empErr.code });
      return jsonResponse(
        { success: false, error: "Database error", detail: empErr.message },
        500
      );
    }
    if (!employee) {
      log("Rejected: employee not found", { employeeId, companyId });
      return jsonResponse(
        { success: false, error: "Invite not found", detail: "No pending invite for the given identifier." },
        404
      );
    }

    if (employee.status !== "invited") {
      log("Rejected: resend only allowed for invited status", {
        status: employee.status,
      });
      return jsonResponse(
        {
          success: false,
          error: "Invalid invite status",
          detail: "Invitations can only be resent for pending invites.",
        },
        400
      );
    }

    const email = typeof employee.email === "string" ? employee.email.trim().toLowerCase() : null;
    const fullName =
      (typeof employee.full_name === "string" && employee.full_name.trim()) ||
      email ||
      "Employee";
    const role =
      (typeof employee.role === "string" && employee.role.trim()) ||
      (typeof employee.permission_preset === "string" && employee.permission_preset.trim()) ||
      "viewer";
    const permissionPreset =
      (typeof employee.permission_preset === "string" && employee.permission_preset.trim()) ||
      "viewer";

    if (!email) {
      log("Rejected: Missing email on invite row");
      return jsonResponse(
        {
          success: false,
          error: "Missing email",
          detail: "Cannot resend invite because this employee record has no email address.",
        },
        400
      );
    }

    const denoEnv = Deno.env.get("DENO_ENV") ?? Deno.env.get("NODE_ENV") ?? "unknown";
    const appBaseUrlEnv =
      Deno.env.get("APP_BASE_URL") ??
      Deno.env.get("FARMVAULT_APP_URL") ??
      "";

    let appBaseUrlRaw = (appBaseUrlEnv || "").trim();
    if (!appBaseUrlRaw) {
      if (denoEnv === "production") {
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
      role,
      permission_preset: permissionPreset,
    });
    const redirectUrl = `${appBaseUrl}/accept-invitation?${redirectParams.toString()}`;

    log("Clerk invitation redirectUrl resolved (resend)", {
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
      logErr("Clerk invitation failed (resend)", clerkInvite.error);
      const classified = classifyClerkError(clerkInvite.error, clerkInvite.clerkResponseBody);
      return jsonResponse(
        {
          success: false,
          error: classified.isDuplicate ? "Already invited" : "Clerk invitation failed",
          detail: classified.message,
          details: clerkInvite.clerkResponseBody,
        },
        classified.status
      );
    }

    const nowIso = new Date().toISOString();
    const currentResendCount =
      typeof employee.invite_resend_count === "number"
        ? employee.invite_resend_count
        : employee.invite_resend_count != null
        ? Number(employee.invite_resend_count)
        : 0;

    const { error: updateErr } = await supabase
      .from("employees")
      .update({
        invite_status: "sent",
        invite_last_sent_at: nowIso,
        invite_resend_count: currentResendCount + 1,
        invite_last_resent_at: nowIso,
        invite_last_resent_by: actorEmployeeId,
      })
      .eq("id", employeeId)
      .eq("company_id", companyId);

    if (updateErr) {
      logErr("Employee invite metadata update failed (resend)", {
        error: updateErr.message,
        code: updateErr.code,
      });
      return jsonResponse(
        { success: false, error: "Invite metadata update failed", detail: updateErr.message },
        500
      );
    }

    try {
      await supabase.rpc("log_employee_activity", {
        p_company_id: companyId,
        p_actor_employee_id: actorEmployeeId ?? null,
        p_target_employee_id: employeeId,
        p_action: "employee_invite_resent",
        p_module: "employees",
        p_metadata: {
          email,
          full_name: fullName,
          role,
          permission_preset: permissionPreset,
          clerk_invitation_id: clerkInvite.id,
          resent_by_clerk_user_id: callerClerkId,
        },
      });
    } catch (e) {
      logErr("Activity log failed (non-blocking, resend)", e);
    }

    log("Success (resend)", { employeeId, email });
    return jsonResponse(
      {
        success: true,
        employee_id: employeeId,
        message: "Invite resent successfully",
      },
      200
    );
  } catch (e) {
    logErr("Unhandled error", e);
    return jsonResponse({
      success: false,
      error: "Internal error",
      detail: String(e),
    }, 500);
  }
});


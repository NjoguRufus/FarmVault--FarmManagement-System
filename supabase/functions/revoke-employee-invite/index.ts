// FarmVault Edge Function: revoke employee invite and clean up employee records.
// Uses Clerk Backend API and Supabase service role key. No Supabase Auth.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serveFarmVaultEdge } from "../_shared/withEdgeLogging.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function log(msg: string, data?: unknown) {
  console.log(`[revoke-employee-invite] ${msg}`, data !== undefined ? JSON.stringify(data) : "");
}

function logErr(msg: string, err?: unknown) {
  console.error(`[revoke-employee-invite] ${msg}`, err !== undefined ? String(err) : "");
}

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

type ClerkInvitation = {
  id: string;
  email_address?: string;
  status?: string;
  revoked?: boolean;
  public_metadata?: {
    company_id?: string;
    employee_id?: string;
    [key: string]: unknown;
  } | null;
};

async function listClerkInvitations(clerkSecretKey: string): Promise<{ invitations: ClerkInvitation[]; error?: string }> {
  const url = "https://api.clerk.com/v1/invitations?status=pending&limit=100";
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${clerkSecretKey}`,
        "Content-Type": "application/json",
      },
    });
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = { _parseError: "Response was not JSON" };
    }
    if (!res.ok) {
      logErr("Clerk invitations list failed", { status: res.status, statusText: res.statusText, body: data });
      return { invitations: [], error: "Failed to list Clerk invitations" };
    }
    const arr = Array.isArray(data) ? (data as ClerkInvitation[]) : [];
    return { invitations: arr };
  } catch (e) {
    logErr("Clerk invitations list threw", e);
    return { invitations: [], error: String(e) };
  }
}

async function revokeClerkInvitation(clerkSecretKey: string, invitationId: string): Promise<{ ok: boolean; status: number; body?: unknown }> {
  const url = `https://api.clerk.com/v1/invitations/${invitationId}/revoke`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${clerkSecretKey}`,
        "Content-Type": "application/json",
      },
    });
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = { _parseError: "Response was not JSON" };
    }
    if (!res.ok) {
      logErr("Clerk revoke failed (non-2xx)", { invitationId, status: res.status, statusText: res.statusText, body: data });
      return { ok: false, status: res.status, body: data };
    }
    log("Clerk revoke succeeded", { invitationId, status: res.status });
    return { ok: true, status: res.status, body: data };
  } catch (e) {
    logErr("Clerk revoke threw", { invitationId, error: e });
    return { ok: false, status: 500, body: { _throw: String(e) } };
  }
}

serveFarmVaultEdge("revoke-employee-invite", async (req: Request, _ctx) => {
  log("Request", { method: req.method, url: req.url });

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    log("Rejected: method not allowed");
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      logErr("Rejected: missing or invalid Authorization header");
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    // This function trusts that the caller is an authenticated company admin;
    // authorization is handled in the app. We do not introspect the token here.

    const clerkSecretKey = Deno.env.get("CLERK_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!clerkSecretKey || !supabaseUrl || !supabaseServiceKey) {
      logErr("Rejected: missing env (CLERK_SECRET_KEY, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY)");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    let body: {
      companyId?: string;
      email?: string;
      hardDelete?: boolean;
    };

    try {
      body = await req.json();
    } catch (e) {
      logErr("Invalid JSON body", e);
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    log("Parsed request body", body);

    const companyId = typeof body.companyId === "string" ? body.companyId.trim() : null;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
    const hardDelete = body.hardDelete !== false; // default to true

    if (!companyId) {
      log("Rejected: Missing companyId");
      return jsonResponse({ error: "Missing companyId" }, 400);
    }
    if (!email) {
      log("Rejected: Missing email");
      return jsonResponse({ error: "Missing email" }, 400);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1) Find employees for this company+email with invited/draft status.
    const { data: employees, error: empError } = await supabase
      .from("employees")
      .select("id, company_id, email, status, clerk_user_id")
      .eq("company_id", companyId)
      .ilike("email", email)
      .in("status", ["invited", "draft"]);

    if (empError) {
      logErr("Employee lookup failed", { error: empError.message, code: (empError as any).code });
      return jsonResponse({ error: "Database error", detail: empError.message }, 500);
    }

    log("Employee cleanup candidates", { companyId, email, count: employees?.length ?? 0, employees });

    // 2) List pending Clerk invitations and filter by email + company_id in public_metadata.
    const { invitations, error: listError } = await listClerkInvitations(clerkSecretKey);
    if (listError) {
      logErr("Clerk invitations list error", listError);
    }

    const matchingInvites = invitations.filter((inv) => {
      const invEmail = (inv.email_address || "").toLowerCase();
      const invCompanyId = inv.public_metadata?.company_id || null;
      const status = (inv.status || "").toLowerCase();
      const isPending = status === "pending" && !inv.revoked;
      return isPending && invEmail === email && (!invCompanyId || invCompanyId === companyId);
    });

    log("Matching Clerk invitations", {
      email,
      companyId,
      totalInvitations: invitations.length,
      matching: matchingInvites.map((i) => ({ id: i.id, status: i.status, company_id: i.public_metadata?.company_id })),
    });

    // 3) Revoke all matching invitations (safe: Clerk will ignore already-revoked/accepted).
    const revokeResults: Array<{ id: string; ok: boolean; status: number }> = [];
    for (const inv of matchingInvites) {
      const res = await revokeClerkInvitation(clerkSecretKey, inv.id);
      revokeResults.push({ id: inv.id, ok: res.ok, status: res.status });
    }

    // 4) Clean up employee rows: for test cleanup we default to hard delete for invited/draft without clerk_user_id.
    let deletedIds: string[] = [];
    let archivedIds: string[] = [];

    if (employees && employees.length > 0) {
      const target = employees.filter((e) => !e.clerk_user_id && (e.status === "invited" || e.status === "draft"));
      const targetIds = target.map((e) => e.id);

      if (targetIds.length > 0) {
        if (hardDelete) {
          const { error: delError } = await supabase
            .from("employees")
            .delete()
            .in("id", targetIds)
            .eq("company_id", companyId);
          if (delError) {
            logErr("Employee delete failed", { error: delError.message, code: (delError as any).code, targetIds });
            return jsonResponse({ error: "Employee delete failed", detail: delError.message }, 500);
          }
          deletedIds = targetIds;
        } else {
          const { error: updError } = await supabase
            .from("employees")
            .update({ status: "archived" })
            .in("id", targetIds)
            .eq("company_id", companyId);
          if (updError) {
            logErr("Employee archive failed", { error: updError.message, code: (updError as any).code, targetIds });
            return jsonResponse({ error: "Employee archive failed", detail: updError.message }, 500);
          }
          archivedIds = targetIds;
        }
      }
    }

    log("Employee cleanup result", {
      companyId,
      email,
      hardDelete,
      deletedIds,
      archivedIds,
    });

    return jsonResponse(
      {
        ok: true,
        company_id: companyId,
        email,
        hardDelete,
        employeesFound: employees?.length ?? 0,
        employeesDeleted: deletedIds.length,
        employeesArchived: archivedIds.length,
        clerkInvitesFound: matchingInvites.length,
        clerkRevokeResults: revokeResults,
      },
      200,
    );
  } catch (e) {
    logErr("Unhandled error", e);
    return jsonResponse({ error: "Internal error", detail: String(e) }, 500);
  }
});


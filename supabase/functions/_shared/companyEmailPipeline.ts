/**
 * Company tenant email resolution (single order of operations for all company-facing mail).
 *
 * 1. core.companies.email
 * 2. core.companies.owner_email
 * 3. Owner row in company_members → profile email
 * 4. First admin member (non-owner admin roles) → profile email
 * 5. If still none: console.warn and return null (callers skip send or throw)
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeCompanyIdForUuid } from "./companyBillingContactEmail.ts";
import { getFarmVaultEmailFrom } from "./farmvaultEmailFrom.ts";
import type { FarmVaultEmailSenderKey } from "./farmvaultEmailFrom.ts";
import { sendResendWithEmailLog } from "./resendSendLogged.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeMemberRole(role: string): string {
  return (role || "").toLowerCase().replace(/-/g, "_");
}

/** Admin / company_admin only — excludes owner (handled in a prior step). */
function isNonOwnerAdminRole(role: string): boolean {
  const r = normalizeMemberRole(role);
  if (r === "owner") return false;
  return r === "company_admin" || r === "companyadmin" || r === "admin";
}

export type CompanyRecipientSource =
  | "company_email"
  | "company_owner_email"
  | "member_owner_profile"
  | "member_admin_profile";

export type ResolvedCompanyRecipient = {
  email: string;
  name: string;
  source: CompanyRecipientSource;
};

async function profileEmailForClerkId(
  admin: SupabaseClient,
  clerkId: string,
): Promise<{ email: string; full_name: string } | null> {
  const id = clerkId.trim();
  if (!id) return null;

  const { data: pub } = await admin
    .from("profiles")
    .select("email,full_name")
    .eq("clerk_user_id", id)
    .maybeSingle();
  const em = pub?.email != null ? String(pub.email).trim() : "";
  if (em && EMAIL_RE.test(em)) {
    return { email: em.toLowerCase(), full_name: String(pub?.full_name ?? "").trim() };
  }

  const { data: coreP } = await admin
    .schema("core")
    .from("profiles")
    .select("email,full_name")
    .eq("clerk_user_id", id)
    .maybeSingle();
  const em2 = coreP?.email != null ? String(coreP.email).trim() : "";
  if (em2 && EMAIL_RE.test(em2)) {
    return { email: em2.toLowerCase(), full_name: String(coreP?.full_name ?? "").trim() };
  }
  return null;
}

type Mem = { clerk_user_id: string; role: string };

async function loadCompanyMembers(admin: SupabaseClient, cid: string): Promise<Mem[]> {
  const seen = new Set<string>();
  const members: Mem[] = [];

  const { data: coreMembers } = await admin
    .schema("core")
    .from("company_members")
    .select("clerk_user_id,role,created_at")
    .eq("company_id", cid)
    .order("created_at", { ascending: true })
    .limit(40);

  for (const m of coreMembers ?? []) {
    const id = String((m as { clerk_user_id?: string }).clerk_user_id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    members.push({ clerk_user_id: id, role: String((m as { role?: string }).role ?? "") });
  }

  if (members.length === 0) {
    const { data: pubMembers } = await admin
      .from("company_members")
      .select("clerk_user_id,user_id,role,created_at")
      .eq("company_id", cid)
      .order("created_at", { ascending: true })
      .limit(40);
    for (const m of pubMembers ?? []) {
      const id = String((m as { clerk_user_id?: string }).clerk_user_id ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      members.push({ clerk_user_id: id, role: String((m as { role?: string }).role ?? "") });
    }
  }

  return members;
}

function workspaceNameFromRow(company: { name?: string | null } | null): string {
  return String(company?.name ?? "Your workspace").trim() || "Your workspace";
}

/**
 * Resolves the tenant email recipient. On failure logs a warning and returns null (skip send).
 */
export async function resolveCompanyTenantEmail(
  admin: SupabaseClient,
  companyId: string,
): Promise<ResolvedCompanyRecipient | null> {
  const cid = normalizeCompanyIdForUuid(companyId);
  if (!UUID_RE.test(cid)) {
    console.warn("[companyEmailPipeline] invalid company_id for email resolution", companyId);
    return null;
  }

  const { data: company, error } = await admin
    .schema("core")
    .from("companies")
    .select("email,owner_email,name")
    .eq("id", cid)
    .maybeSingle();

  if (error) {
    console.warn("[companyEmailPipeline] companies load failed", cid, error.message);
    return null;
  }

  if (!company || typeof company !== "object") {
    console.warn("[companyEmailPipeline] company row not found", cid);
    return null;
  }

  const row = company as { email?: string | null; owner_email?: string | null; name?: string | null };
  const nameDefault = workspaceNameFromRow(row);

  const em = typeof row.email === "string" ? row.email.trim() : "";
  if (em && EMAIL_RE.test(em)) {
    return { email: em.toLowerCase(), name: nameDefault, source: "company_email" };
  }

  const ownerEm = typeof row.owner_email === "string" ? row.owner_email.trim() : "";
  if (ownerEm && EMAIL_RE.test(ownerEm)) {
    return { email: ownerEm.toLowerCase(), name: nameDefault, source: "company_owner_email" };
  }

  const members = await loadCompanyMembers(admin, cid);

  const ownerMember = members.find((m) => normalizeMemberRole(m.role) === "owner");
  if (ownerMember) {
    const prof = await profileEmailForClerkId(admin, ownerMember.clerk_user_id);
    if (prof && prof.email) {
      return {
        email: prof.email,
        name: prof.full_name || nameDefault,
        source: "member_owner_profile",
      };
    }
  }

  const adminMember = members.find((m) => isNonOwnerAdminRole(m.role));
  if (adminMember) {
    const prof = await profileEmailForClerkId(admin, adminMember.clerk_user_id);
    if (prof && prof.email) {
      return {
        email: prof.email,
        name: prof.full_name || nameDefault,
        source: "member_admin_profile",
      };
    }
  }

  console.warn(
    "[companyEmailPipeline] no company email recipient — set companies.email, owner_email, or member profile email",
    cid,
  );
  return null;
}

/** Same as resolveCompanyTenantEmail (billing code import name). */
export const resolveCompanyBillingRecipient = resolveCompanyTenantEmail;

/** Same resolution as payment mail; throws if no recipient (strict callers). */
export async function getCompanyEmailAndName(
  admin: SupabaseClient,
  companyId: string,
): Promise<{ email: string; name: string }> {
  const r = await resolveCompanyTenantEmail(admin, companyId);
  if (!r) {
    throw new Error(
      "Company email not found — set workspace email, owner email, or ensure an owner/admin has a profile email",
    );
  }
  return { email: r.email, name: r.name };
}

export async function getCompanyEmail(admin: SupabaseClient, companyId: string): Promise<string> {
  const { email } = await getCompanyEmailAndName(admin, companyId);
  return email;
}

export type SendCompanyPipelineEmailInput = {
  admin: SupabaseClient | null;
  resendKey: string;
  companyId: string;
  from: FarmVaultEmailSenderKey;
  subject: string;
  html: string;
  email_type: string;
  metadata: Record<string, unknown>;
  attachments?: { filename: string; content: string }[];
};

export async function sendCompanyPipelineEmail(
  input: SendCompanyPipelineEmailInput,
): Promise<{ ok: true; resendId?: string } | { ok: false; error: string }> {
  if (!input.admin) {
    return { ok: false, error: "Server misconfiguration (no admin client for email)" };
  }

  const r = await resolveCompanyTenantEmail(input.admin, input.companyId);
  if (!r) {
    return { ok: false, error: "No company email recipient" };
  }

  console.log("Sending email to:", r.email);

  const from = getFarmVaultEmailFrom(input.from);
  return sendResendWithEmailLog({
    admin: input.admin,
    resendKey: input.resendKey,
    from,
    to: r.email,
    subject: input.subject,
    html: input.html,
    email_type: input.email_type,
    company_id: input.companyId,
    company_name: r.name,
    metadata: input.metadata,
    attachments: input.attachments,
  });
}

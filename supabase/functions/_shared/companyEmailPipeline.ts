/**
 * Company tenant email resolution (single order of operations for all company-facing mail).
 *
 * 1. core.companies.email
 * 2. core.companies.owner_email
 * 3. Owner row in company_members → profile email
 * 4. First admin member (non-owner admin roles) → profile email
 * 5. If still none: console.warn and return null (callers skip send or throw)
 *
 * Edge/service_role: reads core.companies only (no public.companies — avoids permission denied).
 * If the core row is missing or unreadable, member/profile fallbacks still run.
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
  | "member_admin_profile"
  | "member_any_profile";

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

  /** Always merge public.company_members (matches company_billing_contact_email RPC — core-only was missing synced members). */
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

  return members;
}

function memberBillingRank(role: string): number {
  const r = normalizeMemberRole(role);
  if (r === "owner" || r === "company_admin" || r === "companyadmin" || r === "admin") return 0;
  return 1;
}

function sortMembersForBillingEmail(members: Mem[]): Mem[] {
  return [...members].sort((a, b) => {
    const d = memberBillingRank(a.role) - memberBillingRank(b.role);
    if (d !== 0) return d;
    return a.clerk_user_id.localeCompare(b.clerk_user_id);
  });
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

  const { data: company, error: coreErr } = await admin
    .schema("core")
    .from("companies")
    .select("email,owner_email,name")
    .eq("id", cid)
    .maybeSingle();

  if (coreErr) {
    console.warn("[companyEmailPipeline] core.companies load failed", cid, coreErr.message);
  }

  const coreRow = company && typeof company === "object"
    ? (company as { email?: string | null; owner_email?: string | null; name?: string | null })
    : null;

  const pickEmail = (a: string | null | undefined, b: string | null | undefined): string => {
    const x = typeof a === "string" ? a.trim() : "";
    if (x && EMAIL_RE.test(x)) return x;
    const y = typeof b === "string" ? b.trim() : "";
    return y && EMAIL_RE.test(y) ? y : "";
  };

  const nameDefault = workspaceNameFromRow(coreRow);
  if (!coreRow) {
    console.warn("[companyEmailPipeline] no core.companies row (will try members)", cid);
  }

  const em = pickEmail(coreRow?.email, undefined);
  if (em) {
    return { email: em.toLowerCase(), name: nameDefault, source: "company_email" };
  }

  const ownerEm = pickEmail(coreRow?.owner_email, undefined);
  if (ownerEm) {
    return { email: ownerEm.toLowerCase(), name: nameDefault, source: "company_owner_email" };
  }

  const members = sortMembersForBillingEmail(await loadCompanyMembers(admin, cid));

  for (const m of members) {
    const prof = await profileEmailForClerkId(admin, m.clerk_user_id);
    if (prof && prof.email) {
      const r = normalizeMemberRole(m.role);
      const source: CompanyRecipientSource =
        r === "owner"
          ? "member_owner_profile"
          : isNonOwnerAdminRole(m.role)
            ? "member_admin_profile"
            : "member_any_profile";
      return {
        email: prof.email,
        name: prof.full_name || nameDefault,
        source,
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

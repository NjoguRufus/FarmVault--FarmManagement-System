import type { SendFarmVaultEmailContext, SendFarmVaultEmailPayload } from "./types.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ValidateResult =
  | { ok: true; payload: SendFarmVaultEmailPayload }
  | { ok: false; message: string };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function requireHttpsUrl(v: unknown, field: string): string | null {
  if (!isNonEmptyString(v)) return `${field} is required`;
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "https:") return `${field} must use https`;
    return null;
  } catch {
    return `${field} must be a valid URL`;
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function parseAuditFields(root: Record<string, unknown>): { ok: true; ctx: SendFarmVaultEmailContext } | { ok: false; message: string } {
  let companyId: string | null = null;
  if (root.companyId !== undefined && root.companyId !== null) {
    if (typeof root.companyId !== "string" || !UUID_RE.test(root.companyId.trim())) {
      return { ok: false, message: "companyId must be a valid UUID when provided" };
    }
    companyId = root.companyId.trim();
  }

  let companyName: string | null = null;
  if (root.companyName !== undefined && root.companyName !== null) {
    if (typeof root.companyName !== "string" || root.companyName.trim().length === 0) {
      return { ok: false, message: "companyName must be a non-empty string when provided" };
    }
    companyName = root.companyName.trim().slice(0, 500);
  }

  let triggeredBy: string | null = null;
  if (root.triggeredBy !== undefined && root.triggeredBy !== null) {
    if (typeof root.triggeredBy !== "string") {
      return { ok: false, message: "triggeredBy must be a string when provided" };
    }
    const t = root.triggeredBy.trim();
    if (t.length > 0) triggeredBy = t.slice(0, 200);
  }

  let metadata: Record<string, unknown> | null = null;
  if (root.metadata !== undefined && root.metadata !== null) {
    const m = asRecord(root.metadata);
    if (!m) return { ok: false, message: "metadata must be a JSON object" };
    if (Object.keys(m).length > 50) return { ok: false, message: "metadata has too many keys (max 50)" };
    metadata = m;
  }

  return { ok: true, ctx: { companyId, companyName, triggeredBy, metadata } };
}

function withLogContext(
  ctx: SendFarmVaultEmailContext,
  dataObj: Record<string, unknown>,
): SendFarmVaultEmailContext {
  const fromData = isNonEmptyString(dataObj.companyName) ? dataObj.companyName.trim() : null;
  return {
    ...ctx,
    companyName: ctx.companyName ?? fromData,
  };
}

/**
 * Validates JSON body shape for send-farmvault-email.
 * Returns a normalized payload or a single error message for 400 responses.
 */
export function validateSendFarmVaultEmailBody(raw: unknown): ValidateResult {
  const root = asRecord(raw);
  if (!root) return { ok: false, message: "Body must be a JSON object" };

  const emailType = root.emailType;
  const to = root.to;
  const data = root.data;

  if (!isNonEmptyString(to) || !EMAIL_RE.test(to.trim())) {
    return { ok: false, message: "Invalid or missing to (email)" };
  }

  const dataObj = asRecord(data);
  if (!dataObj) return { ok: false, message: "data must be an object" };

  const audit = parseAuditFields(root);
  if (!audit.ok) return { ok: false, message: audit.message };
  const logCtx = withLogContext(audit.ctx, dataObj);

  const normalizedTo = to.trim();

  if (emailType === "custom_manual") {
    const subjectFromRoot = root.subject;
    const subjectFromData = dataObj.subject;
    const subjectField = isNonEmptyString(subjectFromRoot)
      ? subjectFromRoot
      : isNonEmptyString(subjectFromData)
        ? subjectFromData
        : null;
    if (!subjectField || subjectField.trim().length > 300) {
      return { ok: false, message: "subject is required (max 300 characters)" };
    }
    if (!isNonEmptyString(dataObj.body)) {
      return { ok: false, message: "data.body is required" };
    }
    const body = dataObj.body.trim();
    if (body.length > 50_000) {
      return { ok: false, message: "data.body exceeds maximum length (50000)" };
    }
    let recipientName: string | undefined;
    if (isNonEmptyString(dataObj.recipientName)) {
      recipientName = dataObj.recipientName.trim().slice(0, 200);
    }
    const allowedCat = new Set(["announcement", "appreciation", "support", "onboarding", "other"]);
    let category: string | undefined;
    if (isNonEmptyString(dataObj.category)) {
      const c = dataObj.category.trim().toLowerCase().slice(0, 50);
      category = allowedCat.has(c) ? c : "other";
    }

    const meta: Record<string, unknown> = {
      ...(logCtx.metadata && typeof logCtx.metadata === "object" && !Array.isArray(logCtx.metadata)
        ? logCtx.metadata
        : {}),
    };
    if (category) meta.category = category;
    if (recipientName) meta.recipientName = recipientName;

    return {
      ok: true,
      payload: {
        emailType: "custom_manual",
        to: normalizedTo,
        data: {
          subject: subjectField.trim().slice(0, 300),
          body,
          ...(recipientName ? { recipientName } : {}),
          ...(category ? { category } : {}),
        },
        companyId: logCtx.companyId ?? null,
        companyName: logCtx.companyName ?? null,
        triggeredBy: "developer_manual_send",
        metadata: meta,
      },
    };
  }

  if (
    emailType !== "welcome" &&
    emailType !== "subscription_activated" &&
    emailType !== "trial_ending" &&
    emailType !== "company_approved"
  ) {
    return { ok: false, message: "Invalid or missing emailType" };
  }

  if (emailType === "welcome") {
    if (!isNonEmptyString(dataObj.companyName)) {
      return { ok: false, message: "data.companyName is required" };
    }
    const urlErr = requireHttpsUrl(dataObj.dashboardUrl, "data.dashboardUrl");
    if (urlErr) return { ok: false, message: urlErr };
    return {
      ok: true,
      payload: {
        emailType,
        to: normalizedTo,
        data: {
          companyName: dataObj.companyName.trim(),
          dashboardUrl: String(dataObj.dashboardUrl).trim(),
        },
        ...logCtx,
      },
    };
  }

  if (emailType === "company_approved") {
    if (!isNonEmptyString(dataObj.companyName)) {
      return { ok: false, message: "data.companyName is required" };
    }
    const urlErr = requireHttpsUrl(dataObj.dashboardUrl, "data.dashboardUrl");
    if (urlErr) return { ok: false, message: urlErr };
    return {
      ok: true,
      payload: {
        emailType: "company_approved",
        to: normalizedTo,
        data: {
          companyName: dataObj.companyName.trim(),
          dashboardUrl: String(dataObj.dashboardUrl).trim(),
        },
        ...logCtx,
      },
    };
  }

  if (emailType === "subscription_activated") {
    if (!isNonEmptyString(dataObj.companyName)) {
      return { ok: false, message: "data.companyName is required" };
    }
    if (!isNonEmptyString(dataObj.planName)) {
      return { ok: false, message: "data.planName is required" };
    }
    if (!isNonEmptyString(dataObj.renewalDate)) {
      return { ok: false, message: "data.renewalDate is required" };
    }
    const dashErr = requireHttpsUrl(dataObj.dashboardUrl, "data.dashboardUrl");
    if (dashErr) return { ok: false, message: dashErr };
    return {
      ok: true,
      payload: {
        emailType,
        to: normalizedTo,
        data: {
          companyName: dataObj.companyName.trim(),
          planName: dataObj.planName.trim(),
          renewalDate: dataObj.renewalDate.trim(),
          dashboardUrl: String(dataObj.dashboardUrl).trim(),
        },
        ...logCtx,
      },
    };
  }

  // trial_ending
  if (!isNonEmptyString(dataObj.companyName)) {
    return { ok: false, message: "data.companyName is required" };
  }
  const daysLeft = dataObj.daysLeft;
  if (typeof daysLeft !== "number" || !Number.isFinite(daysLeft) || daysLeft < 1) {
    return { ok: false, message: "data.daysLeft must be a number >= 1" };
  }
  const upErr = requireHttpsUrl(dataObj.upgradeUrl, "data.upgradeUrl");
  if (upErr) return { ok: false, message: upErr };

  return {
    ok: true,
    payload: {
      emailType: "trial_ending",
      to: normalizedTo,
      data: {
        companyName: dataObj.companyName.trim(),
        daysLeft: Math.floor(daysLeft),
        upgradeUrl: String(dataObj.upgradeUrl).trim(),
      },
      ...logCtx,
    },
  };
}

// M-Pesa STK Push — Daraja Lipa Na M-Pesa Online (Paybill).
// Auth: Clerk session JWT (Bearer) — required (signed-in user); billing path does NOT read profiles or company_members.
//   - Billing: company_id + billing_reference from client (UI already resolved). No DB lookup for billing_reference. If omitted, AccountReference falls back to FV-{first 8 of company_id}.
//   - Body: plan + billing_cycle + amount + billing_reference (camelCase or snake_case OK).
//   - developerStkTest / developer_stk_test: platform developer only; phone + amount only.
// All JSON responses use HTTP 200 so supabase.functions.invoke parses the body reliably.
// Deploy: supabase functions deploy mpesa-stk-push --no-verify-jwt
//
// Secrets: MPESA_ENV (sandbox|production), MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_CALLBACK_URL;
// sandbox STK uses hardcoded 174379 + sandbox passkey in mpesaConfig; production adds MPESA_SHORTCODE, MPESA_PASSKEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadMpesaConfig } from "../_shared/mpesaConfig.ts";
import { normalizeKenyaPhoneTo254 } from "../_shared/kenyaPhone.ts";
import { fetchMpesaAccessToken, initiateStkPush } from "../_shared/mpesaDaraja.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

/** Always 200 — clients read `success` / `error` / `detail`. */
function json(body: object) {
  return new Response(JSON.stringify(body), { status: 200, headers: corsHeaders });
}

function stkUnhandledErrorResponse(error: unknown): Response {
  console.error("STK ERROR:", error);
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";
  const stack = error instanceof Error ? error.stack ?? null : null;
  return new Response(
    JSON.stringify({
      success: false,
      error: message || "Unknown error",
      stack,
    }),
    {
      status: 200,
      headers: corsHeaders,
    },
  );
}

function clerkSubFromBearer(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Strip leading +, apply 07→2547… then full Kenya normalization (254 / 9-digit). */
function normalizePhoneForStk(raw: string): string | null {
  let p = raw.trim().replace(/\s+/g, "");
  if (!p) return null;
  p = p.replace(/^\+/, "");
  if (p.startsWith("07")) {
    p = "254" + p.slice(1);
  } else if (p.startsWith("01")) {
    p = "254" + p.slice(1);
  }
  return normalizeKenyaPhoneTo254(p);
}

async function assertPlatformDeveloper(
  supabaseUrl: string,
  supabaseAnonKey: string,
  authHeader: string,
): Promise<Response | null> {
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  try {
    const { data, error: devErr } = await userClient.rpc("is_developer");
    if (devErr) {
      console.error("[mpesa-stk-push] is_developer RPC error", devErr.message);
      return json({ success: false, error: "Forbidden", detail: devErr.message || "Developer check failed" });
    }
    if (data !== true) {
      return json({
        success: false,
        error: "Forbidden",
        detail: "Developer STK test is only available to platform developers.",
      });
    }
  } catch (rpcErr) {
    console.error("[mpesa-stk-push] is_developer threw", rpcErr);
    return json({ success: false, error: "Forbidden", detail: "Developer check failed" });
  }
  return null;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ success: false, error: "Method not allowed" });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, error: "Unauthorized", detail: "Missing Bearer token" });
    }
    const token = authHeader.replace("Bearer ", "").trim();
    const clerkUserId = clerkSubFromBearer(token);
    if (!clerkUserId) {
      return json({ success: false, error: "Unauthorized", detail: "Invalid token" });
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      throw new Error("Invalid JSON body");
    }
    if (!body || typeof body !== "object") {
      throw new Error("Invalid JSON body");
    }

    const phone =
      asTrimmedString(body.phone) ||
      asTrimmedString(body.phoneNumber);
    if (!phone) {
      throw new Error("Missing phone");
    }

    const amount = Number(body.amount);
    if (amount == null || Number.isNaN(amount)) {
      throw new Error("Missing amount");
    }
    if (amount <= 0) {
      throw new Error("Invalid amount");
    }
    const amountRounded = Math.round(amount);

    const normalizedPhone = normalizePhoneForStk(phone);
    if (!normalizedPhone) {
      throw new Error("Enter a valid Kenya number (e.g. 07… or +254…)");
    }

    const company_id =
      asTrimmedString(body.company_id) ||
      asTrimmedString(body.companyId) ||
      null;
    const plan =
      asTrimmedString(body.plan) ||
      asTrimmedString(body.planCode) ||
      null;
    const billing_cycle =
      asTrimmedString(body.billing_cycle) ||
      asTrimmedString(body.billingCycle) ||
      null;
    const billing_reference =
      asTrimmedString(body.billing_reference) ||
      asTrimmedString(body.billingReference) ||
      null;

    const isDeveloperPayload =
      body.developerStkTest === true ||
      body.developer_stk_test === true;

    if (!isDeveloperPayload) {
      if (!company_id) throw new Error("Missing company_id");
      if (!plan) throw new Error("Missing plan");
      if (!billing_cycle) throw new Error("Missing billing_cycle");
      console.log("STK Init:", {
        company_id,
        billing_reference,
        plan,
        billing_cycle,
        phone: normalizedPhone,
        amount: amountRounded,
      });
    }

    console.log("STK PAYLOAD:", {
      phone: normalizedPhone,
      amount: amountRounded,
      company_id,
      plan,
      billing_cycle,
      billing_reference: billing_reference ?? "(dev or omitted)",
      developer: isDeveloperPayload,
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      console.error("[mpesa-stk-push] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return json({ success: false, error: "Server misconfiguration" });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    let amountKes: number;
    let paymentCompanyId: string | null = null;
    let billingPlan: string | null = null;
    let billingCycleStored: string | null = null;
    let accountReferenceForStk: string | undefined;
    let transactionDescForStk: string | undefined;
    let resolvedBillingReference: string | null = null;

    if (isDeveloperPayload) {
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
      if (!supabaseAnonKey) {
        console.error("[mpesa-stk-push] Missing SUPABASE_ANON_KEY (required for developer STK test)");
        return json({
          success: false,
          error: "Server misconfiguration",
          detail: "SUPABASE_ANON_KEY missing",
        });
      }
      const devGate = await assertPlatformDeveloper(supabaseUrl, supabaseAnonKey, authHeader);
      if (devGate) return devGate;

      paymentCompanyId = null;

      amountKes = amountRounded;
      console.log("STK Amount:", amountRounded);
      accountReferenceForStk = "FV-DEVSTK";
      transactionDescForStk = "FV dev STK";
    } else {
      const planCode = plan!.toLowerCase();
      const billingCycle = billing_cycle!.toLowerCase();

      if (planCode !== "basic" && planCode !== "pro") {
        throw new Error("plan must be basic or pro");
      }
      if (billingCycle !== "monthly" && billingCycle !== "seasonal" && billingCycle !== "annual") {
        throw new Error("billing_cycle must be monthly, seasonal, or annual");
      }

      const { data: priceRow, error: priceErr } = await admin
        .schema("core")
        .from("billing_prices")
        .select("amount")
        .eq("plan", planCode)
        .eq("cycle", billingCycle)
        .maybeSingle();

      if (priceErr) {
        console.error("[mpesa-stk-push] billing_prices load", priceErr.message);
        return json({
          success: false,
          error: "Failed to load checkout pricing",
          detail: priceErr.message,
        });
      }

      const resolved = priceRow != null && priceRow.amount != null && String(priceRow.amount).trim() !== ""
        ? Math.round(Number(priceRow.amount))
        : NaN;
      if (!Number.isFinite(resolved) || resolved < 0) {
        return json({
          success: false,
          error: "Pricing not configured",
          detail: `Missing or invalid core.billing_prices for ${planCode} / ${billingCycle}`,
        });
      }
      if (amountRounded !== resolved) {
        throw new Error("Amount does not match selected plan");
      }
      amountKes = amountRounded;
      console.log("STK Amount:", amountRounded);

      console.log("[mpesa-stk-push] billing STK", {
        company_id,
        clerk_sub: clerkUserId,
      });

      paymentCompanyId = company_id || null;
      billingPlan = planCode;
      billingCycleStored = billingCycle;

      const refFromBody = billing_reference?.trim() ?? "";
      const accountRefFull =
        refFromBody || (company_id ? `FV-${company_id.slice(0, 8)}` : "");
      if (!accountRefFull) {
        return json({
          success: false,
          error: "Bad request",
          detail: "company_id required to build billing account reference",
        });
      }
      resolvedBillingReference = accountRefFull;
      accountReferenceForStk = accountRefFull.slice(0, 12);
      transactionDescForStk = `FV ${planCode}`.slice(0, 13);
    }

    const cfg = loadMpesaConfig();
    console.log("[mpesa-stk-debug] MPESA_ENV:", cfg.env);
    console.log("[mpesa-stk-debug] Using shortcode:", cfg.shortcode);
    console.log("[mpesa-stk-debug] Using baseURL:", cfg.baseUrl);

    const accessToken = await fetchMpesaAccessToken(cfg);
    const stk = await initiateStkPush(cfg, accessToken, {
      phone254: normalizedPhone,
      amountKes,
      accountReference: accountReferenceForStk,
      transactionDesc: transactionDescForStk,
    });

    console.log("[mpesa] STK push completed", {
      env: cfg.env,
      checkoutRequestId: stk.checkoutRequestId,
      developerTest: isDeveloperPayload,
    });

    const billingRefForRow: string | null = isDeveloperPayload
      ? (accountReferenceForStk ?? null)
      : resolvedBillingReference;

    const { error: payInsErr } = await admin.from("mpesa_payments").insert({
      checkout_request_id: stk.checkoutRequestId,
      company_id: paymentCompanyId,
      billing_reference: billingRefForRow,
      plan: billingPlan,
      billing_cycle: billingCycleStored,
      amount: amountKes,
      phone: normalizedPhone,
      status: "PENDING",
      subscription_activated: false,
      result_code: null,
    });
    if (payInsErr) {
      console.error("[mpesa-stk-push] mpesa_payments insert failed", payInsErr.message);
    }

    return json({
      success: true,
      ok: true,
      checkoutRequestId: stk.checkoutRequestId,
      merchantRequestId: stk.merchantRequestId,
      customerMessage: stk.customerMessage,
      amountKes,
      mpesaEnv: cfg.env,
      developerStkTest: isDeveloperPayload,
    });
  } catch (error) {
    return stkUnhandledErrorResponse(error);
  }
}

Deno.serve(handler);

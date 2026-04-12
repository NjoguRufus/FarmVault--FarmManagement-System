// M-Pesa STK Push — Daraja Lipa Na M-Pesa Online (Paybill).
// Auth: Clerk session JWT (Bearer) — required (signed-in user); billing path does NOT read profiles or company_members.
//   - Billing: company_id + billing_reference from client (UI already resolved). No DB lookup for billing_reference. If omitted, AccountReference falls back to FV-{first 8 of company_id}.
//   - Body: plan + billing_cycle + amount + billing_reference (camelCase or snake_case OK).
//   - developerStkTest / developer_stk_test: platform developer only; phone + amount only.
// CORS: full preflight + JSON responses always include Access-Control-* so browser fetch never fails silently.
//
// Deploy: npx supabase functions deploy mpesa-stk-push --no-verify-jwt
//
// Secrets: MPESA_ENV (sandbox|production), MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_CALLBACK_URL;
// sandbox STK uses hardcoded 174379 + sandbox passkey in mpesaConfig; production adds MPESA_SHORTCODE, MPESA_PASSKEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EDGE_FUNCTION_CORS_HEADERS, jsonResponse } from "../_shared/edgeCors.ts";
import { loadMpesaConfig } from "../_shared/mpesaConfig.ts";
import { normalizeKenyaPhoneTo254 } from "../_shared/kenyaPhone.ts";
import { fetchMpesaAccessToken, initiateStkPush } from "../_shared/mpesaDaraja.ts";
import {
  serveFarmVaultEdge,
  type FarmVaultEdgeContext,
} from "../_shared/withEdgeLogging.ts";

/** Merge CORS + JSON content type for successful / business-logic responses. */
function corsJsonHeaders(): Headers {
  const h = new Headers(EDGE_FUNCTION_CORS_HEADERS);
  h.set("Content-Type", "application/json");
  return h;
}

/**
 * Business and validation responses stay HTTP 200 so supabase.functions.invoke
 * reliably exposes JSON in `data` / `error.context`; failures use `success: false`.
 */
function jsonOk(body: object): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: corsJsonHeaders(),
  });
}

function logStk(level: "info" | "error", msg: string, extra?: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    edgeFunction: "mpesa-stk-push",
    level,
    msg,
    ...extra,
  });
  if (level === "error") console.error(line);
  else console.log(line);
}

function stkErrorResponse(error: unknown, status: number): Response {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Internal error";
  const stack = error instanceof Error ? error.stack : undefined;
  logStk("error", "STK_PUSH_ERROR", { message, stack });
  return jsonResponse(
    {
      success: false,
      error: message || "Internal error",
    },
    status,
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
      logStk("error", "is_developer RPC error", { detail: devErr.message });
      return jsonOk({ success: false, error: "Forbidden", detail: devErr.message || "Developer check failed" });
    }
    if (data !== true) {
      return jsonOk({
        success: false,
        error: "Forbidden",
        detail: "Developer STK test is only available to platform developers.",
      });
    }
  } catch (rpcErr) {
    logStk("error", "is_developer threw", { detail: String(rpcErr) });
    return jsonOk({ success: false, error: "Forbidden", detail: "Developer check failed" });
  }
  return null;
}

/** Validate Daraja secrets before any outbound M-Pesa HTTP (fail fast, clear message). */
function assertMpesaEnvForStk(): void {
  if (!Deno.env.get("MPESA_CONSUMER_KEY")?.trim()) {
    throw new Error("Missing MPESA_CONSUMER_KEY");
  }
  if (!Deno.env.get("MPESA_CONSUMER_SECRET")?.trim()) {
    throw new Error("Missing MPESA_CONSUMER_SECRET");
  }
}

export default async function handler(
  req: Request,
  _ctx: FarmVaultEdgeContext,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: new Headers(EDGE_FUNCTION_CORS_HEADERS) });
  }

  try {
    if (req.method !== "POST") {
      return jsonOk({ success: false, error: "Method not allowed" });
    }

    console.log("STK PUSH TRIGGERED");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonOk({ success: false, error: "Unauthorized", detail: "Missing Bearer token" });
    }
    const token = authHeader.replace("Bearer ", "").trim();
    const clerkUserId = clerkSubFromBearer(token);
    if (!clerkUserId) {
      return jsonOk({ success: false, error: "Unauthorized", detail: "Invalid token" });
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonOk({ success: false, error: "Invalid JSON body" });
    }
    if (!body || typeof body !== "object") {
      return jsonOk({ success: false, error: "Invalid JSON body" });
    }

    console.log("Request body:", JSON.stringify(body));
    logStk("info", "STK_PUSH_REQUEST_BODY", { body });

    const idempotencyKey =
      (req.headers.get("Idempotency-Key") ?? req.headers.get("idempotency-key") ?? "").trim() ||
      asTrimmedString(body.idempotencyKey) ||
      asTrimmedString(body.idempotency_key);

    const phone =
      asTrimmedString(body.phone) ||
      asTrimmedString(body.phoneNumber);
    if (!phone) {
      return jsonOk({ success: false, error: "Missing phone" });
    }

    const amount = Number(body.amount);
    if (amount == null || Number.isNaN(amount)) {
      return jsonOk({ success: false, error: "Missing amount" });
    }
    if (amount <= 0) {
      return jsonOk({ success: false, error: "Invalid amount" });
    }
    const amountRounded = Math.round(amount);

    const normalizedPhone = normalizePhoneForStk(phone);
    if (!normalizedPhone) {
      return jsonOk({
        success: false,
        error: "Enter a valid Kenya number (e.g. 07… or +254…)",
      });
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
      if (!idempotencyKey) {
        return jsonOk({
          success: false,
          error: "Missing Idempotency-Key",
          detail:
            "Send header Idempotency-Key or body idempotency_key (UUID) for each checkout attempt so duplicate STK pushes are prevented.",
        });
      }
      if (!company_id) {
        return jsonOk({ success: false, error: "Missing company_id" });
      }
      if (!plan) {
        return jsonOk({ success: false, error: "Missing plan" });
      }
      if (!billing_cycle) {
        return jsonOk({ success: false, error: "Missing billing_cycle" });
      }
      logStk("info", "STK_INIT", {
        company_id,
        billing_reference,
        plan,
        billing_cycle,
        phone: normalizedPhone,
        amount: amountRounded,
      });
    }

    logStk("info", "STK_PAYLOAD", {
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
      logStk("error", "missing_supabase_env");
      return jsonOk({ success: false, error: "Server misconfiguration" });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    if (idempotencyKey) {
      const { data: prior, error: idLookErr } = await admin
        .from("mpesa_payments")
        .select("checkout_request_id, status")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (idLookErr) {
        logStk("error", "idempotency_lookup_failed", { detail: idLookErr.message });
      } else if (prior && (prior as { checkout_request_id?: string }).checkout_request_id) {
        const ck = String((prior as { checkout_request_id: string }).checkout_request_id);
        const cfgEarly = loadMpesaConfig();
        logStk("info", "idempotent_replay", { idempotencyKey });
        return jsonOk({
          success: true,
          ok: true,
          checkoutRequestId: ck,
          idempotentReplay: true,
          amountKes: amountRounded,
          mpesaEnv: cfgEarly.env,
          developerStkTest: isDeveloperPayload,
        });
      }
    }

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
        logStk("error", "missing_SUPABASE_ANON_KEY");
        return jsonOk({
          success: false,
          error: "Server misconfiguration",
          detail: "SUPABASE_ANON_KEY missing",
        });
      }
      const devGate = await assertPlatformDeveloper(supabaseUrl, supabaseAnonKey, authHeader);
      if (devGate) return devGate;

      paymentCompanyId = null;

      amountKes = amountRounded;
      logStk("info", "STK_AMOUNT", { amountKes: amountRounded });
      accountReferenceForStk = "FV-DEVSTK";
      transactionDescForStk = "FV dev STK";
    } else {
      const planCode = plan!.toLowerCase();
      const billingCycle = billing_cycle!.toLowerCase();

      if (planCode !== "basic" && planCode !== "pro") {
        return jsonOk({ success: false, error: "plan must be basic or pro" });
      }
      if (billingCycle !== "monthly" && billingCycle !== "seasonal" && billingCycle !== "annual") {
        return jsonOk({
          success: false,
          error: "billing_cycle must be monthly, seasonal, or annual",
        });
      }

      const { data: priceRow, error: priceErr } = await admin
        .schema("core")
        .from("billing_prices")
        .select("amount")
        .eq("plan", planCode)
        .eq("cycle", billingCycle)
        .maybeSingle();

      if (priceErr) {
        logStk("error", "billing_prices_load", { detail: priceErr.message });
        return jsonOk({
          success: false,
          error: "Failed to load checkout pricing",
          detail: priceErr.message,
        });
      }

      const resolved = priceRow != null && priceRow.amount != null && String(priceRow.amount).trim() !== ""
        ? Math.round(Number(priceRow.amount))
        : NaN;
      if (!Number.isFinite(resolved) || resolved < 0) {
        return jsonOk({
          success: false,
          error: "Pricing not configured",
          detail: `Missing or invalid core.billing_prices for ${planCode} / ${billingCycle}`,
        });
      }
      if (amountRounded !== resolved) {
        return jsonOk({ success: false, error: "Amount does not match selected plan" });
      }
      amountKes = amountRounded;
      logStk("info", "STK_AMOUNT", { amountKes: amountRounded });

      logStk("info", "STK_BILLING", {
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
        return jsonOk({
          success: false,
          error: "Bad request",
          detail: "company_id required to build billing account reference",
        });
      }
      resolvedBillingReference = accountRefFull;
      accountReferenceForStk = accountRefFull.slice(0, 12);
      transactionDescForStk = `FV ${planCode}`.slice(0, 13);
    }

    assertMpesaEnvForStk();

    const cfg = loadMpesaConfig();
    logStk("info", "mpesa_stk_debug", {
      MPESA_ENV: cfg.env,
      shortcode: cfg.shortcode,
      baseUrl: cfg.baseUrl,
    });

    let accessToken: string;
    try {
      accessToken = await fetchMpesaAccessToken(cfg);
    } catch (e) {
      logStk("error", "mpesa_oauth_failed", { detail: String(e) });
      throw e;
    }

    let stk: Awaited<ReturnType<typeof initiateStkPush>>;
    try {
      stk = await initiateStkPush(cfg, accessToken, {
        phone254: normalizedPhone,
        amountKes,
        accountReference: accountReferenceForStk,
        transactionDesc: transactionDescForStk,
      });
    } catch (e) {
      logStk("error", "mpesa_stk_push_failed", { detail: String(e) });
      throw e;
    }

    logStk("info", "STK_PUSH_COMPLETED", {
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
      idempotency_key: idempotencyKey || null,
    });
    if (payInsErr) {
      if (idempotencyKey && payInsErr.code === "23505") {
        const { data: row } = await admin
          .from("mpesa_payments")
          .select("checkout_request_id")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        const ck = row && (row as { checkout_request_id?: string }).checkout_request_id
          ? String((row as { checkout_request_id: string }).checkout_request_id)
          : null;
        if (ck) {
          logStk("info", "idempotent_replay_after_race", { idempotencyKey });
          return jsonOk({
            success: true,
            ok: true,
            checkoutRequestId: ck,
            idempotentReplay: true,
            amountKes,
            mpesaEnv: loadMpesaConfig().env,
            developerStkTest: isDeveloperPayload,
          });
        }
      }
      logStk("error", "mpesa_payments_insert_failed", { detail: payInsErr.message });
    }

    return jsonOk({
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
    return stkErrorResponse(error, 500);
  }
}

serveFarmVaultEdge("mpesa-stk-push", handler);

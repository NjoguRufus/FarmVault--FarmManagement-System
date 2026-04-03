// M-Pesa STK Push — Daraja Lipa Na M-Pesa Online (Paybill).
// Auth: Clerk session JWT (Bearer).
//   - Normal: profile.company_id must match body.companyId; amount from plan/cycle.
//   - developerStkTest: platform developer only (is_developer RPC); fixed KES 1.
// Deploy: supabase functions deploy mpesa-stk-push --no-verify-jwt
//
// Secrets: MPESA_ENV, MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_CALLBACK_URL, MPESA_SHORTCODE, MPESA_PASSKEY (see _shared/mpesaConfig.ts).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadMpesaConfig } from "../_shared/mpesaConfig.ts";
import { resolveCheckoutAmountKes, type CheckoutBillingCycle, type CheckoutPlanCode } from "../_shared/billingCheckoutAmount.ts";
import { normalizeKenyaPhoneTo254 } from "../_shared/kenyaPhone.ts";
import { fetchMpesaAccessToken, initiateStkPush } from "../_shared/mpesaDaraja.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const DEV_TEST_AMOUNT_KES = 1;

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
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
      return json({ success: false, error: "Forbidden", detail: devErr.message || "Developer check failed" }, 403);
    }
    if (data !== true) {
      return json({
        success: false,
        error: "Forbidden",
        detail: "Developer STK test is only available to platform developers.",
      }, 403);
    }
  } catch (rpcErr) {
    console.error("[mpesa-stk-push] is_developer threw", rpcErr);
    return json({ success: false, error: "Forbidden", detail: "Developer check failed" }, 403);
  }
  return null;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ success: false, error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, error: "Unauthorized", detail: "Missing Bearer token" }, 401);
    }
    const token = authHeader.replace("Bearer ", "").trim();
    const clerkUserId = clerkSubFromBearer(token);
    if (!clerkUserId) {
      return json({ success: false, error: "Unauthorized", detail: "Invalid token" }, 401);
    }

    const body = (await req.json()) as {
      developerStkTest?: boolean;
      companyId?: string;
      phoneNumber?: string;
      planCode?: string;
      billingCycle?: string;
    };

    const phoneNumber = typeof body.phoneNumber === "string" ? body.phoneNumber.trim() : "";
    if (!phoneNumber) {
      return json({ success: false, error: "Invalid payload", detail: "phoneNumber is required" }, 400);
    }

    const phone254 = normalizeKenyaPhoneTo254(phoneNumber);
    if (!phone254) {
      return json({
        success: false,
        error: "Invalid payload",
        detail: "Enter a valid Kenya number (e.g. 07… or +254…)",
      }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      console.error("[mpesa-stk-push] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return json({ success: false, error: "Server misconfiguration" }, 500);
    }

    let amountKes: number;
    /** For `public.mpesa_payments` (RLS + realtime). Null only if developer profile has no company. */
    let paymentCompanyId: string | null = null;

    if (body.developerStkTest === true) {
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
      if (!supabaseAnonKey) {
        console.error("[mpesa-stk-push] Missing SUPABASE_ANON_KEY (required for developer STK test)");
        return json({
          success: false,
          error: "Server misconfiguration",
          detail: "SUPABASE_ANON_KEY missing",
        }, 500);
      }
      const devGate = await assertPlatformDeveloper(supabaseUrl, supabaseAnonKey, authHeader);
      if (devGate) return devGate;

      const adminDev = createClient(supabaseUrl, serviceKey);
      const { data: devProfile } = await adminDev
        .from("profiles")
        .select("company_id")
        .eq("clerk_user_id", clerkUserId)
        .maybeSingle();
      paymentCompanyId = (devProfile?.company_id as string | undefined) ?? null;

      amountKes = DEV_TEST_AMOUNT_KES;
    } else {
      const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
      const planCode = typeof body.planCode === "string" ? body.planCode.trim().toLowerCase() : "";
      const billingCycle = typeof body.billingCycle === "string" ? body.billingCycle.trim().toLowerCase() : "";

      if (!companyId) {
        return json({ success: false, error: "Invalid payload", detail: "companyId is required" }, 400);
      }
      if (planCode !== "basic" && planCode !== "pro") {
        return json({ success: false, error: "Invalid payload", detail: "planCode must be basic or pro" }, 400);
      }
      if (billingCycle !== "monthly" && billingCycle !== "seasonal" && billingCycle !== "annual") {
        return json({
          success: false,
          error: "Invalid payload",
          detail: "billingCycle must be monthly, seasonal, or annual",
        }, 400);
      }

      const resolved = resolveCheckoutAmountKes(planCode as CheckoutPlanCode, billingCycle as CheckoutBillingCycle);
      if (resolved == null) {
        return json({
          success: false,
          error: "Invalid checkout",
          detail: "Could not resolve amount for plan/cycle",
        }, 400);
      }
      amountKes = resolved;

      const admin = createClient(supabaseUrl, serviceKey);
      const { data: profile, error: profErr } = await admin
        .from("profiles")
        .select("company_id")
        .eq("clerk_user_id", clerkUserId)
        .maybeSingle();

      if (profErr) {
        console.error("[mpesa-stk-push] profile lookup", profErr.message);
        return json({ success: false, error: "Failed to verify workspace" }, 500);
      }
      const profileCompany = profile?.company_id as string | undefined;
      if (!profileCompany || profileCompany !== companyId) {
        return json({
          success: false,
          error: "Forbidden",
          detail: "You cannot initiate payment for this workspace",
        }, 403);
      }
      paymentCompanyId = companyId;
    }

    const cfg = loadMpesaConfig();
    const accessToken = await fetchMpesaAccessToken(cfg);
    const stk = await initiateStkPush(cfg, accessToken, {
      phone254,
      amountKes,
    });

    console.log("[mpesa] STK push completed", {
      env: cfg.env,
      checkoutRequestId: stk.checkoutRequestId,
      developerTest: body.developerStkTest === true,
    });

    const adminPay = createClient(supabaseUrl, serviceKey);
    const { error: payInsErr } = await adminPay.from("mpesa_payments").insert({
      checkout_request_id: stk.checkoutRequestId,
      company_id: paymentCompanyId,
      amount: amountKes,
      phone: phone254,
      status: "PENDING",
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
      developerStkTest: body.developerStkTest === true,
    });
  } catch (error) {
    return stkUnhandledErrorResponse(error);
  }
}

Deno.serve(handler);

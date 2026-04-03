/**
 * M-Pesa Daraja — credentials only from environment (Supabase Edge secrets / Deno.env).
 *
 * Deno.env.get:
 *   MPESA_ENV — "sandbox" | "production" (default: sandbox)
 *   MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET (required)
 *   MPESA_SHORTCODE, MPESA_PASSKEY (required — use your Daraja sandbox or live app credentials)
 *   MPESA_CALLBACK_URL — public URL of `mpesa-stk-callback` (required)
 *
 * Sandbox (MPESA_ENV=sandbox):
 *   OAuth: https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials
 *   STK:   https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest
 *
 * Production: same paths on https://api.safaricom.co.ke
 */

export type MpesaEnvName = "sandbox" | "production";

export interface MpesaActiveConfig {
  env: MpesaEnvName;
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackUrl: string;
}

function darajaBaseUrlForEnv(env: MpesaEnvName): string {
  return env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
}

/** Reads only MPESA_ENV (default sandbox). For callback logging without requiring all Daraja secrets. */
export function readMpesaEnvMode(): MpesaEnvName {
  const envRaw = Deno.env.get("MPESA_ENV") || "sandbox";
  return String(envRaw).toLowerCase().trim() === "production" ? "production" : "sandbox";
}

export function loadMpesaConfig(): MpesaActiveConfig {
  const envRaw = Deno.env.get("MPESA_ENV") || "sandbox";
  const env: MpesaEnvName = String(envRaw).toLowerCase().trim() === "production"
    ? "production"
    : "sandbox";

  console.log(
    env === "production"
      ? "Using MPESA production environment"
      : "Using MPESA sandbox environment",
  );

  const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY")?.trim() ?? "";
  const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET")?.trim() ?? "";

  if (!consumerKey) {
    throw new Error("MPESA_CONSUMER_KEY is missing — set it in Supabase Edge secrets");
  }
  if (!consumerSecret) {
    throw new Error("MPESA_CONSUMER_SECRET is missing — set it in Supabase Edge secrets");
  }

  const shortcode = Deno.env.get("MPESA_SHORTCODE")?.trim() ?? "";
  const passkey = Deno.env.get("MPESA_PASSKEY")?.trim() ?? "";

  if (!shortcode) {
    throw new Error("MPESA_SHORTCODE is missing — set it in Supabase Edge secrets");
  }
  if (!passkey) {
    throw new Error("MPESA_PASSKEY is missing — set it in Supabase Edge secrets");
  }

  const callbackUrl = Deno.env.get("MPESA_CALLBACK_URL")?.trim() ?? "";
  if (!callbackUrl) {
    throw new Error("MPESA_CALLBACK_URL is missing — set it in Supabase Edge secrets");
  }

  const baseUrl = darajaBaseUrlForEnv(env);
  console.log("[mpesa-config] shortcode in use", { shortcode, baseUrl });

  return {
    env,
    baseUrl,
    consumerKey,
    consumerSecret,
    shortcode,
    passkey,
    callbackUrl,
  };
}

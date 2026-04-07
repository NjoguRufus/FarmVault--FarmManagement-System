/**
 * M-Pesa Daraja — OAuth/STK credentials for Edge Functions.
 *
 * MPESA_ENV (default sandbox):
 *   - sandbox: Daraja test shortcode 174379 + sandbox passkey + sandbox.safaricom.co.ke
 *     (ignores MPESA_SHORTCODE / MPESA_PASSKEY so live PayBill secrets never hit sandbox STK)
 *   - production: MPESA_SHORTCODE, MPESA_PASSKEY, api.safaricom.co.ke (both required)
 *
 * Always from secrets: MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_CALLBACK_URL
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

/** Sandbox Lipa Na M-Pesa Online test paybill (STK only — UI manual PayBill unchanged). */
const SANDBOX_STK_SHORTCODE = "174379";
/** Daraja sandbox passkey for the test app above. */
const SANDBOX_STK_PASSKEY =
  "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ad1ed2c919";

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

  let shortcode: string;
  let passkey: string;

  if (env === "sandbox") {
    shortcode = SANDBOX_STK_SHORTCODE;
    passkey = SANDBOX_STK_PASSKEY;
  } else {
    shortcode = Deno.env.get("MPESA_SHORTCODE")?.trim() ?? "";
    passkey = Deno.env.get("MPESA_PASSKEY")?.trim() ?? "";
    if (!shortcode) {
      throw new Error("MPESA_SHORTCODE is missing — set it in Supabase Edge secrets for production");
    }
    if (!passkey) {
      throw new Error("MPESA_PASSKEY is missing — set it in Supabase Edge secrets for production");
    }
  }

  const callbackUrl =
    (Deno.env.get("MPESA_CALLBACK_URL")?.trim() ??
      Deno.env.get("MPESA_STK_CALLBACK_URL")?.trim() ??
      "");
  if (!callbackUrl) {
    throw new Error(
      "MPESA_CALLBACK_URL is missing — set it in Supabase Edge secrets (or MPESA_STK_CALLBACK_URL for legacy)",
    );
  }

  const baseUrl = darajaBaseUrlForEnv(env);

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

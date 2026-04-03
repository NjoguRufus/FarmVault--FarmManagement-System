import type { MpesaActiveConfig } from "./mpesaConfig.ts";

const OAUTH_USER_MESSAGE = "OAuth failed - check consumer credentials";

/** Daraja limits: AccountReference ≤12, TransactionDesc ≤13. */
const STK_ACCOUNT_REFERENCE = "FarmVault";
const STK_TRANSACTION_DESC = "FarmVault Sub";

export interface StkPushInput {
  phone254: string;
  amountKes: number;
}

export interface StkPushSuccess {
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  responseDescription: string;
  customerMessage?: string;
}

/** YYYYMMDDHHmmss in Africa/Nairobi (Daraja STK). */
function mpesaTimestampNairobi(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const m: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") m[p.type] = p.value;
  }
  const y = m.year;
  const mo = m.month;
  const da = m.day;
  const h = m.hour;
  const mi = m.minute;
  const se = m.second;
  if (!y || !mo || !da || !h || !mi || !se) {
    throw new Error("Failed to build M-Pesa STK timestamp (Africa/Nairobi)");
  }
  return `${y}${mo}${da}${h}${mi}${se}`;
}

/** Password = Base64(Shortcode + Passkey + Timestamp). */
function buildStkPassword(shortcode: string, passkey: string, timestamp: string): string {
  return btoa(`${shortcode}${passkey}${timestamp}`);
}

/**
 * GET {baseUrl}/oauth/v1/generate?grant_type=client_credentials
 * Authorization: Basic base64(consumerKey:consumerSecret)
 * Uses credentials from `loadMpesaConfig()` (MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET).
 */
export async function fetchMpesaAccessToken(cfg: MpesaActiveConfig): Promise<string> {
  const key = cfg.consumerKey;
  const secret = cfg.consumerSecret;

  const encoder = new TextEncoder();
  const data = encoder.encode(`${key}:${secret}`);
  const auth = btoa(String.fromCharCode(...data));

  const tokenUrl = `${cfg.baseUrl}/oauth/v1/generate?grant_type=client_credentials`;

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(tokenUrl, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });
  } catch (e) {
    console.error("[mpesa-oauth] fetch error", e);
    throw new Error(OAUTH_USER_MESSAGE);
  }

  const tokenText = await tokenResponse.text();

  if (!tokenResponse.ok) {
    console.error("[mpesa-oauth] HTTP", tokenResponse.status, tokenText.slice(0, 400));
    throw new Error(OAUTH_USER_MESSAGE);
  }

  let tokenData: { access_token?: string };
  try {
    tokenData = JSON.parse(tokenText) as { access_token?: string };
  } catch (e) {
    console.error("[mpesa-oauth] JSON parse error", e, tokenText.slice(0, 200));
    throw new Error(OAUTH_USER_MESSAGE);
  }

  if (!tokenData.access_token) {
    console.error("[mpesa-oauth] no access_token in body", tokenText.slice(0, 400));
    throw new Error(OAUTH_USER_MESSAGE);
  }

  console.log("[mpesa] OAuth success", { env: cfg.env, shortcode: cfg.shortcode });
  return tokenData.access_token;
}

/**
 * POST /mpesa/stkpush/v1/processrequest
 */
export async function initiateStkPush(
  cfg: MpesaActiveConfig,
  accessToken: string,
  params: StkPushInput,
): Promise<StkPushSuccess> {
  const timestamp = mpesaTimestampNairobi();
  const password = buildStkPassword(cfg.shortcode, cfg.passkey, timestamp);
  const amountInt = Math.round(Number(params.amountKes));
  if (!Number.isFinite(amountInt) || amountInt < 1) {
    throw new Error("Invalid STK amount");
  }

  const phone = params.phone254;

  const body = {
    BusinessShortCode: cfg.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: String(amountInt),
    PartyA: phone,
    PartyB: cfg.shortcode,
    PhoneNumber: phone,
    CallBackURL: cfg.callbackUrl,
    AccountReference: STK_ACCOUNT_REFERENCE,
    TransactionDesc: STK_TRANSACTION_DESC,
  };

  console.log("[mpesa] STK request sent", {
    env: cfg.env,
    shortcode: cfg.shortcode,
    timestamp,
    amountKes: amountInt,
    phoneSuffix: phone.slice(-4),
  });

  let stkResponse: Response;
  try {
    stkResponse = await fetch(`${cfg.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("[mpesa] STK fetch error", e);
    throw new Error("STK request failed — network error");
  }

  const stkText = await stkResponse.text();

  let stkData: {
    MerchantRequestID?: string;
    CheckoutRequestID?: string;
    ResponseCode?: string;
    ResponseDescription?: string;
    CustomerMessage?: string;
    errorCode?: string;
    errorMessage?: string;
  };

  try {
    stkData = stkText.trim() ? (JSON.parse(stkText) as typeof stkData) : {};
  } catch {
    const msg = stkText.slice(0, 300) || "Non-JSON STK response";
    console.error("[mpesa] STK non-JSON", msg);
    throw new Error(msg);
  }

  if (!stkResponse.ok) {
    const msg = stkData.errorMessage ?? stkData.ResponseDescription ?? stkText.slice(0, 300);
    console.error("[mpesa] STK HTTP error", stkResponse.status, msg);
    throw new Error(msg);
  }

  const code = stkData.ResponseCode ?? "";
  if (code !== "0") {
    const msg = stkData.ResponseDescription ?? stkData.CustomerMessage ?? "STK initiation rejected";
    console.warn("[mpesa] STK rejected by Daraja", msg);
    throw new Error(msg);
  }

  const merchantRequestId = stkData.MerchantRequestID ?? "";
  const checkoutRequestId = stkData.CheckoutRequestID ?? "";
  if (!merchantRequestId || !checkoutRequestId) {
    throw new Error("M-Pesa STK: missing MerchantRequestID or CheckoutRequestID");
  }

  console.log("[mpesa] STK Daraja accepted", {
    checkoutRequestId,
    merchantRequestId: merchantRequestId.slice(0, 8) + "…",
  });

  return {
    merchantRequestId,
    checkoutRequestId,
    responseCode: code,
    responseDescription: stkData.ResponseDescription ?? "",
    customerMessage: stkData.CustomerMessage,
  };
}

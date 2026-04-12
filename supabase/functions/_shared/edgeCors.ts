/**
 * Shared CORS headers for browser-invoked Edge Functions.
 * Include any custom request headers used by the client in Access-Control-Allow-Headers
 * or the browser will fail the preflight (network shows "Provisional headers", fetch throws).
 */
export const EDGE_FUNCTION_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key, x-supabase-api-version, prefer, baggage, sentry-trace",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function jsonResponse(
  body: object,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  const headers = new Headers({
    ...EDGE_FUNCTION_CORS_HEADERS,
    "Content-Type": "application/json",
    ...extraHeaders,
  });
  return new Response(JSON.stringify(body), { status, headers });
}

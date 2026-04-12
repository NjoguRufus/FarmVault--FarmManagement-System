/**
 * Global edge-function logging wrapper for FarmVault.
 * - Logs every request start/end (structured JSON on stdout → Supabase logs).
 * - Logs uncaught errors with stack (stderr).
 * - Adds x-farmvault-request-id on successful responses for traceability.
 * Never logs Authorization or secret headers.
 * Uncaught errors return JSON 500 with CORS so browser clients do not see opaque "Failed to fetch".
 */

import { EDGE_FUNCTION_CORS_HEADERS } from "./edgeCors.ts";

export type FarmVaultEdgeContext = {
  requestId: string;
  functionName: string;
};

export type FarmVaultEdgeHandler = (
  req: Request,
  ctx: FarmVaultEdgeContext,
) => Response | Promise<Response>;

function logLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...payload }));
}

function logErrorLine(payload: Record<string, unknown>) {
  console.error(JSON.stringify({ ts: new Date().toISOString(), ...payload }));
}

function safePath(req: Request): string {
  try {
    return new URL(req.url).pathname;
  } catch {
    return "(invalid-url)";
  }
}

/**
 * Wraps the standard Deno edge handler with request lifecycle logging.
 * Uncaught errors become 500 JSON with requestId (no stack to client).
 */
export function serveFarmVaultEdge(
  functionName: string,
  handler: FarmVaultEdgeHandler,
): void {
  Deno.serve(async (req: Request) => {
    const requestId = crypto.randomUUID();
    const ctx: FarmVaultEdgeContext = { requestId, functionName };
    const t0 = performance.now();

    logLine({
      level: "info",
      msg: "edge_request_start",
      edgeFunction: functionName,
      requestId,
      method: req.method,
      path: safePath(req),
    });

    try {
      const res = await handler(req, ctx);
      const durationMs = Math.round(performance.now() - t0);
      logLine({
        level: "info",
        msg: "edge_request_end",
        edgeFunction: functionName,
        requestId,
        method: req.method,
        path: safePath(req),
        status: res.status,
        durationMs,
      });

      const headers = new Headers(res.headers);
      if (!headers.has("x-farmvault-request-id")) {
        headers.set("x-farmvault-request-id", requestId);
      }
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    } catch (err) {
      const durationMs = Math.round(performance.now() - t0);
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      logErrorLine({
        level: "error",
        msg: "edge_request_error",
        edgeFunction: functionName,
        requestId,
        method: req.method,
        path: safePath(req),
        durationMs,
        error: message,
        stack,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: "Internal server error",
          requestId,
        }),
        {
          status: 500,
          headers: {
            ...EDGE_FUNCTION_CORS_HEADERS,
            "Content-Type": "application/json",
            "x-farmvault-request-id": requestId,
          },
        },
      );
    }
  });
}

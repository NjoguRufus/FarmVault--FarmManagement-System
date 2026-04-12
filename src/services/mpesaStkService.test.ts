import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initiateMpesaStkPush } from "./mpesaStkService";

describe("initiateMpesaStkPush", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://unit-test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("sends Idempotency-Key header and reuses the same key in the JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, checkoutRequestId: "ws_CO_test_checkout" }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await initiateMpesaStkPush(
      {
        companyId: "00000000-0000-4000-8000-000000000001",
        phoneNumber: "254712345678",
        planCode: "pro",
        billingCycle: "monthly",
        amount: 1500,
        idempotencyKey: "idem-stable-1",
      },
      { getAccessToken: async () => "header.jwt.payload" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("idem-stable-1");
    const body = JSON.parse(init.body as string) as { idempotency_key?: string };
    expect(body.idempotency_key).toBe("idem-stable-1");
  });

  it("throws when idempotency key is missing (prevents duplicate STK without server dedupe)", async () => {
    await expect(
      initiateMpesaStkPush(
        {
          companyId: "00000000-0000-4000-8000-000000000001",
          phoneNumber: "254712345678",
          planCode: "basic",
          billingCycle: "monthly",
          amount: 500,
          idempotencyKey: "",
        },
        { getAccessToken: async () => "jwt" },
      ),
    ).rejects.toThrow(/idempotencyKey/i);
  });
});

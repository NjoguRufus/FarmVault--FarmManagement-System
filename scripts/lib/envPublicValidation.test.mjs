import { describe, expect, it } from "vitest";
import { validateAllViteEntries, validateViteEntry } from "./envPublicValidation.mjs";

describe("validateViteEntry", () => {
  it("flags service role in key name", () => {
    const r = validateViteEntry("VITE_SUPABASE_SERVICE_ROLE_KEY", "x");
    expect(r.some((x) => x.code === "forbidden_vite_key")).toBe(true);
  });

  it("allows public anon key name", () => {
    const r = validateViteEntry("VITE_SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.x.y");
    expect(r.some((x) => x.code === "forbidden_vite_key")).toBe(false);
  });

  it("flags JWT-like values in VITE_", () => {
    const r = validateViteEntry(
      "VITE_SOME_TOKEN",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def",
    );
    expect(r.some((x) => x.code === "suspicious_vite_value")).toBe(true);
  });

  it("warns on pk_test clerk key", () => {
    const r = validateViteEntry("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_abc");
    expect(r.some((x) => x.code === "clerk_test_publishable_key")).toBe(true);
  });

  it("errors on VITE_EMERGENCY_* (secrets must not live in client env)", () => {
    const r = validateViteEntry("VITE_EMERGENCY_ACCESS", "true");
    expect(r.some((x) => x.code === "vite_emergency_forbidden")).toBe(true);
  });
});

describe("validateAllViteEntries", () => {
  it("aggregates errors and warnings", () => {
    const map = new Map([
      ["VITE_OK", "public"],
      ["VITE_RESEND_API_KEY", "re_123"],
    ]);
    const { errors, warnings } = validateAllViteEntries(map);
    expect(errors.length).toBeGreaterThan(0);
    expect(warnings.length).toBe(0);
  });
});

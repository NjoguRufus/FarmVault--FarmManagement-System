/**
 * Validates that VITE_* client bundle variables are not carrying server secrets.
 * Used by `npm run validate:env` and unit tests.
 */

/** Keys that must never ship in Vite (client) — substring match on name, case-insensitive */
const FORBIDDEN_VITE_KEY_SUBSTRINGS = [
  "SERVICE_ROLE",
  "SECRET_KEY",
  "_SECRET",
  "PRIVATE_KEY",
  "PRIV_KEY",
  "RESEND_API",
  "OPENAI_API",
  "STRIPE_SECRET",
  "STRIPE_SK",
  "MPESA_CONSUMER",
  "MPESA_PASSKEY",
  "WEBHOOK_SECRET",
  "SUPABASE_SERVICE",
];

/** Values that indicate a real secret slipped into VITE_ */
const FORBIDDEN_VALUE_PATTERNS = [
  /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./, // JWT-like
  /^sk_(live|test)_/, // Stripe secret
  /^rk_live_/, // Stripe restricted
  /^sb_secret_/, // Supabase secret-style
];

/**
 * @param {string} key
 * @param {string} value
 * @returns {{ level: 'error' | 'warn', code: string, message: string }[]}
 */
export function validateViteEntry(key, value) {
  const out = [];
  if (!key.startsWith("VITE_")) return out;
  const upper = key.toUpperCase();

  for (const sub of FORBIDDEN_VITE_KEY_SUBSTRINGS) {
    if (upper.includes(sub)) {
      out.push({
        level: "error",
        code: "forbidden_vite_key",
        message: `Remove or rename ${key}: VITE_ variables are exposed in the browser bundle; "${sub}" must not appear in client env keys.`,
      });
    }
  }

  const trimmed = (value ?? "").trim();
  const isPublicJwtShapedKey =
    key === "VITE_SUPABASE_ANON_KEY" ||
    key === "VITE_SUPABASE_PUBLISHABLE_KEY";

  if (trimmed && trimmed !== "false" && trimmed !== "0" && !isPublicJwtShapedKey) {
    for (const re of FORBIDDEN_VALUE_PATTERNS) {
      if (re.test(trimmed)) {
        out.push({
          level: "error",
          code: "suspicious_vite_value",
          message: `Value for ${key} looks like a secret token. Server secrets must use non-VITE_ names and never be imported in client code.`,
        });
        break;
      }
    }
  }

  if (upper.startsWith("VITE_EMERGENCY")) {
    out.push({
      level: "error",
      code: "vite_emergency_forbidden",
      message: `Remove ${key}: emergency access must use Edge Function secrets only (see emergency-access / .env.example). Never expose emergency bypass via VITE_.`,
    });
  }

  if (key === "VITE_CLERK_PUBLISHABLE_KEY" && trimmed.startsWith("pk_test_")) {
    out.push({
      level: "warn",
      code: "clerk_test_publishable_key",
      message:
        "VITE_CLERK_PUBLISHABLE_KEY is a Clerk *test* key (pk_test_). Use pk_live_ for production.",
    });
  }

  if (key === "VITE_ENABLE_DEV_GATEWAY" && (trimmed === "true" || trimmed === "1")) {
    out.push({
      level: "warn",
      code: "dev_gateway_enabled",
      message: "VITE_ENABLE_DEV_GATEWAY is true — disable in production builds.",
    });
  }

  return out;
}

/**
 * @param {Iterable<[string, string]>} entries
 */
export function validateAllViteEntries(entries) {
  /** @type {{ level: 'error' | 'warn', code: string, message: string }[]} */
  const errors = [];
  /** @type {{ level: 'error' | 'warn', code: string, message: string }[]} */
  const warnings = [];
  for (const [key, value] of entries) {
    for (const item of validateViteEntry(key, value)) {
      if (item.level === "error") errors.push(item);
      else warnings.push(item);
    }
  }
  return { errors, warnings };
}

#!/usr/bin/env node
/**
 * Validates .env for client-exposed (VITE_) security issues.
 * Run in CI before build: npm run validate:env
 *
 * Usage:
 *   node scripts/validate-env-public.mjs
 *   node scripts/validate-env-public.mjs --strict   # warnings also exit 1
 *   node scripts/validate-env-public.mjs --file .env.staging
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnvFileSync } from "./lib/loadDotEnv.mjs";
import { validateAllViteEntries } from "./lib/envPublicValidation.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  let strict = false;
  let file = path.join(REPO_ROOT, ".env");
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--strict") strict = true;
    if (argv[i] === "--file" && argv[i + 1]) {
      const p = argv[++i];
      file = path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p);
    }
  }
  return { strict, file };
}

const { strict, file } = parseArgs(process.argv);

if (!fs.existsSync(file)) {
  console.log(`[validate:env] Skip — no file at ${file}`);
  process.exit(0);
}

const map = loadDotEnvFileSync(file);
const { errors, warnings } = validateAllViteEntries(map);

for (const w of warnings) {
  console.warn(`[WARN] ${w.code}: ${w.message}`);
}
for (const e of errors) {
  console.error(`[ERROR] ${e.code}: ${e.message}`);
}

if (errors.length > 0) {
  console.error(`\nvalidate:env failed with ${errors.length} error(s). Fix VITE_ keys or move secrets server-side.`);
  process.exit(1);
}
if (strict && warnings.length > 0) {
  console.error(`\nvalidate:env --strict: ${warnings.length} warning(s) treated as failure.`);
  process.exit(1);
}

console.log(`[validate:env] OK (${file})`);

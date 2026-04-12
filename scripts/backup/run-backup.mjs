#!/usr/bin/env node
/**
 * FarmVault Phase 0 — database backup helper.
 *
 * Requires `pg_dump` on PATH (PostgreSQL client tools) and a connection string with dump rights.
 *
 * Env (or first existing file: .env.production.local → .env.local → .env):
 *   DATABASE_URL  — preferred (direct Postgres, not always compatible with pooler)
 *   SUPABASE_DB_URL — alternative name used by some setups
 *
 * Usage:
 *   node scripts/backup/run-backup.mjs
 *   node scripts/backup/run-backup.mjs --env-file .env.production
 *
 * Output: backups/FarmVault_YYYY-MM-DD_HH-mm-ss/
 *   - full_custom_format.dump  (pg_dump -Fc full database)
 *   - critical_public.sql      (schema+data for listed public tables only)
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnvFileSync } from "../lib/loadDotEnv.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

/** Business-critical tables (public schema). Adjust if your deployment uses schema-qualified renames. */
const CRITICAL_TABLES = [
  "public.profiles",
  "public.companies",
  "public.company_members",
  "public.company_subscriptions",
  "public.subscription_payments",
  "public.mpesa_payments",
  "public.mpesa_stk_callbacks",
  "public.employees",
];

function parseArgs(argv) {
  let envFile = null;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--env-file" && argv[i + 1]) {
      envFile = argv[++i];
    }
  }
  return { envFile };
}

function resolveDatabaseUrl(explicitEnvFile) {
  const candidates = explicitEnvFile
    ? [path.resolve(REPO_ROOT, explicitEnvFile)]
    : [
        path.join(REPO_ROOT, ".env.production.local"),
        path.join(REPO_ROOT, ".env.local"),
        path.join(REPO_ROOT, ".env"),
      ];

  for (const p of candidates) {
    const map = loadDotEnvFileSync(p);
    const url =
      map.get("DATABASE_URL") ||
      map.get("SUPABASE_DB_URL") ||
      map.get("POSTGRES_URL") ||
      process.env.DATABASE_URL ||
      process.env.SUPABASE_DB_URL;
    if (url) {
      console.log(`Using database URL from: ${fs.existsSync(p) ? p : "process.env"}`);
      return url;
    }
  }
  return null;
}

function whichPgDump() {
  const r = spawnSync("pg_dump", ["--version"], { encoding: "utf8" });
  if (r.status !== 0) return null;
  return "pg_dump";
}

function runPgDump(args) {
  const cmd = whichPgDump();
  if (!cmd) {
    console.error(
      "pg_dump not found on PATH. Install PostgreSQL client tools:\n" +
        "  https://www.postgresql.org/download/",
    );
    process.exit(1);
  }
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    env: { ...process.env, PGSSLMODE: process.env.PGSSLMODE || "require" },
    shell: false,
  });
  if (r.error) {
    console.error(r.error);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || "pg_dump failed");
    process.exit(1);
  }
}

const { envFile } = parseArgs(process.argv);
const databaseUrl = resolveDatabaseUrl(envFile);

if (!databaseUrl) {
  console.error(
    "No DATABASE_URL / SUPABASE_DB_URL found. Copy .env.example to .env and set DATABASE_URL\n" +
      "(Supabase Dashboard → Project Settings → Database → Connection string → URI, use direct/session mode for dumps).",
  );
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:]/g, "-").slice(0, 19);
const outDir = path.join(REPO_ROOT, "backups", `FarmVault_${stamp}`);
fs.mkdirSync(outDir, { recursive: true });

const fullDump = path.join(outDir, "full_custom_format.dump");
const criticalSql = path.join(outDir, "critical_public.sql");

console.log("Writing:", fullDump);
runPgDump(["--dbname", databaseUrl, "-Fc", "--file", fullDump, "--no-owner", "--no-acl"]);

const tableArgs = CRITICAL_TABLES.flatMap((t) => ["--table", t]);
console.log("Writing:", criticalSql);
const crit = spawnSync(
  whichPgDump(),
  [
    "--dbname",
    databaseUrl,
    "--format",
    "p",
    "--no-owner",
    "--no-acl",
    ...tableArgs,
  ],
  {
    encoding: "utf8",
    env: { ...process.env, PGSSLMODE: process.env.PGSSLMODE || "require" },
  },
);

if (crit.status !== 0) {
  console.warn(
    "critical_public.sql step failed (some tables may not exist in this database):",
    crit.stderr || crit.stdout,
  );
  fs.writeFileSync(
    path.join(outDir, "critical_public_README.txt"),
    "critical_public.sql was not produced — verify table names exist in public schema.\n",
  );
} else {
  fs.writeFileSync(criticalSql, crit.stdout);
}

fs.writeFileSync(
  path.join(outDir, "MANIFEST.txt"),
  `FarmVault backup ${stamp}
Files:
  - full_custom_format.dump  (restore: pg_restore --clean --if-exists -d DATABASE_URL full_custom_format.dump)
  - critical_public.sql      (if generated: psql DATABASE_URL -f critical_public.sql)

Tables targeted for critical export:
${CRITICAL_TABLES.join("\n")}
`,
);

console.log("Backup complete:", outDir);

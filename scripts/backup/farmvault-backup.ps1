# FarmVault Phase 0 — Windows-friendly entrypoint for database backups.
# Requires: Node.js + pg_dump on PATH + DATABASE_URL in .env
#
# Usage:
#   .\scripts\backup\farmvault-backup.ps1
#   .\scripts\backup\farmvault-backup.ps1 -EnvFile .\.env.production

param(
    [string] $EnvFile = ""
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root

if ($EnvFile -ne "") {
    node scripts/backup/run-backup.mjs --env-file $EnvFile
} else {
    node scripts/backup/run-backup.mjs
}

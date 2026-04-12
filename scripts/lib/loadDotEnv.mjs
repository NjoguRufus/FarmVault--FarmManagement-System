import fs from "node:fs";

/**
 * Minimal .env parser (no dependency). BOM-safe, strips quotes, skips comments.
 * @param {string} content
 * @returns {Map<string, string>}
 */
export function parseDotEnv(content) {
  const map = new Map();
  if (!content) return map;
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    map.set(key, val);
  }
  return map;
}

/**
 * @param {string} filePath
 * @returns {Map<string, string>}
 */
export function loadDotEnvFileSync(filePath) {
  if (!fs.existsSync(filePath)) return new Map();
  return parseDotEnv(fs.readFileSync(filePath, "utf8"));
}

/**
 * Writes public/icons/farmvault-192.png, farmvault-512.png, badge.png for Web Push branding.
 * Run: node scripts/generate-push-brand-icons.mjs
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "..", "public", "icons");
const out192 = join(iconsDir, "farmvault-192.png");
const out512 = join(iconsDir, "farmvault-512.png");
const outBadge = join(iconsDir, "badge.png");

if (existsSync(out192) && existsSync(out512) && existsSync(outBadge)) {
  console.log("Push brand icons already exist; skip (replace files in public/icons/ to customize).");
  process.exit(0);
}

mkdirSync(iconsDir, { recursive: true });

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0b1d14"/>
  <path fill="#1F7A63" d="M256 72c-88 0-152 72-152 160 0 108 152 216 152 216s152-108 152-216c0-88-64-160-152-160zm0 88c40 0 72 32 72 72s-32 72-72 72-72-32-72-72 32-72 72-72z"/>
</svg>`;

const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <path fill="#ffffff" d="M48 6C30 22 14 38 14 58c0 18.8 15.2 34 34 34s34-15.2 34-34c0-20-16-36-34-52z"/>
</svg>`;

const logoBuf = Buffer.from(logoSvg);
await sharp(logoBuf).resize(192, 192).png().toFile(out192);
await sharp(logoBuf).resize(512, 512).png().toFile(out512);
await sharp(Buffer.from(badgeSvg)).resize(96, 96).png().toFile(outBadge);

console.log("Wrote public/icons/farmvault-192.png, farmvault-512.png, badge.png");

#!/usr/bin/env node
/**
 * Generates WebP versions of JPG/PNG in public/landing for smaller size and faster LCP.
 * Run: npm run generate:webp (requires sharp: npm install -D sharp)
 * Output: public/landing/*.webp (e.g. hero-bg.webp, cta-bg.webp)
 */

import { readdir, stat } from "fs/promises";
import { join, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicLanding = join(__dirname, "..", "public", "landing");

const ALLOWED_EXT = [".jpg", ".jpeg", ".png"];

async function run() {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.warn("Optional: install sharp for WebP generation: npm install -D sharp");
    console.warn("Then run: npm run generate:webp");
    process.exit(0);
  }

  let files;
  try {
    files = await readdir(publicLanding);
  } catch (e) {
    console.warn("public/landing not found or not readable:", e.message);
    process.exit(0);
  }

  for (const name of files) {
    if (!ALLOWED_EXT.includes(extname(name).toLowerCase())) continue;
    const inputPath = join(publicLanding, name);
    const info = await stat(inputPath).catch(() => null);
    if (!info || !info.isFile()) continue;
    const base = name.replace(/\.[^.]+$/, "");
    const outputPath = join(publicLanding, `${base}.webp`);
    try {
      await sharp(inputPath)
        .webp({ quality: 82 })
        .toFile(outputPath);
      console.log(`Generated ${base}.webp`);
    } catch (e) {
      console.warn(`Failed ${name}:`, e.message);
    }
  }
}

run();

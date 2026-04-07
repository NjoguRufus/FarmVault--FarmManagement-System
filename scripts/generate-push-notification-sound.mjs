/**
 * Writes a short notification chime as public/sounds/notification.wav (PCM, no deps).
 * Browsers play this from /sounds/notification.wav; the app also tries /sounds/notification.mp3 first if you add it.
 *
 * Skips if notification.wav already exists.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "sounds");
const outWav = join(outDir, "notification.wav");

if (existsSync(outWav)) {
  console.log("public/sounds/notification.wav already exists; skip.");
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

const sampleRate = 44100;
const durationSec = 0.14;
const f1 = 880;
const f2 = 1174.66;
const numSamples = Math.floor(sampleRate * durationSec);
const pcm = new Int16Array(numSamples);

for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  const env = Math.min(1, i / 120) * Math.max(0, 1 - (i - numSamples * 0.4) / (numSamples * 0.6));
  const w1 = Math.sin(2 * Math.PI * f1 * t);
  const w2 = Math.sin(2 * Math.PI * f2 * t);
  pcm[i] = Math.round(0.22 * 32767 * env * (w1 * 0.55 + w2 * 0.45));
}

const dataSize = pcm.length * 2;
const buffer = Buffer.alloc(44 + dataSize);
buffer.write("RIFF", 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write("WAVE", 8);
buffer.write("fmt ", 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(1, 22);
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write("data", 36);
buffer.writeUInt32LE(dataSize, 40);
for (let i = 0; i < pcm.length; i++) {
  buffer.writeInt16LE(pcm[i], 44 + i * 2);
}

writeFileSync(outWav, buffer);
console.log("Wrote public/sounds/notification.wav");

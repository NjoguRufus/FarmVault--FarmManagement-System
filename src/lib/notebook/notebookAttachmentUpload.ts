/**
 * Notebook attachment uploads: bounded concurrency to avoid hammering the network/CPU
 * and client-side downscaling to reduce transfer size and decode work.
 */

/** At most this many image/file uploads to storage run in parallel. */
export const MAX_CONCURRENT_NOTEBOOK_UPLOADS = 10;

/** Long edge cap for note images (saves storage; canvas preview uses full stored asset). */
const MAX_IMAGE_UPLOAD_EDGE_PX = 1600;
const UPLOAD_JPEG_QUALITY = 0.78;
/** Under this size and dimension cap we skip re-encoding to save CPU. */
const SKIP_ENCODE_UNDER_BYTES = 500_000;
const SKIP_ENCODE_MAX_SIDE_PX = 1200;

class AsyncSemaphore {
  private active = 0;
  private readonly wait: Array<() => void> = [];

  constructor(private readonly max: number) {}

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.wait.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release() {
    this.active -= 1;
    const next = this.wait.shift();
    if (next) next();
  }

  async use<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

const notebookUploadSemaphore = new AsyncSemaphore(MAX_CONCURRENT_NOTEBOOK_UPLOADS);

export function withNotebookUploadSlot<T>(fn: () => Promise<T>): Promise<T> {
  return notebookUploadSemaphore.use(fn);
}

/**
 * Resizes very large rasters and re-encodes to JPEG to cut upload time and main-thread work on load.
 * GIF/SVG/unsupported decode paths return the original file.
 */
export async function prepareImageForStorageUpload(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function") return file;
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml" || file.type === "image/svg") {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const w = bitmap.width;
    const h = bitmap.height;
    const maxSide = Math.max(w, h);
    const needScale = maxSide > MAX_IMAGE_UPLOAD_EDGE_PX;
    const smallEnough =
      !needScale && maxSide <= SKIP_ENCODE_MAX_SIDE_PX && file.size < SKIP_ENCODE_UNDER_BYTES;
    if (smallEnough) {
      return file;
    }

    let targetW = w;
    let targetH = h;
    if (needScale) {
      const s = MAX_IMAGE_UPLOAD_EDGE_PX / maxSide;
      targetW = Math.max(1, Math.round(w * s));
      targetH = Math.max(1, Math.round(h * s));
    } else {
      // Still large in bytes: downscale slightly to help JPEG compress (e.g. 4000x3000 phone shot under byte cap)
      if (file.size >= SKIP_ENCODE_UNDER_BYTES && maxSide > SKIP_ENCODE_MAX_SIDE_PX) {
        const s = Math.min(1, MAX_IMAGE_UPLOAD_EDGE_PX / maxSide);
        if (s < 1) {
          targetW = Math.max(1, Math.round(w * s));
          targetH = Math.max(1, Math.round(h * s));
        }
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return file;
    const scaledDown = targetW !== w || targetH !== h;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (!scaledDown) {
      ctx.drawImage(bitmap, 0, 0);
    } else {
      ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    }

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob(
        (b) => resolve(b),
        "image/jpeg",
        UPLOAD_JPEG_QUALITY,
      );
    });

    if (!blob || blob.size === 0) return file;
    if (!scaledDown && blob.size > file.size * 0.9) {
      return file;
    }

    const base = String(file.name ?? "image").replace(/\.[^.]+$/, "");
    const outName = `${base || "image"}-note.jpg`;
    return new File([blob], outName, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    try {
      bitmap.close();
    } catch {
      // ignore
    }
  }
}

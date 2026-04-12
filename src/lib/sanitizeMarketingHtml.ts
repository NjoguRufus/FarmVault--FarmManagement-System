import DOMPurify from "dompurify";

let hooksInstalled = false;

function ensureRelOnBlankTargets(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

/** Sanitize marketing / blog HTML (bundled or CMS-style content). */
export function sanitizeMarketingHtml(dirty: string): string {
  ensureRelOnBlankTargets();
  return DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } });
}

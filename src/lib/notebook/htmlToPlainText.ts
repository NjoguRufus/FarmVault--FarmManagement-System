/**
 * Strip HTML from note content for structured parsing, search, and raw_text mirror.
 */
export function looksLikeRichHtml(s: string): boolean {
  return /<(div|p|span|b|i|u|strong|em|br|font)\b/i.test(s);
}

export function htmlToPlainText(html: string): string {
  if (!html || !html.trim()) return "";
  const noComments = html.replace(/<!--[\s\S]*?-->/g, " ");
  if (typeof window === "undefined") {
    return noComments.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const d = document.createElement("div");
  d.innerHTML = noComments;
  return (d.textContent || d.innerText || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trim();
}

export function plainTextToEditorHtml(plain: string): string {
  const lines = plain.replace(/\r\n/g, "\n").split("\n");
  if (lines.length === 0) return "<div><br></div>";
  return lines
    .map((line) => {
      const esc = line
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
      return `<div>${esc || "<br>"}</div>`;
    })
    .join("");
}

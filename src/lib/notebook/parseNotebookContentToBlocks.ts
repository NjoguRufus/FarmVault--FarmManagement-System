/**
 * Parses messy agricultural note text into structured blocks for display and persistence.
 * `content` / raw_text stays unchanged in the editor; this output is saved as structured_blocks on save.
 */

export type NoteStructuredBlock =
  | { type: "section"; title: string }
  | { type: "paragraph"; text: string }
  | { type: "bullet_list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "callout"; variant: "warning" | "info"; text: string }
  | { type: "maturity"; label: string; value: string };

const SECTION_KEYWORD_RE =
  /^(Best Timing|Recommended|Crop Maturity|Seasonal Challenges|Notes)\b/i;

const CALLOUT_RE = /\b(avoid|warning|important|do not)\b/i;

function hasMaturityPattern(text: string): boolean {
  return /\b(\d+)\s*[-–—]\s*(\d+)\s*days?\b/i.test(text);
}

function splitCells(line: string): string[] {
  const t = line.trim();
  if (t.includes("\t")) return t.split("\t").map((c) => c.trim()).filter(Boolean);
  if (t.includes("|")) return t.split("|").map((c) => c.trim()).filter(Boolean);
  const multi = t.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
  if (multi.length >= 3) return multi;
  return [t];
}

function isDateTableHeader(line: string): boolean {
  const l = line.toLowerCase();
  return (
    l.includes("planting date") && l.includes("harvest start") && l.includes("harvest end")
  );
}

function tryParseDateTable(
  lines: string[],
  start: number,
): { block: NoteStructuredBlock; nextIndex: number } | null {
  const hLine = lines[start]?.trim() ?? "";
  if (!isDateTableHeader(hLine)) return null;
  const headers = splitCells(hLine);
  if (headers.length < 3) return null;
  const dataLine = lines[start + 1]?.trim() ?? "";
  if (!dataLine) return null;
  const cells = splitCells(dataLine);
  if (cells.length < 3) return null;
  return {
    block: {
      type: "table",
      headers: headers.slice(0, 3),
      rows: [cells.slice(0, 3)],
    },
    nextIndex: start + 2,
  };
}

/** Short lines that look like list items (pests, etc.) */
const BULLET_LINE_RE = /^[A-Za-z][A-Za-z\s.'-]{0,48}$/;

function isBulletCandidate(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 50) return false;
  if (SECTION_KEYWORD_RE.test(t)) return false;
  if (CALLOUT_RE.test(t)) return false;
  if (isDateTableHeader(t)) return false;
  if (/^[-*•]\s+/.test(t)) return true;
  return BULLET_LINE_RE.test(t) && !t.includes(":") && t.split(/\s+/).length <= 4;
}

function tryParseBulletRun(
  lines: string[],
  start: number,
): { block: NoteStructuredBlock; nextIndex: number } | null {
  let i = start;
  const items: string[] = [];
  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t) break;
    if (!isBulletCandidate(t)) {
      if (items.length >= 2) break;
      return null;
    }
    items.push(t.replace(/^[-*•]\s+/, "").trim());
    i++;
  }
  if (items.length < 2) return null;
  return { block: { type: "bullet_list", items }, nextIndex: i };
}

function isSectionHeader(line: string): boolean {
  const t = line.trim();
  if (SECTION_KEYWORD_RE.test(t)) return true;
  // Title-case phrase ending with colon, short line
  if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+){0,4}:\s*$/.test(t) && t.length <= 56) return true;
  return false;
}

function sectionTitle(line: string): string {
  return line.trim().replace(/:\s*$/, "");
}

function isCalloutLine(line: string): boolean {
  return CALLOUT_RE.test(line.trim());
}

function splitParagraphWithMaturity(text: string): NoteStructuredBlock[] {
  const re = /\b(\d+)\s*[-–—]\s*(\d+)\s*days?\b/gi;
  const out: NoteStructuredBlock[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(last, m.index);
    const t = normalizeParagraphText(before);
    if (t) out.push({ type: "paragraph", text: t });
    out.push({
      type: "maturity",
      label: "Crop Maturity",
      value: `${m[1]}–${m[2]} days`,
    });
    last = m.index + m[0].length;
  }
  const tail = normalizeParagraphText(text.slice(last));
  if (tail) out.push({ type: "paragraph", text: tail });
  return out;
}

function normalizeParagraphText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Full parse: classify lines, group bullets and tables, split paragraphs for maturity/callouts.
 */
export function parseNotebookContentToBlocks(raw: string): NoteStructuredBlock[] {
  const lines = raw.split(/\r?\n/);
  const blocks: NoteStructuredBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      i++;
      continue;
    }

    const table = tryParseDateTable(lines, i);
    if (table) {
      blocks.push(table.block);
      i = table.nextIndex;
      continue;
    }

    const bullets = tryParseBulletRun(lines, i);
    if (bullets) {
      blocks.push(bullets.block);
      i = bullets.nextIndex;
      continue;
    }

    if (isSectionHeader(trimmed)) {
      blocks.push({ type: "section", title: sectionTitle(trimmed) });
      i++;
      continue;
    }

    if (isCalloutLine(trimmed)) {
      blocks.push({ type: "callout", variant: "warning", text: trimmed });
      i++;
      continue;
    }

    // Consume paragraph until blank, section, table header, or bullet run start
    const paraLines: string[] = [];
    let j = i;
    while (j < lines.length) {
      const t = lines[j].trim();
      if (!t) break;
      if (tryParseDateTable(lines, j) || tryParseBulletRun(lines, j) || isSectionHeader(t)) break;
      if (isCalloutLine(t)) break;
      paraLines.push(lines[j]);
      j++;
    }

    const paraText = normalizeParagraphText(paraLines.join("\n"));
    if (paraText) {
      if (hasMaturityPattern(paraText)) {
        blocks.push(...splitParagraphWithMaturity(paraText));
      } else {
        blocks.push({ type: "paragraph", text: paraText });
      }
    }
    i = j;
  }

  return blocks;
}

export function normalizeStructuredBlocksFromDb(raw: unknown): NoteStructuredBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: NoteStructuredBlock[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const type = String(o.type ?? "");
    if (type === "section" && typeof o.title === "string") {
      out.push({ type: "section", title: o.title });
      continue;
    }
    if (type === "paragraph" && typeof o.text === "string") {
      out.push({ type: "paragraph", text: o.text });
      continue;
    }
    if (type === "bullet_list" && Array.isArray(o.items)) {
      out.push({ type: "bullet_list", items: o.items.map(String) });
      continue;
    }
    if (type === "table" && Array.isArray(o.headers) && Array.isArray(o.rows)) {
      out.push({
        type: "table",
        headers: o.headers.map(String),
        rows: (o.rows as unknown[]).map((r) => (Array.isArray(r) ? r.map(String) : [])),
      });
      continue;
    }
    if (type === "callout" && typeof o.text === "string") {
      const v = o.variant === "info" ? "info" : "warning";
      out.push({ type: "callout", variant: v, text: o.text });
      continue;
    }
    if (type === "maturity" && typeof o.value === "string") {
      out.push({
        type: "maturity",
        label: typeof o.label === "string" ? o.label : "Crop Maturity",
        value: o.value,
      });
    }
  }
  return out;
}

/**
 * Splices docs/cursor-sessions-appendix-detailed.md into the development journal.
 * Usage: node scripts/merge-cursor-appendix-into-journal.mjs
 */
import fs from "fs";

const JOURNAL = "docs/FARMVAULT_DEVELOPMENT_JOURNAL_2026-01-04_to_2026-04-12.md";
const DETAIL = "docs/cursor-sessions-appendix-detailed.md";

const intro =
  "**Cursor / AI-assisted work:** The following section is merged from local Cursor agent transcripts " +
  "(every `Write` / `StrReplace` path, full user prompts, repo-scoped Shell commands, `Read` lists, sample `Grep` patterns, and tool counts per session). " +
  "It overlaps the April 2026 stabilization window but is **not** identical to `git` commits.\n\n";

const journal = fs.readFileSync(JOURNAL, "utf8");
const detail = fs.readFileSync(DETAIL, "utf8").trimEnd();

const startNeedle = "**Cursor / AI-assisted work:**";
const baselineNeedle = "## Appendix — baseline Postgres mirror";

const i0 = journal.indexOf(startNeedle);
const i1 = journal.indexOf(baselineNeedle);
if (i0 < 0 || i1 < 0 || i1 <= i0) {
  console.error("Could not find splice boundaries");
  process.exit(1);
}

const before = journal.slice(0, i0);
const after = journal.slice(i1);

const merged = before + intro + detail + "\n\n" + after;

fs.writeFileSync(JOURNAL, merged, "utf8");
console.error(`Wrote ${JOURNAL} (${merged.length} chars)`);

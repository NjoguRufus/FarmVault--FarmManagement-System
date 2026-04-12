/**
 * Scan Cursor agent-transcripts for tool-assisted work on this repo.
 *
 * Usage:
 *   node scripts/cursor-transcript-summarize.mjs              # JSON to stdout
 *   node scripts/cursor-transcript-summarize.mjs --markdown --out FILE   # full-detail markdown
 *   node scripts/cursor-transcript-summarize.mjs --markdown --summary --out FILE  # table only
 */
import fs from "fs";
import path from "path";

const TRANSCRIPTS_ROOT =
  "C:\\Users\\NJOGU\\.cursor\\projects\\c-Users-NJOGU-Desktop-FarmV-V1-FarmVault-FarmManagement-System\\agent-transcripts";
const PROJ_MARKERS = ["FarmVault--FarmManagement-System", "FarmV V1"];
const MAX_USER_QUERY_CHARS = 12000;
const MAX_SHELL_CHARS = 2000;

function relevantPath(p) {
  if (!p) return false;
  if (PROJ_MARKERS.some((k) => p.includes(k))) return true;
  if (/^docs\//.test(p) || /^src\//.test(p) || /^supabase\//.test(p) || /^scripts\//.test(p)) return true;
  if (/^public\//.test(p) || /^index\.html$/.test(p) || /^package\.json$/.test(p) || /^vite\.config/.test(p))
    return true;
  if (p.includes(".env")) return true;
  return false;
}

function normPath(p) {
  return String(p).replace(/\\\\/g, "\\");
}

function repoRelative(p) {
  const n = normPath(p);
  const marker = "FarmVault--FarmManagement-System";
  const idx = n.indexOf(marker);
  if (idx >= 0) {
    return n
      .slice(idx + marker.length)
      .replace(/^[/\\]+/, "")
      .replace(/\\/g, "/");
  }
  return n.replace(/\\/g, "/");
}

function walkDir(dir, acc = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walkDir(p, acc);
    else if (name.name.endsWith(".jsonl")) acc.push(p);
  }
  return acc;
}

function extractUserQueriesFromLine(o, bucket) {
  if (o.role !== "user" || !Array.isArray(o.message?.content)) return;
  for (const block of o.message.content) {
    if (block.type !== "text" || !block.text) continue;
    const t = block.text;
    if (!t.includes("<user_query>")) continue;
    const inner = t
      .replace(/^[\s\S]*?<user_query>\s*/i, "")
      .replace(/\s*<\/user_query>[\s\S]*$/i, "")
      .trim();
    if (inner) bucket.push(inner);
  }
}

function forEachAssistantTool(o, fn) {
  if (o.role !== "assistant" || !Array.isArray(o.message?.content)) return;
  for (const block of o.message.content) {
    if (block.type === "tool_use" && block.name) {
      fn(block.name, block.input || {});
    }
  }
}

function parseTranscriptLines(lines) {
  const userQueries = [];
  const writesInOrder = [];
  const strReplacePaths = new Set();
  const shellCommands = [];
  const readPaths = new Set();
  const grepPatterns = [];
  const toolCounts = {};

  const bump = (n) => {
    toolCounts[n] = (toolCounts[n] || 0) + 1;
  };

  for (const line of lines) {
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }

    extractUserQueriesFromLine(o, userQueries);

    forEachAssistantTool(o, (name, input) => {
      bump(name);
      if (name === "Write" && input.path && relevantPath(input.path)) {
        writesInOrder.push(normPath(input.path));
      }
      if (name === "StrReplace" && input.path && relevantPath(input.path)) {
        strReplacePaths.add(normPath(input.path));
      }
      if (name === "EditNotebook" && input.target_notebook && relevantPath(input.target_notebook)) {
        writesInOrder.push(`${normPath(input.target_notebook)} [EditNotebook cell ${input.cell_idx ?? "?"}]`);
      }
      if (name === "Shell" && input.command) {
        const cmd = String(input.command);
        if (PROJ_MARKERS.some((m) => cmd.includes(m)) || /farmvault/i.test(cmd)) {
          shellCommands.push({
            description: input.description || "",
            command: cmd.length > MAX_SHELL_CHARS ? cmd.slice(0, MAX_SHELL_CHARS) + "\n... (truncated)" : cmd,
          });
        }
      }
      if (name === "Read" && input.path && relevantPath(input.path)) {
        readPaths.add(normPath(input.path));
      }
      if (name === "Grep" && input.pattern) {
        grepPatterns.push(String(input.pattern).slice(0, 200));
      }
    });
  }

  const uniqueQueries = [];
  const seenQ = new Set();
  for (const q of userQueries) {
    const key = q.slice(0, 500);
    if (seenQ.has(key)) continue;
    seenQ.add(key);
    uniqueQueries.push(q.length > MAX_USER_QUERY_CHARS ? q.slice(0, MAX_USER_QUERY_CHARS) + "\n\n… (truncated)" : q);
  }

  const writesUnique = [...new Set(writesInOrder.map(normPath))].sort();
  const strSorted = [...strReplacePaths].map(normPath).sort();

  return {
    userQueriesFull: uniqueQueries,
    writesOrdered: writesInOrder.map(normPath),
    writesUniqueSorted: writesUnique,
    strReplaceSorted: strSorted,
    shellCommands: shellCommands.slice(0, 40),
    readPathsSorted: [...readPaths].map(normPath).sort(),
    grepPatternsSample: [...new Set(grepPatterns)].slice(0, 15),
    toolCounts,
  };
}

function collect() {
  if (!fs.existsSync(TRANSCRIPTS_ROOT)) {
    console.error("Missing transcripts dir:", TRANSCRIPTS_ROOT);
    process.exit(1);
  }
  const files = walkDir(TRANSCRIPTS_ROOT);
  const byConv = new Map();

  for (const fp of files) {
    const stat = fs.statSync(fp);
    const conv = path.basename(path.dirname(fp));
    const raw = fs.readFileSync(fp, "utf8");
    const lines = raw.split(/\n/).filter(Boolean);
    const detail = parseTranscriptLines(lines);

    if (!detail.writesOrdered.length && !detail.strReplaceSorted.length) continue;

    const mtime = stat.mtime.toISOString();
    const prev = byConv.get(conv);
    if (!prev || prev.mtime < mtime) {
      byConv.set(conv, {
        conversationId: conv,
        transcriptFile: fp,
        mtime,
        ...detail,
      });
    }
  }

  const sessions = [...byConv.values()].sort((a, b) => a.mtime.localeCompare(b.mtime));
  return { transcriptFiles: files.length, sessionsWithRepoEdits: sessions.length, sessions };
}

function topDirs(paths) {
  const s = new Set();
  for (const p of paths) {
    const rel = repoRelative(p);
    const top = rel.split("/")[0] || rel;
    if (top) s.add(top);
  }
  return [...s].sort();
}

function toMarkdownSummary(data) {
  const lines = [];
  lines.push("## Appendix - Cursor agent sessions (summary table)");
  lines.push("");
  lines.push(
    "**Source:** Local Cursor `agent-transcripts`. **Not** git history. Session time = transcript file mtime (UTC).",
  );
  lines.push("");
  lines.push(
    `**Scan:** ${data.transcriptFiles} transcript files; **${data.sessionsWithRepoEdits}** sessions with Write/StrReplace/EditNotebook on repo paths.`,
  );
  lines.push("");
  lines.push("| US Eastern (approx.) | UTC mtime | Session ID | Writes (n) | StrReplace (n) | Areas |");
  lines.push("| --- | --- | --- | ---: | ---: | --- |");
  for (const s of data.sessions) {
    const d = new Date(s.mtime);
    const us = d.toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const areas = topDirs([...s.writesUniqueSorted, ...s.strReplaceSorted].map((r) => "X/FarmVault--FarmManagement-System/" + r)).join(", ") || "-";
    lines.push(
      `| ${us} | ${s.mtime} | \`${s.conversationId.slice(0, 8)}...\` | ${s.writesUniqueSorted.length} | ${s.strReplaceSorted.length} | ${areas} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function toMarkdownDetailed(data) {
  const lines = [];
  lines.push("## Appendix - Cursor agent sessions (full detail)");
  lines.push("");
  lines.push(
    "**Source:** Cursor IDE agent transcripts on this machine: `.cursor/projects/c-Users-NJOGU-Desktop-FarmV-V1-FarmVault-FarmManagement-System/agent-transcripts/`.",
  );
  lines.push("");
  lines.push(
    "This appendix lists **exact tool targets** extracted from JSONL (`Write`, `StrReplace`, `EditNotebook`), **full user prompts** (deduplicated), **Shell** commands that reference this repo path, and **aggregated investigation** (`Read` paths, sample `Grep` patterns, per-tool counts). It is **not** a substitute for `git log`: some edits were never committed.",
  );
  lines.push("");
  lines.push(
    `**Scan:** ${data.transcriptFiles} transcript files; **${data.sessionsWithRepoEdits}** sessions contained repo-scoped file edits.`,
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const s of data.sessions) {
    const d = new Date(s.mtime);
    const us = d.toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    lines.push(`### Session ${s.conversationId}`);
    lines.push("");
    lines.push(`- **US Eastern (file mtime):** ${us}`);
    lines.push(`- **UTC ISO mtime:** ${s.mtime}`);
    lines.push(`- **Transcript:** \`${s.transcriptFile.replace(/\\/g, "/")}\``);
    lines.push("");

    lines.push("#### User requests (full text, deduplicated)");
    lines.push("");
    if (!s.userQueriesFull.length) {
      lines.push("*(No `<user_query>` blocks parsed in this transcript.)*");
      lines.push("");
    } else {
      s.userQueriesFull.forEach((q, i) => {
        lines.push(`##### Request ${i + 1}`);
        lines.push("");
        lines.push("```text");
        lines.push(q);
        lines.push("```");
        lines.push("");
      });
    }

    lines.push("#### Files created or overwritten (`Write` / notebook)");
    lines.push("");
    if (!s.writesOrdered.length) {
      lines.push("*(None.)*");
    } else {
      lines.push("**In conversation order:**");
      lines.push("");
      s.writesOrdered.forEach((p, i) => {
        lines.push(`${i + 1}. \`${repoRelative(p)}\``);
      });
      lines.push("");
      lines.push("**Unique paths (sorted):**");
      lines.push("");
      s.writesUniqueSorted.forEach((rel) => lines.push(`- \`${rel}\``));
    }
    lines.push("");

    lines.push("#### Files patched (`StrReplace`)");
    lines.push("");
    if (!s.strReplaceSorted.length) {
      lines.push("*(None.)*");
    } else {
      s.strReplaceSorted.forEach((p) => lines.push(`- \`${repoRelative(p)}\``));
    }
    lines.push("");

    lines.push("#### Shell commands (only if command string mentions this repo)");
    lines.push("");
    if (!s.shellCommands.length) {
      lines.push("*(None captured.)*");
    } else {
      s.shellCommands.forEach((sh, i) => {
        lines.push(`${i + 1}. **${sh.description || "shell"}**`);
        lines.push("");
        lines.push("```powershell");
        lines.push(sh.command);
        lines.push("```");
        lines.push("");
      });
    }

    lines.push("#### Files read during investigation (`Read`, deduped)");
    lines.push("");
    if (!s.readPathsSorted.length) {
      lines.push("*(None on repo paths.)*");
    } else {
      const rels = s.readPathsSorted.map(repoRelative);
      const cap = 120;
      rels.slice(0, cap).forEach((r) => lines.push(`- \`${r}\``));
      if (rels.length > cap) lines.push(`- *… and ${rels.length - cap} more Read paths*`);
    }
    lines.push("");

    lines.push("#### Sample `Grep` patterns used");
    lines.push("");
    if (!s.grepPatternsSample.length) {
      lines.push("*(None.)*");
    } else {
      s.grepPatternsSample.forEach((g) => lines.push(`- \`${g.replace(/`/g, "'")}\``));
    }
    lines.push("");

    lines.push("#### Tool call counts (all tools in assistant messages)");
    lines.push("");
    const entries = Object.entries(s.toolCounts).sort((a, b) => b[1] - a[1]);
    entries.forEach(([k, v]) => lines.push(`- **${k}:** ${v}`));
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push("### How to regenerate");
  lines.push("");
  lines.push("```bash");
  lines.push("node scripts/cursor-transcript-summarize.mjs --markdown --out docs/cursor-sessions-appendix-detailed.md");
  lines.push("node scripts/merge-cursor-appendix-into-journal.mjs");
  lines.push("# Summary table only (optional):");
  lines.push("node scripts/cursor-transcript-summarize.mjs --markdown --summary --out docs/cursor-sessions-appendix-summary.md");
  lines.push("# Raw JSON:");
  lines.push("node scripts/cursor-transcript-summarize.mjs");
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

const outIdx = process.argv.indexOf("--out");
const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : null;
const data = collect();

if (process.argv.includes("--markdown")) {
  const md = process.argv.includes("--summary") ? toMarkdownSummary(data) + "\n" : toMarkdownDetailed(data);
  if (outPath) {
    fs.writeFileSync(outPath, md, "utf8");
    process.stderr.write(`Wrote ${outPath} (${md.length} chars)\n`);
  } else {
    process.stdout.write(md);
  }
} else {
  process.stdout.write(JSON.stringify(data, null, 2));
}

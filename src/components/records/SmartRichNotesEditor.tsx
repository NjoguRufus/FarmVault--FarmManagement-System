import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, Highlighter, Palette, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { looksLikeRichHtml, plainTextToEditorHtml } from "@/lib/notebook/htmlToPlainText";

const TEXT_COLORS = [
  { name: "Red", value: "#dc2626" },
  { name: "Green", value: "#15803d" },
  { name: "Gold", value: "#ca8a04" },
  { name: "Blue", value: "#2563eb" },
  { name: "Gray", value: "#6b7280" },
];

const HIGHLIGHT_COLORS = [
  { name: "Gold", value: "#fef08a" },
  { name: "Green", value: "#bbf7d0" },
  { name: "Red", value: "#fecaca" },
  { name: "Blue", value: "#bfdbfe" },
  { name: "Gray", value: "#e5e7eb" },
];

const ROMAN_LOWER = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"];
const ROMAN_UPPER = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

function nextRoman(current: string, upper: boolean): string {
  const list = upper ? ROMAN_UPPER : ROMAN_LOWER;
  const norm = upper ? current : current.toLowerCase();
  const idx = list.findIndex((x) => (upper ? x : x.toLowerCase()) === norm);
  if (idx >= 0 && idx < list.length - 1) return list[idx + 1];
  if (idx === list.length - 1) return list[idx];
  return list[1] ?? "ii";
}

function getLineDiv(root: HTMLElement, sel: Selection): HTMLElement | null {
  let n: Node | null = sel.anchorNode;
  if (!root.contains(n)) return null;
  if (n.nodeType === Node.TEXT_NODE) n = n.parentElement;
  while (n && n !== root) {
    const p = (n as HTMLElement).parentElement;
    if (p === root && n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName === "DIV") {
      return n as HTMLElement;
    }
    n = p;
  }
  return null;
}

function ensureEditorStructure(root: HTMLElement) {
  if (!root.childNodes.length) {
    root.innerHTML = "<div><br></div>";
    return;
  }
  const first = root.firstChild;
  if (first?.nodeType === Node.TEXT_NODE || (first as HTMLElement)?.tagName !== "DIV") {
    const html = plainTextToEditorHtml(root.textContent || "");
    root.innerHTML = html;
  }
}

function placeCaretAtEnd(el: HTMLElement) {
  const r = document.createRange();
  const sel = window.getSelection();
  r.selectNodeContents(el);
  r.collapse(false);
  sel?.removeAllRanges();
  sel?.addRange(r);
}

function placeCaretInStart(el: HTMLElement) {
  const r = document.createRange();
  const sel = window.getSelection();
  r.setStart(el, 0);
  r.collapse(true);
  sel?.removeAllRanges();
  sel?.addRange(r);
}

const KW_PATTERN =
  /\b(do not|important|avoid|warning|critical|must|recommended|best|risk|alert|note|nb)\b/gi;

const KW_CLASS: Record<string, string> = {
  "do not": "fv-kw fv-kw-warn",
  important: "fv-kw fv-kw-warn",
  avoid: "fv-kw fv-kw-warn",
  warning: "fv-kw fv-kw-warn",
  critical: "fv-kw fv-kw-warn",
  must: "fv-kw fv-kw-warn",
  risk: "fv-kw fv-kw-warn",
  alert: "fv-kw fv-kw-warn",
  recommended: "fv-kw fv-kw-pos",
  best: "fv-kw fv-kw-pos",
  note: "fv-kw fv-kw-note",
  nb: "fv-kw fv-kw-warn",
};

function unwrapSmartSpans(root: HTMLElement) {
  root.querySelectorAll("span.fv-nb-prefix, span.fv-kw").forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  });
  root.querySelectorAll("div.fv-nb-line").forEach((div) => div.classList.remove("fv-nb-line"));
}

function applyNbLine(div: HTMLElement) {
  const raw = div.textContent || "";
  if (!/^\s*NB:?\b/i.test(raw)) {
    div.classList.remove("fv-nb-line");
    return;
  }
  div.classList.add("fv-nb-line");
  if (div.querySelector(".fv-nb-prefix")) return;
  const first = div.firstChild;
  if (!first || first.nodeType !== Node.TEXT_NODE) return;
  const tn = first as Text;
  const data = tn.textContent || "";
  const m = data.match(/^\s*(NB:?)(\s*)/i);
  if (!m) return;
  const len = m[0].length;
  const before = data.slice(0, len);
  const after = data.slice(len);
  const span = document.createElement("span");
  span.className = "fv-nb-prefix";
  span.textContent = before;
  tn.textContent = after;
  div.insertBefore(span, tn);
}

function wrapKeywordsInNode(textNode: Text) {
  let parent = textNode.parentElement;
  if (!parent) return;
  if (parent.closest(".fv-nb-prefix")) return;
  if (parent.classList.contains("fv-kw")) return;

  const text = textNode.textContent || "";
  KW_PATTERN.lastIndex = 0;
  if (!KW_PATTERN.test(text)) return;
  KW_PATTERN.lastIndex = 0;

  const frag = document.createDocumentFragment();
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = KW_PATTERN.exec(text)) !== null) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    const span = document.createElement("span");
    const cls = KW_CLASS[m[1].toLowerCase()] || "fv-kw fv-kw-note";
    span.className = cls;
    span.textContent = m[0];
    frag.appendChild(span);
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  parent.replaceChild(frag, textNode);
}

function applyKeywordHighlights(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = (node as Text).parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (p.closest(".fv-nb-prefix")) return NodeFilter.FILTER_REJECT;
      if (p.tagName === "SCRIPT" || p.tagName === "STYLE") return NodeFilter.FILTER_REJECT;
      if (p.closest("span.fv-kw")) return NodeFilter.FILTER_REJECT;
      const t = node.textContent || "";
      if (!t.trim()) return NodeFilter.FILTER_REJECT;
      KW_PATTERN.lastIndex = 0;
      if (!KW_PATTERN.test(t)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  } as NodeFilter);
  const toProcess: Text[] = [];
  let n: Text | null;
  while ((n = walker.nextNode() as Text | null)) toProcess.push(n);
  for (const tn of toProcess) wrapKeywordsInNode(tn);
}

function runSmartPass(root: HTMLElement) {
  ensureEditorStructure(root);
  unwrapSmartSpans(root);
  for (const child of Array.from(root.children)) {
    if (child.tagName !== "DIV") continue;
    applyNbLine(child as HTMLElement);
  }
  applyKeywordHighlights(root);
}

function tryListContinue(e: React.KeyboardEvent<HTMLDivElement>, root: HTMLElement): boolean {
  if (e.key !== "Enter") return false;
  const sel = window.getSelection();
  if (!sel?.rangeCount) return false;
  const line = getLineDiv(root, sel);
  if (!line) return false;

  const text = (line.textContent || "").replace(/\u00a0/g, " ");

  // numeric 1.
  let m = text.match(/^(\s*)(\d+)\.\s*(.*)$/);
  if (m) {
    const indent = m[1];
    const n = parseInt(m[2], 10);
    const rest = m[3];
    if (rest.trim() === "") {
      e.preventDefault();
      line.innerHTML = "<br>";
      placeCaretInStart(line);
      return true;
    }
    e.preventDefault();
    const next = document.createElement("div");
    next.textContent = `${indent}${n + 1}. `;
    line.parentNode?.insertBefore(next, line.nextSibling);
    placeCaretAtEnd(next);
    return true;
  }

  // A. B.
  m = text.match(/^(\s*)([A-Z])\.\s*(.*)$/);
  if (m && m[2] >= "A" && m[2] <= "Z") {
    const indent = m[1];
    const letter = m[2];
    const rest = m[3];
    if (rest.trim() === "") {
      e.preventDefault();
      line.innerHTML = "<br>";
      placeCaretInStart(line);
      return true;
    }
    if (letter < "Z") {
      e.preventDefault();
      const next = document.createElement("div");
      next.textContent = `${indent}${String.fromCharCode(letter.charCodeAt(0) + 1)}. `;
      line.parentNode?.insertBefore(next, line.nextSibling);
      placeCaretAtEnd(next);
      return true;
    }
    return false;
  }

  // a.
  m = text.match(/^(\s*)([a-z])\.\s*(.*)$/);
  if (m) {
    const indent = m[1];
    const letter = m[2];
    const rest = m[3];
    if (rest.trim() === "") {
      e.preventDefault();
      line.innerHTML = "<br>";
      placeCaretInStart(line);
      return true;
    }
    if (letter < "z") {
      e.preventDefault();
      const next = document.createElement("div");
      next.textContent = `${indent}${String.fromCharCode(letter.charCodeAt(0) + 1)}. `;
      line.parentNode?.insertBefore(next, line.nextSibling);
      placeCaretAtEnd(next);
      return true;
    }
    return false;
  }

  // a)
  m = text.match(/^(\s*)([a-z])\)\s*(.*)$/);
  if (m) {
    const indent = m[1];
    const letter = m[2];
    const rest = m[3];
    if (rest.trim() === "") {
      e.preventDefault();
      line.innerHTML = "<br>";
      placeCaretInStart(line);
      return true;
    }
    if (letter < "z") {
      e.preventDefault();
      const next = document.createElement("div");
      next.textContent = `${indent}${String.fromCharCode(letter.charCodeAt(0) + 1)}) `;
      line.parentNode?.insertBefore(next, line.nextSibling);
      placeCaretAtEnd(next);
      return true;
    }
    return false;
  }

  // i) roman lower
  m = text.match(/^(\s*)([ivxlcdm]+)\)\s*(.*)$/i);
  if (m) {
    const indent = m[1];
    const rom = m[2].toLowerCase();
    const rest = m[3];
    if (!ROMAN_LOWER.includes(rom)) return false;
    if (rest.trim() === "") {
      e.preventDefault();
      line.innerHTML = "<br>";
      placeCaretInStart(line);
      return true;
    }
    const nxt = nextRoman(rom, false);
    e.preventDefault();
    const next = document.createElement("div");
    next.textContent = `${indent}${nxt}) `;
    line.parentNode?.insertBefore(next, line.nextSibling);
    placeCaretAtEnd(next);
    return true;
  }

  // I. II.
  m = text.match(/^(\s*)([IVXLCDM]+)\.\s*(.*)$/);
  if (m) {
    const indent = m[1];
    const rom = m[2];
    const rest = m[3];
    if (!ROMAN_UPPER.includes(rom)) return false;
    if (rest.trim() === "") {
      e.preventDefault();
      line.innerHTML = "<br>";
      placeCaretInStart(line);
      return true;
    }
    const nxt = nextRoman(rom, true);
    e.preventDefault();
    const next = document.createElement("div");
    next.textContent = `${indent}${nxt}. `;
    line.parentNode?.insertBefore(next, line.nextSibling);
    placeCaretAtEnd(next);
    return true;
  }

  return false;
}

function handleTabIndent(e: React.KeyboardEvent, root: HTMLElement) {
  if (e.key !== "Tab") return false;
  const sel = window.getSelection();
  if (!sel?.rangeCount) return false;
  const line = getLineDiv(root, sel);
  if (!line || !root.contains(line)) return false;
  e.preventDefault();
  const pad = parseInt(line.style.paddingLeft || "0", 10) || 0;
  line.style.paddingLeft = `${pad + 24}px`;
  return true;
}

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  /** Bump when server-loaded content should replace the editor (e.g. after fetch). */
  hydrateNonce: number;
};

export function SmartRichNotesEditor({ value, onChange, placeholder, className, hydrateNonce }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const smartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toolbar, setToolbar] = useState<{ top: number; left: number; visible: boolean }>({
    top: 0,
    left: 0,
    visible: false,
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [hasText, setHasText] = useState(false);
  const composing = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const v = valueRef.current || "";
    if (!v.trim()) {
      el.innerHTML = "<div><br></div>";
    } else if (looksLikeRichHtml(v)) {
      el.innerHTML = v;
    } else {
      el.innerHTML = plainTextToEditorHtml(v);
    }
    ensureEditorStructure(el);
    setHasText(!!(el.textContent || "").trim());
  }, [hydrateNonce]);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    ensureEditorStructure(el);
    setHasText(!!(el.textContent || "").trim());
    onChange(el.innerHTML);
  }, [onChange]);

  const scheduleSmart = useCallback(() => {
    if (smartTimer.current) clearTimeout(smartTimer.current);
    smartTimer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      runSmartPass(el);
      onChange(el.innerHTML);
    }, 450);
  }, [onChange]);

  const updateToolbarPosition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !el.contains(sel.anchorNode)) {
      setToolbar((t) => ({ ...t, visible: false }));
      setPaletteOpen(false);
      setHighlightOpen(false);
      return;
    }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      setToolbar((t) => ({ ...t, visible: false }));
      return;
    }
    const top = r.top - 48;
    const left = r.left + r.width / 2;
    setToolbar({ top, left, visible: true });
  }, []);

  useEffect(() => {
    const onSel = () => updateToolbarPosition();
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, [updateToolbarPosition]);

  useEffect(() => {
    return () => {
      if (smartTimer.current) clearTimeout(smartTimer.current);
    };
  }, []);

  const exec = (command: string, commandValue?: string) => {
    ref.current?.focus();
    try {
      document.execCommand("styleWithCSS", false, "true");
    } catch {
      /* ignore */
    }
    document.execCommand(command, false, commandValue);
    emit();
    updateToolbarPosition();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") {
      if (handleTabIndent(e, ref.current!)) {
        emit();
        return;
      }
    }

    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "b") {
      e.preventDefault();
      exec("bold");
      return;
    }
    if (mod && e.key.toLowerCase() === "i") {
      e.preventDefault();
      exec("italic");
      return;
    }
    if (mod && e.key.toLowerCase() === "u") {
      e.preventDefault();
      exec("underline");
      return;
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === "h") {
      e.preventDefault();
      exec("hiliteColor", HIGHLIGHT_COLORS[0].value);
      return;
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === "c") {
      e.preventDefault();
      setPaletteOpen(true);
      setToolbar((t) => ({ ...t, visible: true }));
      return;
    }

    if (tryListContinue(e, ref.current!)) {
      emit();
      return;
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    const inlineNum = text.match(/\d+\.\s/g);
    if (inlineNum && inlineNum.length >= 2 && text.includes(" ") && !text.includes("\n")) {
      e.preventDefault();
      ref.current?.focus();
      try {
        document.execCommand("styleWithCSS", false, "true");
      } catch {
        /* ignore */
      }
      const parts = text.split(/(?=\d+\.\s)/g).map((p) => p.trim()).filter(Boolean);
      const html = parts.map((p) => `<div>${escapeHtml(p)}</div>`).join("");
      document.execCommand("insertHTML", false, html);
      emit();
      scheduleSmart();
    }
  };

  return (
    <div className={cn("fv-smart-editor-wrap relative", className)}>
      {toolbar.visible ? (
        <div
          className="fv-format-toolbar"
          style={{
            position: "fixed",
            top: toolbar.top,
            left: toolbar.left,
            transform: "translateX(-50%)",
            zIndex: 60,
          }}
          onMouseDown={(ev) => ev.preventDefault()}
        >
          <button type="button" className="fv-ft-btn" title="Bold (⌘B)" onClick={() => exec("bold")}>
            <Bold className="h-4 w-4" />
          </button>
          <button type="button" className="fv-ft-btn" title="Italic (⌘I)" onClick={() => exec("italic")}>
            <Italic className="h-4 w-4" />
          </button>
          <button type="button" className="fv-ft-btn" title="Underline (⌘U)" onClick={() => exec("underline")}>
            <Underline className="h-4 w-4" />
          </button>
          <div className="fv-ft-sep" />
          <details className="fv-ft-details" open={highlightOpen} onToggle={(ev) => setHighlightOpen((ev.target as HTMLDetailsElement).open)}>
            <summary className="fv-ft-summary" title="Highlight">
              <Highlighter className="h-4 w-4" />
              <ChevronDown className="h-3 w-3 opacity-60" />
            </summary>
            <div className="fv-ft-popover">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className="fv-ft-swatch"
                  style={{ background: c.value }}
                  title={c.name}
                  onClick={() => {
                    exec("hiliteColor", c.value);
                    setHighlightOpen(false);
                  }}
                />
              ))}
            </div>
          </details>
          <details className="fv-ft-details" open={paletteOpen} onToggle={(ev) => setPaletteOpen((ev.target as HTMLDetailsElement).open)}>
            <summary className="fv-ft-summary" title="Text color (⌘⇧C)">
              <Palette className="h-4 w-4" />
              <ChevronDown className="h-3 w-3 opacity-60" />
            </summary>
            <div className="fv-ft-popover">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className="fv-ft-swatch fv-ft-swatch-ring"
                  style={{ background: c.value }}
                  title={c.name}
                  onClick={() => {
                    exec("foreColor", c.value);
                    setPaletteOpen(false);
                  }}
                />
              ))}
            </div>
          </details>
        </div>
      ) : null}

      {!hasText ? (
        <div className="fv-smart-editor-placeholder pointer-events-none select-none absolute left-0 right-0 top-0 text-muted-foreground/55 px-6 pt-2 text-lg z-0">
          {placeholder}
        </div>
      ) : null}

      <div
        ref={ref}
        className="notebook-rich-editor notebook-textarea"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        aria-label="Note body"
        onInput={() => {
          if (composing.current) return;
          emit();
          scheduleSmart();
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          emit();
          scheduleSmart();
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onMouseUp={updateToolbarPosition}
        onKeyUp={updateToolbarPosition}
        onBlur={() => {
          setTimeout(() => {
            const active = document.activeElement;
            if (!active?.closest?.(".fv-format-toolbar")) {
              setToolbar((t) => ({ ...t, visible: false }));
              setPaletteOpen(false);
              setHighlightOpen(false);
            }
          }, 150);
        }}
      />
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

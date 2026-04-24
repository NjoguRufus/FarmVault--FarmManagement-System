import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold,
  Copy,
  Italic,
  Underline,
  Highlighter,
  Palette,
  ChevronDown,
  Undo2,
  Redo2,
} from "lucide-react";
import { toast } from "sonner";
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
  
  const isNumberedList = /^(\s*)(\d+)\.\s/.test(text);
  const isLetterList = /^(\s*)([A-Z])\.\s/.test(text) || /^(\s*)([a-z])\.\s/.test(text);
  const isRomanList = /^(\s*)([IVXLCDM]+)\.\s/.test(text) || /^(\s*)([ivxlcdm]+)\)\s/.test(text);
  
  if (!isNumberedList && !isLetterList && !isRomanList) {
    return false;
  }

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

function isAndroidWebView(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

function fallbackCopyPlainText(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.top = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand("copy");
    toast.success("Copied");
  } catch {
    toast.error("Copy failed");
  }
  document.body.removeChild(ta);
}

function clampToolbarPosition(
  left: number,
  top: number,
  opts: { approxWidth: number; approxHeight: number },
): { left: number; top: number } {
  if (typeof window === "undefined") return { left, top };
  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const half = opts.approxWidth / 2;
  let x = Math.min(vw - pad - half, Math.max(pad + half, left));
  let y = Math.max(pad, top);
  if (y + opts.approxHeight > vh - pad) {
    y = Math.max(pad, vh - pad - opts.approxHeight);
  }
  return { left: x, top: y };
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function saveDomSelectionOffsets(root: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;

  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  pre.setEnd(range.endContainer, range.endOffset);
  const end = pre.toString().length;
  return { start, end };
}

function restoreDomSelectionOffsets(root: HTMLElement, start: number, end: number): void {
  const orderedStart = Math.min(start, end);
  const orderedEnd = Math.max(start, end);

  const textNodes: { node: Text; len: number }[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const tn = n as Text;
    textNodes.push({ node: tn, len: tn.textContent?.length ?? 0 });
  }

  const total = textNodes.reduce((s, x) => s + x.len, 0);
  if (total === 0) return;

  const s0 = clampInt(orderedStart, 0, total);
  const e0 = clampInt(orderedEnd, 0, total);

  let pos = 0;
  let startNode: Text | null = null;
  let startOff = 0;
  let endNode: Text | null = null;
  let endOff = 0;

  for (const { node, len } of textNodes) {
    if (startNode === null && pos + len >= s0) {
      startNode = node;
      startOff = s0 - pos;
    }
    if (endNode === null && pos + len >= e0) {
      endNode = node;
      endOff = e0 - pos;
      break;
    }
    pos += len;
  }

  if (!startNode || !endNode) return;

  const maxS = startNode.textContent?.length ?? 0;
  const maxE = endNode.textContent?.length ?? 0;
  startOff = clampInt(startOff, 0, maxS);
  endOff = clampInt(endOff, 0, maxE);

  const sel = window.getSelection();
  const r = document.createRange();
  try {
    r.setStart(startNode, startOff);
    r.setEnd(endNode, endOff);
    sel?.removeAllRanges();
    sel?.addRange(r);
  } catch {
    /* ignore */
  }
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
  hydrateNonce: number;
};

export function SmartRichNotesEditor({ value, onChange, placeholder, className, hydrateNonce }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const smartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ✅ NEW: track whether the last keypress was Enter, to skip cursor restore in smart pass
  const justPressedEnterRef = useRef(false);
  const selectionWasCollapsedRef = useRef(true);
  const suppressBlurToolbarRef = useRef(false);
  const [toolbar, setToolbar] = useState<{ top: number; left: number; visible: boolean }>({
    top: 0,
    left: 0,
    visible: false,
  });
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
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

  // ✅ FIXED: scheduleSmart now accepts a flag to skip cursor restoration
  const scheduleSmart = useCallback((skipCursorRestore = false) => {
    if (smartTimer.current) clearTimeout(smartTimer.current);
    smartTimer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      if (composing.current) return;

      // Only save/restore cursor when NOT right after an Enter keypress
      const snap = skipCursorRestore ? null : saveDomSelectionOffsets(el);
      runSmartPass(el);
      if (snap) {
        restoreDomSelectionOffsets(el, snap.start, snap.end);
        void el.focus({ preventScroll: true });
      }
      onChange(el.innerHTML);
      justPressedEnterRef.current = false;
    }, 450);
  }, [onChange]);

  const updateToolbarPosition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !el.contains(sel.anchorNode)) {
      selectionWasCollapsedRef.current = true;
      setToolbar((t) => ({ ...t, visible: false }));
      setShowHighlightPicker(false);
      setShowColorPicker(false);
      return;
    }

    selectionWasCollapsedRef.current = false;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    if (rect.width === 0 && rect.height === 0) {
      setToolbar((t) => ({ ...t, visible: false }));
      return;
    }
    
    let top = rect.top - 52;
    let left = rect.left + rect.width / 2;
    
    if (top < 8) {
      top = rect.bottom + 12;
    }
    
    const toolbarWidth = Math.min(420, window.innerWidth - 24);
    const pos = clampToolbarPosition(left, top, { approxWidth: toolbarWidth, approxHeight: 44 });
    setToolbar({ top: pos.top, left: pos.left, visible: true });
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
    setTimeout(() => updateToolbarPosition(), 10);
  };

  const execHistory = (command: "undo" | "redo") => {
    ref.current?.focus();
    try {
      document.execCommand(command, false, undefined);
    } catch {
      /* ignore */
    }
    emit();
    setTimeout(() => updateToolbarPosition(), 10);
  };

  const copySelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString();
    if (!text.trim()) return;
    if (navigator.clipboard && window.isSecureContext) {
      void navigator.clipboard.writeText(text).then(
        () => toast.success("Copied"),
        () => fallbackCopyPlainText(text),
      );
    } else {
      fallbackCopyPlainText(text);
    }
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") {
      if (handleTabIndent(e, ref.current!)) {
        emit();
        return;
      }
      return;
    }

    if (e.key === "Enter") {
      const isListContinued = tryListContinue(e, ref.current!);
      if (isListContinued) {
        e.preventDefault();
        emit();
        return;
      }
      // ✅ FIXED: mark that Enter was pressed and skip cursor restore in smart pass
      justPressedEnterRef.current = true;
      setTimeout(() => {
        emit();
        scheduleSmart(true); // pass true = skip cursor restore
      }, 10);
      return;
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
      setShowColorPicker(!showColorPicker);
      setShowHighlightPicker(false);
      return;
    }
    if (mod && !e.shiftKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      execHistory("undo");
      return;
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      execHistory("redo");
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      execHistory("redo");
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

  // Close pickers when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.picker-container')) {
        setShowHighlightPicker(false);
        setShowColorPicker(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div className={cn("fv-smart-editor-wrap relative", className)}>
      {/* Undo/Redo buttons row */}
      <div className="flex justify-end gap-1 pb-2 mb-2 border-b border-gray-100 sticky top-0 bg-white z-10">
        <button
          type="button"
          className="h-7 w-7 rounded-md bg-white shadow-sm border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
          title="Undo (⌘Z)"
          onClick={() => execHistory("undo")}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="h-7 w-7 rounded-md bg-white shadow-sm border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
          title="Redo (⌘⇧Z)"
          onClick={() => execHistory("redo")}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Editor content area */}
      <div className="relative min-h-[200px]">
        {!hasText && (
          <div className="absolute left-0 right-0 top-0 text-muted-foreground/55 px-1 pt-1 text-base z-0 pointer-events-none select-none">
            {placeholder}
          </div>
        )}

        <div
          ref={ref}
          className="notebook-rich-editor notebook-textarea note-editor outline-none px-1"
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
              if (suppressBlurToolbarRef.current) return;
              const active = document.activeElement;
              if (!active?.closest?.(".fixed")) {
                setToolbar((t) => ({ ...t, visible: false }));
                setShowHighlightPicker(false);
                setShowColorPicker(false);
              }
            }, 150);
          }}
        />
      </div>

      {/* Floating Toolbar */}
      {toolbar.visible && (
        <div
          className="fixed z-50 bg-white rounded-xl shadow-lg border border-gray-200"
          style={{
            top: toolbar.top,
            left: toolbar.left,
            transform: "translateX(-50%)",
          }}
          onPointerDown={(ev) => ev.preventDefault()}
        >
          <div className="flex flex-row flex-nowrap items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-1.5">
            <button
              type="button"
              className="h-8 w-8 sm:h-7 sm:w-7 rounded-md flex items-center justify-center hover:bg-gray-100 transition-colors flex-shrink-0"
              title="Bold (⌘B)"
              onClick={() => exec("bold")}
            >
              <Bold className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="h-8 w-8 sm:h-7 sm:w-7 rounded-md flex items-center justify-center hover:bg-gray-100 transition-colors flex-shrink-0"
              title="Italic (⌘I)"
              onClick={() => exec("italic")}
            >
              <Italic className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="h-8 w-8 sm:h-7 sm:w-7 rounded-md flex items-center justify-center hover:bg-gray-100 transition-colors flex-shrink-0"
              title="Underline (⌘U)"
              onClick={() => exec("underline")}
            >
              <Underline className="h-4 w-4" />
            </button>
            
            <div className="w-px h-5 bg-gray-200 mx-1 flex-shrink-0" />
            
            <button
              type="button"
              className="h-8 w-8 sm:h-7 sm:w-7 rounded-md flex items-center justify-center hover:bg-gray-100 transition-colors flex-shrink-0"
              title="Copy"
              onClick={copySelection}
            >
              <Copy className="h-4 w-4" />
            </button>
            
            <div className="w-px h-5 bg-gray-200 mx-1 flex-shrink-0" />
            
            {/* Highlighter button with picker */}
            <div className="relative picker-container">
              <button
                type="button"
                className={`h-8 w-8 sm:h-7 sm:w-7 rounded-md flex items-center justify-center gap-0.5 transition-colors flex-shrink-0 ${showHighlightPicker ? 'bg-gray-100' : 'hover:bg-gray-100'}`}
                title="Highlight (⌘⇧H)"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowHighlightPicker(!showHighlightPicker);
                  setShowColorPicker(false);
                }}
              >
                <Highlighter className="h-4 w-4" />
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </button>
              {showHighlightPicker && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 p-2 flex gap-2 z-[60] whitespace-nowrap">
                  {HIGHLIGHT_COLORS.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      className="w-7 h-7 rounded-md border border-gray-200 cursor-pointer transition-transform hover:scale-105 flex-shrink-0"
                      style={{ background: c.value }}
                      title={c.name}
                      onClick={(e) => {
                        e.stopPropagation();
                        exec("hiliteColor", c.value);
                        setShowHighlightPicker(false);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Color picker button with picker */}
            <div className="relative picker-container">
              <button
                type="button"
                className={`h-8 w-8 sm:h-7 sm:w-7 rounded-md flex items-center justify-center gap-0.5 transition-colors flex-shrink-0 ${showColorPicker ? 'bg-gray-100' : 'hover:bg-gray-100'}`}
                title="Text color (⌘⇧C)"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowColorPicker(!showColorPicker);
                  setShowHighlightPicker(false);
                }}
              >
                <Palette className="h-4 w-4" />
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </button>
              {showColorPicker && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 p-2 flex gap-2 z-[60] whitespace-nowrap">
                  {TEXT_COLORS.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      className="w-7 h-7 rounded-md border border-gray-200 cursor-pointer transition-transform hover:scale-105 flex-shrink-0"
                      style={{ background: c.value }}
                      title={c.name}
                      onClick={(e) => {
                        e.stopPropagation();
                        exec("foreColor", c.value);
                        setShowColorPicker(false);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
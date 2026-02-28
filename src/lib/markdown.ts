/**
 * Minimal markdown-to-HTML for note content: bold, lists, blockquotes (including > ⚠️ callouts).
 * Escapes HTML to avoid XSS.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderMarkdown(md: string): string {
  if (!md?.trim()) return '';
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  let inBlockquote = false;

  function closeList() {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  }
  function closeBlockquote() {
    if (inBlockquote) {
      out.push('</blockquote>');
      inBlockquote = false;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trimStart();
    const spaces = line.length - trimmed.length;

    // Blockquote (including > ⚠️)
    if (trimmed.startsWith('>')) {
      closeList();
      const content = trimmed.slice(1).trim();
      if (!inBlockquote) {
        out.push('<blockquote class="border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30 pl-4 py-2 my-2 rounded-r">');
        inBlockquote = true;
      }
      out.push(escapeHtml(content) + ' ');
      continue;
    }
    closeBlockquote();

    // Unordered list
    if (/^[-*]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      if (!inList) {
        out.push('<ul class="list-disc list-inside my-2 space-y-1">');
        inList = true;
      }
      const content = trimmed.replace(/^[-*]\s/, '').replace(/^\d+\.\s/, '');
      out.push('<li>' + inlineMarkdown(content) + '</li>');
      continue;
    }
    closeList();

    // Headings
    if (trimmed.startsWith('### ')) {
      out.push('<h3 class="font-semibold text-lg mt-4 mb-2">' + inlineMarkdown(trimmed.slice(4)) + '</h3>');
      continue;
    }
    if (trimmed.startsWith('## ')) {
      out.push('<h2 class="font-semibold text-xl mt-4 mb-2">' + inlineMarkdown(trimmed.slice(3)) + '</h2>');
      continue;
    }
    if (trimmed.startsWith('# ')) {
      out.push('<h1 class="font-bold text-2xl mt-4 mb-2">' + inlineMarkdown(trimmed.slice(2)) + '</h1>');
      continue;
    }

    // Paragraph
    if (trimmed) {
      out.push('<p class="my-2">' + inlineMarkdown(trimmed) + '</p>');
    } else {
      out.push('<br/>');
    }
  }

  closeList();
  closeBlockquote();
  return out.join('');
}

function inlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>');
}

export function printHtmlReport(html: string) {
  // NOTE: Some browsers can produce a non-writable blank window when opened with
  // `noopener,noreferrer` while also using `document.write`. Use `about:blank`
  // and explicitly null out opener instead.
  const w = window.open('about:blank', '_blank');
  if (!w) {
    throw new Error('Popup blocked');
  }
  try {
    w.opener = null;
  } catch {
    // ignore
  }
  w.focus();

  const safeHtml =
    html && html.trim()
      ? html
      : `<!doctype html><html><head><meta charset="utf-8" /><title>FarmVault Report</title></head><body>Empty report HTML</body></html>`;
  w.document.open();
  w.document.write(safeHtml);
  w.document.close();

  const triggerPrint = () => {
    try {
      // Prefer template-defined exportPDF() when present
      const anyWin = w as unknown as { exportPDF?: () => void; print?: () => void };
      const doPrint = () => {
        if (typeof anyWin.exportPDF === 'function') anyWin.exportPDF();
        else if (typeof anyWin.print === 'function') anyWin.print();
      };

      // Give layout/paint a beat to avoid blank print on some browsers
      w.requestAnimationFrame(() => setTimeout(doPrint, 50));
    } catch {
      // ignore
    }
  };

  // If load doesn't fire (rare with document.write), still try shortly.
  w.addEventListener('load', triggerPrint, { once: true });
  setTimeout(triggerPrint, 250);
}


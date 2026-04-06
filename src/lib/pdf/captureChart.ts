import html2canvas from 'html2canvas';

const html2canvasOpts = {
  backgroundColor: '#ffffff',
  useCORS: true,
  logging: false,
} as const;

export async function captureElementPngDataUrl(element: HTMLElement): Promise<string | null> {
  try {
    const canvas = await html2canvas(element, {
      ...html2canvasOpts,
      scale: 2,
    });
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/**
 * Captures the element as shown (layout + computed colours). Scale follows device pixel ratio
 * (capped) so the PNG matches on-screen sharpness without changing proportions.
 */
export async function downloadElementAsPng(element: HTMLElement, filename: string): Promise<void> {
  const dpr =
    typeof window !== 'undefined' ? Math.min(2.5, Math.max(1, window.devicePixelRatio || 1)) : 2;
  const canvas = await html2canvas(element, {
    ...html2canvasOpts,
    scale: dpr,
  });
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}


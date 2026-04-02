import html2canvas from 'html2canvas';

export async function captureElementPngDataUrl(element: HTMLElement): Promise<string | null> {
  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#FFFFFF',
      scale: 2,
      useCORS: true,
      logging: false,
    });
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}


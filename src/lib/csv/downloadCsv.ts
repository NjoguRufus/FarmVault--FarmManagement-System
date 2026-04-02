type CsvRow = Record<string, unknown>;

function convertToCsv(data: CsvRow[]): string {
  if (!data.length) return '';
  const headers = Object.keys(data[0]);

  const escapeValue = (value: unknown): string => {
    if (value == null) return '';
    const str = String(value);
    const needsQuotes = /[",\n]/.test(str);
    const escaped = str.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  };

  const headerLine = headers.map(escapeValue).join(',');
  const lines = data.map((row) => headers.map((key) => escapeValue(row[key])).join(','));
  return [headerLine, ...lines].join('\r\n');
}

export function downloadCsv(rows: CsvRow[], fileName: string) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const csv = convertToCsv(rows);
  // Excel-friendly: UTF-8 BOM so non-ascii renders correctly in Excel
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });

  const safeFileName =
    (fileName || 'export')
      .replace(/[^a-z0-9_\-]+/gi, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase() + '.csv';

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


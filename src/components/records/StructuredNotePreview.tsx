import type { NoteStructuredBlock } from "@/lib/notebook/parseNotebookContentToBlocks";

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function StructuredNotePreview({ blocks }: { blocks: NoteStructuredBlock[] }) {
  if (!blocks.length) {
    return <p className="nb-structured-empty text-sm text-muted-foreground">Nothing to preview yet.</p>;
  }

  return (
    <div className="nb-structured">
      {blocks.map((b, idx) => {
        const key = `${b.type}-${idx}`;
        switch (b.type) {
          case "section":
            return (
              <h3 key={key} className="nb-structured-section">
                {escapeHtml(b.title)}
              </h3>
            );
          case "paragraph":
            return (
              <p key={key} className="nb-structured-paragraph">
                {escapeHtml(b.text)}
              </p>
            );
          case "bullet_list":
            return (
              <ul key={key} className="nb-structured-list">
                {b.items.map((item, i) => (
                  <li key={i}>{escapeHtml(item)}</li>
                ))}
              </ul>
            );
          case "table":
            return (
              <div key={key} className="nb-structured-table-wrap">
                <table className="nb-structured-table">
                  <thead>
                    <tr>
                      {b.headers.map((h, i) => (
                        <th key={i}>{escapeHtml(h)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci}>{escapeHtml(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "callout":
            return (
              <div
                key={key}
                className={b.variant === "warning" ? "nb-structured-callout nb-structured-callout--warning" : "nb-structured-callout nb-structured-callout--info"}
                role="note"
              >
                {escapeHtml(b.text)}
              </div>
            );
          case "maturity":
            return (
              <div key={key} className="nb-structured-maturity">
                <span className="nb-structured-maturity-label">{escapeHtml(b.label)}:</span>{" "}
                <span className="nb-structured-maturity-value">{escapeHtml(b.value)}</span>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

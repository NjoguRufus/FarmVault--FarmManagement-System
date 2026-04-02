import React from "react";
import { htmlToPlainText } from "@/lib/notebook/htmlToPlainText";

type NoteLike = {
  id: string;
  title: string | null;
  content: string | null;
  created_at: string | null;
  updated_at: string | null;
  source?: string | null;
  is_admin_note?: boolean | null;
};

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function NotesCard({
  note,
  onClick,
}: {
  note: NoteLike;
  onClick?: () => void;
}) {
  const isFarmVault =
    String(note.source ?? "").toLowerCase() === "developer" || Boolean(note.is_admin_note);

  const title = note.title?.trim() ? note.title.trim() : "Untitled";
  const plain = htmlToPlainText(note.content ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const preview = plain ? (plain.length <= 80 ? plain : `${plain.slice(0, 79)}…`) : "No content yet…";
  const dateText = formatDate(note.created_at ?? note.updated_at) || "FarmVault";

  return (
    <button type="button" className="notes-card" onClick={onClick}>
      {isFarmVault && <div className="notes-ribbon">From FarmVault</div>}

      <img src="/icons/notes-icon.png" alt="note" className="notes-icon" />

      <div className="notes-content">
        <h4 className="notes-title">{title}</h4>
        <p className="notes-preview">{preview}</p>
        <span className="notes-date">{dateText}</span>
      </div>
    </button>
  );
}


import { useState } from "react";
import { Check, Copy, Trash2 } from "lucide-react";
import type { Note } from "../lib/types.ts";

type NoteCardProps = {
  note: Note;
  onToggle: () => void;
  onDelete: () => void;
};

const priorityClass = (priority?: string) => {
  if (priority === "alta") return "high";
  if (priority === "media") return "mid";
  if (priority === "baja") return "low";
  return "";
};

export function NoteCard({ note, onToggle, onDelete }: NoteCardProps) {
  const [copied, setCopied] = useState(false);
  const isStructured =
    Boolean(note.title) ||
    Boolean(note.category) ||
    Boolean(note.system) ||
    Boolean(note.priority) ||
    Boolean(note.reason) ||
    Boolean(note.notes) ||
    Boolean(note.suggestedFileName);

  const title = note.title || note.text;

  if (!isStructured) {
    return (
      <div className={`note-row ${note.done ? "done" : ""}`}>
        <button
          className="note-check"
          onClick={onToggle}
          aria-label={note.done ? "Marcar pendiente" : "Marcar completado"}
        >
          {note.done && <Check size={14} />}
        </button>
        <span>{note.text}</span>
        <button
          className="note-delete"
          onClick={onDelete}
          aria-label="Eliminar"
        >
          <Trash2 size={15} />
        </button>
      </div>
    );
  }

  async function copyFile() {
    if (!note.suggestedFileName) return;
    try {
      await navigator.clipboard.writeText(note.suggestedFileName);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <article className={`note-card ${note.done ? "done" : ""}`}>
      <div className="note-card-top">
        <button
          className="note-check"
          onClick={onToggle}
          aria-label={note.done ? "Marcar pendiente" : "Marcar completado"}
        >
          {note.done && <Check size={14} />}
        </button>
        <strong className="note-card-title">{title}</strong>
        <button
          className="note-delete"
          onClick={onDelete}
          aria-label="Eliminar"
        >
          <Trash2 size={15} />
        </button>
      </div>
      <div className="note-card-chips">
        {note.category && (
          <span className="note-chip category">{note.category}</span>
        )}
        {note.priority && (
          <span className={`note-chip priority ${priorityClass(note.priority)}`}>
            {note.priority.toUpperCase()}
          </span>
        )}
        {note.system && (
          <span className="note-chip system">{note.system}</span>
        )}
        {note.folder && (
          <span className="note-chip folder">{note.folder}</span>
        )}
      </div>
      {note.reason && <p className="note-card-reason">{note.reason}</p>}
      {note.notes && (
        <p className="note-card-notes">
          <span className="note-info-icon">i</span>
          {note.notes}
        </p>
      )}
      {note.suggestedFileName && (
        <div className="note-card-file">
          <code>{note.suggestedFileName}</code>
          <button
            className="text-button"
            onClick={copyFile}
            aria-label={`Copiar nombre de archivo ${note.suggestedFileName}`}
          >
            <Copy size={12} /> {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
      )}
    </article>
  );
}
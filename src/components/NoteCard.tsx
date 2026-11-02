import { useState } from "react";
import { Check, Copy, Trash2 } from "lucide-react";
import type { Note } from "../lib/types.ts";
import { Button } from "./ui/Button.tsx";
import { Chip } from "./ui/Chip.tsx";

type NoteCardProps = {
  note: Note;
  /** El dato por el que se agrupa ya está en la cabecera del grupo. */
  groupBy: "category" | "system";
  onToggle: () => void;
  onDelete: () => void;
};

export function NoteCard({ note, groupBy, onToggle, onDelete }: NoteCardProps) {
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const title = note.title || note.text;
  const category = groupBy !== "category" && note.category;
  const system = groupBy !== "system" && note.system;
  const folder = note.folder !== note.system && note.folder;
  const hasChips = category || system || folder || note.priority;

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
          aria-label={note.done ? "Marcar pendiente" : "Marcar conseguido"}
          title={note.done ? "Marcar pendiente" : "Marcar conseguido"}
        >
          {note.done && <Check size={16} strokeWidth={3} />}
        </button>
        <strong className="note-card-title">{title}</strong>
        <button
          className="note-delete"
          onClick={() => setConfirmingDelete(true)}
          aria-label={`Eliminar ${title}`}
          title="Eliminar"
        >
          <Trash2 size={16} />
        </button>
      </div>
      {hasChips && (
        <div className="note-card-chips">
          {category && (
            <Chip tone="category" caps>
              {category}
            </Chip>
          )}
          {note.priority && (
            <Chip tone={note.priority} caps>
              {note.priority.toUpperCase()}
            </Chip>
          )}
          {system && (
            <Chip tone="system" caps>
              {system}
            </Chip>
          )}
          {folder && <Chip tone="folder">{folder}</Chip>}
        </div>
      )}
      {!note.done && note.reason && (
        <p className="note-card-reason">{note.reason}</p>
      )}
      {!note.done && note.notes && (
        <p className="note-card-notes">{note.notes}</p>
      )}
      {!note.done && note.suggestedFileName && (
        <div className="note-card-file">
          <code>{note.suggestedFileName}</code>
          <Button
            variant="text"
            onClick={copyFile}
            aria-label={`Copiar nombre de archivo ${note.suggestedFileName}`}
          >
            <Copy size={14} /> {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
      )}
      {confirmingDelete && (
        <div className="note-card-confirm">
          <span>¿Eliminar de la lista?</span>
          <Button onClick={() => setConfirmingDelete(false)}>
            Cancelar
          </Button>
          <Button className="danger" onClick={onDelete}>
            <Trash2 size={14} /> Eliminar
          </Button>
        </div>
      )}
    </article>
  );
}

import { useRef } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Disc3,
  Gamepad2,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { ImageStatus, Note, NewGameDraft } from "../lib/types.ts";

type AddGameModalProps = {
  systemName: string;
  drafts: NewGameDraft[];
  notes: Note[];
  loading: boolean;
  onClose: () => void;
  onChooseRoms: () => void;
  onRemoveDraft: (id: string) => void;
  onDraftTitleChange: (id: string, value: string) => void;
  onDraftSearch: (id: string) => void;
  onDraftSelectImage: (id: string, file: File) => void;
  onDraftClearImage: (id: string) => void;
  onToggleNote: (id: string) => void;
  onSave: () => void;
};

export function AddGameModal(props: AddGameModalProps) {
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const pendingNotes = props.notes.filter((note) => !note.done);
  const completedNotes = props.notes.filter((note) => note.done);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div className={`add-game-modal-pair ${props.notes.length ? "has-pending-notes" : ""}`}>
      <section className="modal modal-wide">
        <div className="modal-header">
          <div>
            <div className="eyebrow">AMPLÍA TU COLECCIÓN</div>
            <h2>Añadir juegos</h2>
            <p className="modal-subtitle">
              Selecciona uno o varios archivos, ajusta los nombres y, si quieres,
              busca o sube una carátula para cada uno. Los juegos se añadirán en
              un solo paso.
            </p>
          </div>
          <button
            className="icon-button"
            onClick={props.onClose}
            aria-label="Cerrar"
          >
            <X size={17} />
          </button>
        </div>

        <div className="modal-body add-game-body">
          <div className="add-game-main">
            <label className="field-label">SISTEMA DESTINO</label>
            <div className="selected-system">
              <Gamepad2 size={17} />
              <strong>{props.systemName}</strong>
              <span>Se guardarán en este emulador</span>
            </div>

            <label className="field-label">
              ARCHIVOS DE JUEGO <span>SELECCIÓN MÚLTIPLE</span>
            </label>
            <button className="file-picker" onClick={props.onChooseRoms}>
              <Plus size={17} />
              <span>
                {props.drafts.length
                  ? `Añadir más archivos (${props.drafts.length} seleccionados)`
                  : "Selecciona uno o varios archivos de juego"}
              </span>
            </button>

          {props.drafts.length > 0 && (
            <div className="draft-list">
              {props.drafts.map((draft) => (
                <article className="draft-row" key={draft.id}>
                  <div className="draft-cover">
                    {draft.imagePreview ? (
                      <img src={draft.imagePreview} alt={draft.title} />
                    ) : (
                      <>
                        <Gamepad2 size={20} />
                        <span>{draft.fileName.slice(0, 1).toUpperCase()}</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      hidden
                      ref={(element) => {
                        fileInputs.current[draft.id] = element;
                      }}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) props.onDraftSelectImage(draft.id, file);
                        event.target.value = "";
                      }}
                    />
                  </div>

                  <div className="draft-main">
                    <strong className="draft-file" title={draft.fileName}>
                      {draft.fileName}
                    </strong>
                    <label className="field-label">NOMBRE DEL JUEGO</label>
                    <input
                      className="text-field"
                      value={draft.title}
                      onChange={(event) =>
                        props.onDraftTitleChange(draft.id, event.target.value)
                      }
                      placeholder="Nombre del juego"
                    />
                    <div className="draft-meta">
                      <span className="draft-status">
                        {draft.imageBytes ? (
                          <>
                            <CheckCircle2 size={12} /> Carátula lista · 512 × 512 px
                          </>
                        ) : (
                          <>
                            <ImageIcon size={12} /> Sin carátula todavía
                          </>
                        )}
                      </span>
                      {draft.error && (
                        <span className="draft-error">
                          <AlertCircle size={12} /> {draft.error}
                        </span>
                      )}
                    </div>
                    <div className="draft-cover-actions">
                      <button
                        className="secondary-button"
                        onClick={() => props.onDraftSearch(draft.id)}
                        disabled={draft.searching}
                        aria-label={`Buscar carátula para ${draft.fileName}`}
                      >
                        {draft.searching ? (
                          <LoaderCircle size={13} className="spin" />
                        ) : (
                          <Sparkles size={13} />
                        )}
                        {draft.searching ? "Buscando…" : "Buscar"}
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => fileInputs.current[draft.id]?.click()}
                        aria-label={`Subir carátula para ${draft.fileName}`}
                      >
                        <ImageIcon size={13} /> Subir
                      </button>
                      {draft.imagePreview && (
                        <button
                          className="secondary-button"
                          onClick={() => props.onDraftClearImage(draft.id)}
                          aria-label={`Quitar carátula de ${draft.fileName}`}
                        >
                          <X size={13} /> Quitar
                        </button>
                      )}
                    </div>
                  </div>

                  <button
                    className="icon-button remove-draft"
                    onClick={() => props.onRemoveDraft(draft.id)}
                    aria-label={`Quitar archivo ${draft.fileName}`}
                    title="Quitar de la selección"
                  >
                    <Trash2 size={14} />
                  </button>
                </article>
              ))}
            </div>
          )}

            {props.drafts.length === 0 && (
              <div className="inline-info">
                <AlertCircle size={14} /> Selecciona los archivos de juego para
                empezar. Puedes añadir varios a la vez.
              </div>
            )}
          </div>

        </div>

        <div className="modal-footer">
          <span>
            <CheckCircle2 size={14} />{" "}
            {props.drafts.length
              ? `${props.drafts.length} juego(s) se copiarán a la microSD`
              : "Selecciona archivos para continuar"}
          </span>
          <button
            className="primary-button"
            onClick={props.onSave}
            disabled={!props.drafts.length || props.loading}
          >
            {props.loading ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Plus size={16} />
            )}{" "}
            Añadir {props.drafts.length ? props.drafts.length : ""} juego
            {props.drafts.length === 1 ? "" : "s"}
          </button>
        </div>
      </section>

      {props.notes.length > 0 && (
        <aside className="modal pending-notes-modal">
          <div className="modal-header">
            <div>
              <div className="eyebrow">TU COLECCIÓN</div>
              <h2>Lista de pendientes</h2>
              <p className="modal-subtitle">
                Marca los juegos que ya agregaste para tacharlos.
              </p>
            </div>
            <span className="draft-notes-count">
              {pendingNotes.length} pendientes · {completedNotes.length} tachados
            </span>
          </div>
          <div className="modal-body pending-notes-body">
            <div className="draft-notes-list">
              {props.notes.map((note) => (
                <button
                  key={note.id}
                  className={`draft-note ${note.done ? "done" : ""}`}
                  onClick={() => props.onToggleNote(note.id)}
                  aria-pressed={note.done}
                >
                  <span className="note-check">
                    {note.done && <Check size={12} />}
                  </span>
                  <span>{note.text}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      )}
      </div>
    </div>
  );
}

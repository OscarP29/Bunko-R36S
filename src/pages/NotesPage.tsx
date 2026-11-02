import type { ComponentProps } from "react";
import {
  ChevronDown,
  ListTodo,
  Plus,
} from "lucide-react";
import { AiListOrganizer } from "../components/AiListOrganizer.tsx";
import { NoteCard } from "../components/NoteCard.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Field } from "../components/ui/Field.tsx";
import type { NotesView } from "../hooks/useNotesView.ts";
import type { FullEntry, Note, System } from "../lib/types.ts";

type NotesPageProps = {
  view: NotesView;
  notes: Note[];
  pendingNotes: number;
  systems: System[];
  fullLibrary: FullEntry[];
  loadingLibrary: boolean;
  onLoadLibrary: () => void;
  onImportAiItems: ComponentProps<typeof AiListOrganizer>["onImport"];
  onToggleNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
};

export function NotesPage({
  view,
  notes,
  pendingNotes,
  systems,
  fullLibrary,
  loadingLibrary,
  onLoadLibrary,
  onImportAiItems,
  onToggleNote,
  onDeleteNote,
}: NotesPageProps) {
  const {
    noteDraft,
    setNoteDraft,
    noteCategoryDraft,
    setNoteCategoryDraft,
    noteSystemDraft,
    setNoteSystemDraft,
    notePriorityDraft,
    setNotePriorityDraft,
    addNote,
    noteSearch,
    setNoteSearch,
    noteStatusFilter,
    setNoteStatusFilter,
    notePriorityFilter,
    setNotePriorityFilter,
    noteSystemFilter,
    setNoteSystemFilter,
    notesGroupBy,
    setNotesGroupBy,
    collapsedNoteGroups,
    setCollapsedNoteGroups,
    availableNoteSystems,
    availableNoteCategories,
    noteFiltersActive,
    clearNoteFilters,
    filteredNotes,
    notesGrouped,
  } = view;

  return (
      <div className="content notes-content">
        <section className="page-heading">
          <div>
            <div className="eyebrow">
              JUEGOS POR AÑADIR <span className="eyebrow-line" />
            </div>
            <h1>
              Lista de pendientes<span className="heading-period">.</span>
            </h1>
            <p>
              Anota los juegos que quieres añadir a tu colección en el futuro
              y márcalos cuando ya estén en la consola.
            </p>
          </div>
          <div className="note-progress">
            <span>
              {notes.filter((note) => note.done).length}/{notes.length}{" "}
              conseguidos
            </span>
            <div>
              <i
                style={{
                  width: `${
                    notes.length
                      ? (notes.filter((note) => note.done).length /
                          notes.length) *
                        100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        </section>

        <section className="notes-add" aria-labelledby="notes-add-title">
          <header className="notes-add-header">
            <h2 id="notes-add-title">Añadir un juego</h2>
            <AiListOrganizer
              systems={systems}
              fullLibrary={fullLibrary}
              loadingLibrary={loadingLibrary}
              onLoadLibrary={onLoadLibrary}
              onImport={onImportAiItems}
            />
          </header>
          <form
            className="notes-add-form"
            onSubmit={(event) => {
              event.preventDefault();
              addNote();
            }}
          >
            <Field label="Juego" wide>
              <input
                className="text-field"
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="Ej. Chrono Trigger"
              />
            </Field>
            <Field label="Categoría">
              <input
                className="text-field"
                list="note-categories"
                value={noteCategoryDraft}
                onChange={(event) => setNoteCategoryDraft(event.target.value)}
                placeholder="Ej. JRPG"
              />
              <datalist id="note-categories">
                {availableNoteCategories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </Field>
            <Field label="Consola">
              <select
                className="text-field"
                value={noteSystemDraft}
                onChange={(event) => setNoteSystemDraft(event.target.value)}
              >
                <option value="">Sin consola</option>
                {systems.map((system) => (
                  <option key={system.id} value={system.name}>
                    {system.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prioridad">
              <select
                className="text-field"
                value={notePriorityDraft}
                onChange={(event) =>
                  setNotePriorityDraft(
                    event.target.value as "" | "alta" | "media" | "baja",
                  )
                }
              >
                <option value="">Sin prioridad</option>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </Field>
            <Button variant="primary" disabled={!noteDraft.trim()}>
              <Plus size={16} /> Añadir
            </Button>
          </form>
        </section>

        <div className="notes-list-header">
          <h2>Tu lista</h2>
          {notes.length > 0 && (
            <div
              className="filter-group notes-status"
              role="group"
              aria-label="Filtrar por estado"
            >
              {(
                [
                  ["all", "Todos", notes.length],
                  ["pending", "Pendientes", pendingNotes],
                  ["done", "Conseguidos", notes.length - pendingNotes],
                ] as const
              ).map(([status, label, count]) => (
                <button
                  key={status}
                  type="button"
                  className={noteStatusFilter === status ? "filter-active" : ""}
                  aria-pressed={noteStatusFilter === status}
                  onClick={() => setNoteStatusFilter(status)}
                >
                  {label} <span>{count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {notes.length > 0 && (
          <div className="notes-toolbar">
            <Field label="Buscar" wide>
              <input
                className="text-field"
                value={noteSearch}
                onChange={(event) => setNoteSearch(event.target.value)}
                placeholder="Título, categoría, motivo..."
              />
            </Field>
            <Field label="Prioridad">
              <select
                className="text-field"
                value={notePriorityFilter}
                onChange={(event) =>
                  setNotePriorityFilter(
                    event.target.value as "all" | "alta" | "media" | "baja",
                  )
                }
              >
                <option value="all">Todas</option>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </Field>
            <Field label="Consola">
              <select
                className="text-field"
                value={noteSystemFilter}
                onChange={(event) => setNoteSystemFilter(event.target.value)}
              >
                <option value="all">Todas</option>
                {availableNoteSystems.map((system) => (
                  <option key={system} value={system}>
                    {system}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Agrupar por">
              <select
                className="text-field"
                value={notesGroupBy}
                onChange={(event) =>
                  setNotesGroupBy(event.target.value as "category" | "system")
                }
              >
                <option value="category">Categoría</option>
                <option value="system">Consola</option>
              </select>
            </Field>
          </div>
        )}

        {noteFiltersActive && (
          <div className="notes-results">
            <span>
              {filteredNotes.length} de {notes.length} juegos
            </span>
            <Button
              type="button"
              variant="text"
              onClick={clearNoteFilters}
            >
              Limpiar filtros
            </Button>
          </div>
        )}

        <div className="notes-list">
          {notes.length === 0 && (
            <div className="empty-state notes-empty">
              <div>
                <ListTodo size={20} />
              </div>
              <strong>Tu lista empieza aquí</strong>
              <span>
                Anota los juegos que quieres añadir o importa recomendaciones
                desde la IA.
              </span>
            </div>
          )}
          {filteredNotes.length === 0 && notes.length > 0 && (
            <div className="empty-state notes-empty">
              <strong>Sin resultados</strong>
              <span>Prueba otros filtros o limpia la búsqueda.</span>
            </div>
          )}
          {notesGrouped.map(([group, groupNotes]) => {
            const isOpen = !collapsedNoteGroups.has(group);
            return (
              <section className="notes-group" key={group}>
                <button
                  type="button"
                  className="notes-group-header"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setCollapsedNoteGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(group)) next.delete(group);
                      else next.add(group);
                      return next;
                    })
                  }
                >
                  <ChevronDown
                    size={16}
                    className={isOpen ? "" : "collapsed"}
                  />
                  <strong>{group}</strong>
                  <span>{groupNotes.length}</span>
                </button>
                {isOpen && (
                  <div className="notes-group-items">
                    {groupNotes.map((note) => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        groupBy={notesGroupBy}
                        onToggle={() => onToggleNote(note.id)}
                        onDelete={() => onDeleteNote(note.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
  );
}

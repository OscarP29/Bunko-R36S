import { useMemo, useState } from "react";
import { DEFAULT_NOTE_CATEGORIES, noteSystem } from "../lib/notes.ts";
import type { Note } from "../lib/types.ts";

const priorityWeight = (p?: string) =>
  p === "alta" ? 0 : p === "media" ? 1 : p === "baja" ? 2 : 3;

/** Formulario y filtros de pendientes; viven fuera de la página para sobrevivir al cambio de pestaña. */
export function useNotesView(notes: Note[], onAddNote: (note: Note) => void) {
  const [noteDraft, setNoteDraft] = useState("");
  const [noteCategoryDraft, setNoteCategoryDraft] = useState("");
  const [noteSystemDraft, setNoteSystemDraft] = useState("");
  const [notePriorityDraft, setNotePriorityDraft] = useState<
    "" | "alta" | "media" | "baja"
  >("");
  const [noteSearch, setNoteSearch] = useState("");
  const [noteStatusFilter, setNoteStatusFilter] = useState<
    "all" | "pending" | "done"
  >("all");
  const [notePriorityFilter, setNotePriorityFilter] = useState<
    "all" | "alta" | "media" | "baja"
  >("all");
  const [noteSystemFilter, setNoteSystemFilter] = useState("all");
  const [notesGroupBy, setNotesGroupBy] = useState<"category" | "system">(
    "category",
  );
  const [collapsedNoteGroups, setCollapsedNoteGroups] = useState<Set<string>>(
    new Set(),
  );

  function addNote() {
    let text = noteDraft.trim();
    if (!text) return;
    const category = noteCategoryDraft.trim();
    const system = noteSystemDraft.trim();
    if (category) text = `[${category}] ${text}`;
    if (system) text = `${text} (${system})`;
    onAddNote({
      id: crypto.randomUUID(),
      text,
      title: noteDraft.trim(),
      done: false,
      category: category || undefined,
      system: system || undefined,
      priority: notePriorityDraft || undefined,
    });
    setNoteDraft("");
    setNoteCategoryDraft("");
    setNoteSystemDraft("");
    setNotePriorityDraft("");
  }

  function clearNoteFilters() {
    setNoteSearch("");
    setNotePriorityFilter("all");
    setNoteSystemFilter("all");
    setNoteStatusFilter("all");
  }

  const availableNoteSystems = useMemo(() => {
    const set = new Set<string>();
    for (const note of notes) {
      const system = noteSystem(note);
      if (system) set.add(system);
    }
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" }),
    );
  }, [notes]);

  const availableNoteCategories = useMemo(
    () =>
      Array.from(
        new Set([
          ...DEFAULT_NOTE_CATEGORIES,
          ...notes.flatMap((note) => (note.category ? [note.category] : [])),
        ]),
      ).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })),
    [notes],
  );

  const noteFiltersActive =
    noteSearch.trim() !== "" ||
    notePriorityFilter !== "all" ||
    noteSystemFilter !== "all" ||
    noteStatusFilter !== "all";

  const filteredNotes = useMemo(() => {
    const query = noteSearch.trim().toLowerCase();
    return notes.filter((note) => {
      if (noteStatusFilter === "pending" && note.done) return false;
      if (noteStatusFilter === "done" && !note.done) return false;
      if (notePriorityFilter !== "all" && note.priority !== notePriorityFilter)
        return false;
      if (noteSystemFilter !== "all") {
        const system = noteSystem(note);
        if (system !== noteSystemFilter) return false;
      }
      if (query) {
        const haystack = [
          note.text,
          note.category,
          note.system,
          note.reason,
          note.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [
    notes,
    noteStatusFilter,
    notePriorityFilter,
    noteSystemFilter,
    noteSearch,
  ]);

  const notesGrouped = useMemo(() => {
    const groups = new Map<string, Note[]>();
    for (const note of filteredNotes) {
      const key =
        notesGroupBy === "category"
          ? note.category || "Sin categoría"
          : note.system ||
            note.text.match(/\\(([^)]+)\\)\\s*$/)?.[1]?.trim() ||
            "Sin consola";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(note);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const pa = priorityWeight(a.priority);
        const pb = priorityWeight(b.priority);
        if (pa !== pb) return pa - pb;
        return a.text.localeCompare(b.text, "es", { sensitivity: "base" });
      });
    }
    return Array.from(groups.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], "es", { sensitivity: "base" }),
    );
  }, [filteredNotes, notesGroupBy]);

  return {
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
  };
}

export type NotesView = ReturnType<typeof useNotesView>;

import { useEffect, useRef, useState } from "react";

import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { CheckCircle2 } from "lucide-react";
import { AddGameModal } from "./components/AddGameModal.tsx";
import { ArtworkModal } from "./components/ArtworkModal.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Topbar } from "./components/Topbar.tsx";
import { useArtworkSearch } from "./hooks/useArtworkSearch.ts";
import { useLibraryView } from "./hooks/useLibraryView.ts";
import { useNotesView } from "./hooks/useNotesView.ts";
import { useSettings } from "./hooks/useSettings.ts";
import {
  addGames,
  listGames,
  openFolder,
  readNotes,
  removeGame,
  saveImage,
  scanSd,
  unmountSd,
  writeNotes,
} from "./lib/backend.ts";
import { cleanTitle, systemFolder } from "./lib/rom.ts";
import type {
  FullEntry,
  Game,
  NewGameDraft,
  Note,
  System,
  Tab,
} from "./lib/types.ts";
import { LibraryPage } from "./pages/LibraryPage.tsx";
import { NotesPage } from "./pages/NotesPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";

const ROOT_KEY = "r36s-manager-root";
const NOTES_KEY = "r36s-manager-notes";
function App() {
  const [root, setRoot] = useState(() => localStorage.getItem(ROOT_KEY) || "");
  const [systems, setSystems] = useState<System[]>([]);
  const [selected, setSelected] = useState<System | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("library");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"add" | "image" | null>(null);
  const [targetGame, setTargetGame] = useState<Game | null>(null);
  const [drafts, setDrafts] = useState<NewGameDraft[]>([]);
  const [fullLibrary, setFullLibrary] = useState<FullEntry[]>([]);
  const [loadingFullLibrary, setLoadingFullLibrary] = useState(false);
  const [ejecting, setEjecting] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  /** Raíz cuyas notas están cargadas: evita copiar la libreta a otra tarjeta. */
  const notesRoot = useRef("");
  const libraryView = useLibraryView(games);
  const notesView = useNotesView(notes, addNote);
  const settings = useSettings();
  const artwork = useArtworkSearch({
    selected,
    games,
    onError: setError,
    onBatchFinished: async (system) => {
      await selectSystem(system);
      setSystems(await scanSd(root));
    },
  });
  const skipNotesReload = useRef(false);

  useEffect(() => {
    if (!notesLoaded || notesRoot.current !== root) return;
    if (isTauri() && !root) return;
    const payload = JSON.stringify(notes);
    if (isTauri() && root) {
      writeNotes(payload).catch(() => localStorage.setItem(NOTES_KEY, payload));
    } else {
      localStorage.setItem(NOTES_KEY, payload);
    }
  }, [notes, notesLoaded, root]);

  useEffect(() => {
    if (!root) return;
    void scan(root);
    // Escaneo inicial con la raíz recordada; no debe repetirse en cada render.
  }, []);

  useEffect(() => {
    if (skipNotesReload.current) {
      skipNotesReload.current = false;
      return;
    }
    setNotesLoaded(false);
    notesRoot.current = root;
    const localNotes = () => {
      try {
        setNotes(JSON.parse(localStorage.getItem(NOTES_KEY) || "[]"));
      } catch {
        setNotes([]);
      }
    };
    if (!isTauri() || !root) {
      localNotes();
      setNotesLoaded(true);
      return;
    }
    readNotes()
      .then((value) => {
        if (value) setNotes(JSON.parse(value));
        else localNotes();
        setNotesLoaded(true);
      })
      .catch(() => setNotesLoaded(true));
  }, [root]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function scan(path = root) {
    if (!path) return;
    setLoading(true);
    setError("");
    try {
      const result = await scanSd(path);
      setRoot(path);
      localStorage.setItem(ROOT_KEY, path);
      setSystems(result);
      const keep =
        result.find((system) => system.id === selected?.id) ||
        result[0] ||
        null;
      setSelected(keep);
      setGames(keep ? await listGames(keep.path) : []);
      if (!result.length) {
        setError(
          "No encontré carpetas con filelist.csv en este nivel. Prueba con la carpeta ROMS de la tarjeta.",
        );
      }
    } catch (e) {
      setError(String(e));
      setSystems([]);
      setGames([]);
    } finally {
      setLoading(false);
    }
  }

  async function selectSystem(system: System) {
    setSelected(system);
    libraryView.resetFilters();
    try {
      setGames(await listGames(system.path));
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function chooseRoot() {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Selecciona la carpeta ROMS de la microSD",
    });
    if (typeof picked === "string") await scan(picked);
  }

  async function ejectSd() {
    if (!root || ejecting) return;
    if (
      !confirm(
        "¿Quieres dejar de usar la tarjeta microSD? Se detendrán las operaciones, se liberará el acceso y podrás retirarla con seguridad. Las notas se guardarán antes de desconectar.",
      )
    ) {
      return;
    }
    setEjecting(true);
    setError("");
    artwork.cancelBatch();
    try {
      if (notesLoaded && notesRoot.current === root) {
        try {
          await writeNotes(JSON.stringify(notes));
        } catch {
          // Si falla, ya hay fallback a localStorage.
        }
      }
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await unmountSd();
          lastError = null;
          break;
        } catch (e) {
          lastError = e;
          if (!String(e).includes("operación en curso")) break;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      if (lastError) throw lastError;

      skipNotesReload.current = true;
      setRoot("");
      localStorage.removeItem(ROOT_KEY);
      setSystems([]);
      setSelected(null);
      setGames([]);
      setDrafts([]);
      libraryView.resetFilters();
      artwork.clearBatchProgress();
      setNotice("Tarjeta liberada. Ya puedes extraerla con seguridad.");
    } catch (e) {
      setError(`No se pudo liberar la tarjeta: ${String(e)}`);
    } finally {
      setEjecting(false);
    }
  }

  async function openSdFolder(path = root) {
    if (!path) return;
    try {
      if (isTauri()) await openFolder(path);
      else window.open(`file:///${path.replace(/\\/g, "/")}`, "_blank");
    } catch (e) {
      setError(`No se pudo abrir la carpeta: ${String(e)}`);
    }
  }

  function openAdd() {
    setTargetGame(null);
    setDrafts([]);
    artwork.resetArtwork();
    setModal("add");
  }

  async function chooseRoms() {
    const picked = await open({
      multiple: true,
      title: "Selecciona uno o varios archivos de juego",
    });
    const paths = Array.isArray(picked)
      ? picked
      : picked
        ? [picked]
        : [];
    const newDrafts: NewGameDraft[] = [];
    for (const path of paths) {
      if (typeof path !== "string") continue;
      const file = path.split(/[\\/]/).pop() || "";
      if (!file) continue;
      newDrafts.push({
        id: crypto.randomUUID(),
        romPath: path,
        fileName: file,
        title: cleanTitle(file),
        imageBytes: null,
        imagePreview: "",
        imageStatus: "idle",
        searching: false,
        error: "",
      });
    }
    if (newDrafts.length) {
      setDrafts((current) => [...current, ...newDrafts]);
    }
  }

  function updateDraft(id: string, patch: Partial<NewGameDraft>) {
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)),
    );
  }

  function removeDraft(id: string) {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  }

  function clearDraftImage(id: string) {
    updateDraft(id, {
      imageBytes: null,
      imagePreview: "",
      imageStatus: "idle",
      error: "",
    });
  }

  async function setDraftImage(id: string, file: File) {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    updateDraft(id, {
      imageBytes: bytes,
      imagePreview: URL.createObjectURL(file),
      imageStatus: "idle",
      error: "",
    });
  }

  function searchDraftCover(id: string) {
    const draft = drafts.find((item) => item.id === id);
    if (draft)
      void artwork.searchDraftCover(draft, (patch) => updateDraft(id, patch));
  }

  async function saveNewGames() {
    if (!selected || !drafts.length) return;
    const valid = drafts.filter((draft) => draft.romPath);
    if (!valid.length) return;
    setLoading(true);
    try {
      const result = await addGames(
        selected.path,
        valid.map((draft) => ({
          sourcePath: draft.romPath,
          title: draft.title,
          imageBytes: draft.imageBytes,
        })),
      );
      setModal(null);
      setDrafts([]);
      setNotice(`${result.length} juego(s) añadido(s) a ${selected.name}`);
      await scan(root);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveGameImage() {
    if (!selected || !targetGame || !artwork.imageBytes) return;
    setLoading(true);
    try {
      // Si la carátula vino de la búsqueda ya se guardó al previsualizarla.
      if (artwork.imageStatus !== "found") {
        await saveImage(selected.path, targetGame.fileName, artwork.imageBytes);
      }
      setModal(null);
      setNotice("Carátula guardada en 512 × 512 px");
      await selectSystem(selected);
      setSystems(await scanSd(root));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function removeGameFromCatalog(game: Game) {
    if (!selected) return;
    if (
      !confirm(
        `¿Quitar “${game.title}” del catálogo? El archivo de juego se conservará.`,
      )
    )
      return;
    try {
      await removeGame(selected.path, game.fileName);
      setGames(await listGames(selected.path));
      setSystems(await scanSd(root));
      setNotice("Juego quitado del catálogo");
    } catch (e) {
      setError(String(e));
    }
  }

  function startImage(game: Game) {
    setTargetGame(game);
    artwork.resetArtwork();
    artwork.clearNoCover(game.fileName);
    setModal("image");
  }

  async function loadFullLibrary() {
    if (!systems.length) {
      setError("Carga primero la microSD para ver los sistemas");
      return;
    }
    setLoadingFullLibrary(true);
    setError("");
    try {
      const entries: FullEntry[] = [];
      for (const system of systems) {
        const games = await listGames(system.path);
        const folder = systemFolder(system);
        for (const game of games) {
          entries.push({
            ...game,
            systemName: system.name,
            systemPath: system.path,
            systemFolder: folder,
          });
        }
      }
      setFullLibrary(entries);
      setNotice(`Biblioteca completa cargada: ${entries.length} juegos`);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingFullLibrary(false);
    }
  }

  function importAiItems(
    items: {
      text: string;
      category?: string;
      system?: string;
      folder?: string;
      priority?: "alta" | "media" | "baja";
      reason?: string;
      notes?: string;
      suggestedFileName?: string;
    }[],
  ) {
    if (!items.length) return;
    const existing = new Set(notes.map((note) => note.text.trim().toLowerCase()));
    const toAdd = items
      .filter((item) => !existing.has(item.text.trim().toLowerCase()))
      .map((item) => {
        const base = item.text.replace(/^\[[^\]]*\]\s*/, "").split(" — ")[0].replace(/\s*\([^)]*\)\s*$/, "").trim();
        return {
          id: crypto.randomUUID(),
          text: item.text.trim(),
          title: base,
          done: false,
          category: item.category,
          system: item.system,
          folder: item.folder,
          priority: item.priority,
          reason: item.reason,
          notes: item.notes,
          suggestedFileName: item.suggestedFileName,
        };
      });
    if (!toAdd.length) {
      setNotice("Todos esos juegos ya están en la lista");
      return;
    }
    setNotes((prev) => [...toAdd, ...prev]);
    setNotesLoaded(true);
    setNotice(`Añadidos ${toAdd.length} juegos desde IA`);
  }

  function addNote(note: Note) {
    setNotes((items) => [note, ...items]);
    setNotesLoaded(true);
  }

  function toggleNote(id: string) {
    setNotes((items) =>
      items.map((note) =>
        note.id === id ? { ...note, done: !note.done } : note,
      ),
    );
    setNotesLoaded(true);
  }

  function deleteNote(id: string) {
    setNotes((items) => items.filter((note) => note.id !== id));
    setNotesLoaded(true);
  }

  function handleGlobalKeys(event: React.KeyboardEvent<HTMLDivElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      document.querySelector<HTMLInputElement>(".search-box input")?.focus();
    }
    if (event.key === "Escape" && modal) setModal(null);
  }

  const totalGames = systems.reduce(
    (total, system) => total + system.gameCount,
    0,
  );
  const pendingNotes = notes.filter((note) => !note.done).length;

  return (
    <div className="app-shell" onKeyDown={handleGlobalKeys} tabIndex={-1}>
      <Sidebar
        activeTab={activeTab}
        root={root}
        systems={systems}
        selected={selected}
        totalGames={totalGames}
        pendingNotes={pendingNotes}
        ejecting={ejecting}
        onTabChange={setActiveTab}
        onSelectSystem={(system) => void selectSystem(system)}
        onOpenFolder={openSdFolder}
        onEject={ejectSd}
        onChooseRoot={chooseRoot}
      />

      <main className="main-area">
        <Topbar
          activeTab={activeTab}
          systemName={selected?.name}
          root={root}
          loading={loading}
          ejecting={ejecting}
          onRescan={() => scan()}
          onEject={ejectSd}
        />

        {activeTab === "library" && (
          <LibraryPage
            view={libraryView}
            root={root}
            systems={systems}
            selected={selected}
            totalGames={totalGames}
            error={error}
            batchProgress={artwork.batchProgress}
            markedNoCover={artwork.markedNoCover}
            onChooseRoot={chooseRoot}
            onOpenFolder={openSdFolder}
            onAddGame={openAdd}
            onDismissError={() => setError("")}
            onSearchMissingCovers={artwork.searchMissingCovers}
            onChangeImage={startImage}
            onRemoveGame={removeGameFromCatalog}
          />
        )}
        {activeTab === "settings" && <SettingsPage {...settings} />}
        {activeTab === "notes" && (
          <NotesPage
            view={notesView}
            notes={notes}
            pendingNotes={pendingNotes}
            systems={systems}
            fullLibrary={fullLibrary}
            loadingLibrary={loadingFullLibrary}
            onLoadLibrary={loadFullLibrary}
            onImportAiItems={importAiItems}
            onToggleNote={toggleNote}
            onDeleteNote={deleteNote}
          />
        )}
      </main>

      {modal === "add" && (
        <AddGameModal
          systemName={selected?.name ?? ""}
          drafts={drafts}
          notes={notes}
          loading={loading}
          onClose={() => {
            setModal(null);
            setDrafts([]);
          }}
          onChooseRoms={chooseRoms}
          onRemoveDraft={removeDraft}
          onDraftTitleChange={(id, value) => updateDraft(id, { title: value })}
          onDraftSearch={searchDraftCover}
          onDraftSearchAll={() =>
            void artwork.searchAllDraftCovers(drafts, updateDraft)
          }
          onDraftSelectImage={setDraftImage}
          onDraftClearImage={clearDraftImage}
          onToggleNote={toggleNote}
          onSave={saveNewGames}
        />
      )}

      {modal === "image" && (
        <ArtworkModal
          game={targetGame}
          imagePreview={artwork.imagePreview}
          imageStatus={artwork.imageStatus}
          imageBytes={artwork.imageBytes}
          progress={artwork.artworkProgress}
          warning={artwork.artworkWarning}
          matches={artwork.artworkMatches}
          loading={loading}
          onClose={() => setModal(null)}
          onSearch={() => {
            if (targetGame)
              void artwork.searchArtwork(targetGame.title, targetGame.fileName);
          }}
          onChooseMatch={(match) => {
            if (targetGame) void artwork.chooseArtwork(match, targetGame.fileName);
          }}
          onSelectImage={artwork.selectImage}
          onSave={saveGameImage}
          onMarkNoCover={() => artwork.markNoCover(targetGame?.fileName)}
        />
      )}

      {notice && (
        <div className="toast">
          <CheckCircle2 size={16} />
          {notice}
        </div>
      )}
    </div>
  );
}

export default App;

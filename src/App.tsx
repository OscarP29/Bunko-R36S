import { useEffect, useRef, useState } from "react";

import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { CheckCircle2 } from "lucide-react";
import { AddGameModal } from "./components/AddGameModal.tsx";
import { ArtworkModal } from "./components/ArtworkModal.tsx";
import { CommandPalette } from "./components/CommandPalette.tsx";
import { EditGameModal } from "./components/EditGameModal.tsx";
import { OrganizeModal } from "./components/OrganizeModal.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Topbar } from "./components/Topbar.tsx";
import { useArtworkSearch } from "./hooks/useArtworkSearch.ts";
import { useLibraryView } from "./hooks/useLibraryView.ts";
import { useNotesView } from "./hooks/useNotesView.ts";
import { useSagas } from "./hooks/useSagas.ts";
import { useSettings } from "./hooks/useSettings.ts";
import { useShortcuts } from "./hooks/useShortcuts.ts";
import {
  addGames,
  getDiskSpace,
  listGames,
  openFolder,
  readNotes,
  removeGame,
  renameGame,
  reorderGames,
  saveImage,
  scanSd,
  unmountSd,
  writeNotes,
  type DiskSpace,
} from "./lib/backend.ts";
import type { Command } from "./lib/commands.ts";
import { archiveAdvice, cleanTitle, systemFolder } from "./lib/rom.ts";
import { flattenOrder, sagaOf, type GameGroup } from "./lib/sagas.ts";
import { stepFontScale } from "./lib/settings.ts";
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
  // Con una raíz recordada el escaneo arranca al montar: evita mostrar "sin sistemas".
  const [loading, setLoading] = useState(() =>
    Boolean(localStorage.getItem(ROOT_KEY)),
  );
  const [loadingGames, setLoadingGames] = useState(false);
  /** Raíz ya registrada en Rust: antes de eso `read_notes` fallaría. */
  const [scannedRoot, setScannedRoot] = useState("");
  const [diskSpace, setDiskSpace] = useState<DiskSpace | null>(null);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"add" | "image" | "edit" | "organize" | null>(null);
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
  /** Cola de escrituras: los comandos son concurrentes y las notas deben guardarse en orden. */
  const notesWrites = useRef<Promise<void>>(Promise.resolve());
  const libraryView = useLibraryView(games);
  const sagas = useSagas(root, scannedRoot);
  const sagaOverrides = sagas.overridesFor(selected ? systemFolder(selected) : "");
  const notesView = useNotesView(notes, addNote);
  const settings = useSettings();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const artwork = useArtworkSearch({
    selected,
    games,
    onError: setError,
    onBatchFinished: async (system, found, total) => {
      setNotice(
        found
          ? `${found} de ${total} carátulas encontradas`
          : "No se encontró ninguna carátula",
      );
      await reloadGames(system);
      setSystems(await scanSd(root));
    },
  });
  const skipNotesReload = useRef(false);

  useEffect(() => {
    if (!notesLoaded || notesRoot.current !== root) return;
    if (isTauri() && !root) return;
    const payload = JSON.stringify(notes);
    if (isTauri() && root) {
      saveNotes(payload).catch(() => localStorage.setItem(NOTES_KEY, payload));
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
    if (scannedRoot !== root) return;
    readNotes()
      .then((value) => {
        if (value) setNotes(JSON.parse(value));
        else localNotes();
        setNotesLoaded(true);
      })
      .catch(() => setNotesLoaded(true));
  }, [root, scannedRoot]);

  // Cada cambio en la tarjeta acaba reescaneando `systems`: es el momento de releerlo.
  useEffect(() => {
    if (!isTauri() || !root || scannedRoot !== root) {
      setDiskSpace(null);
      return;
    }
    let current = true;
    getDiskSpace()
      .then((space) => current && setDiskSpace(space))
      .catch(() => current && setDiskSpace(null));
    return () => {
      current = false;
    };
  }, [root, scannedRoot, systems]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  function saveNotes(payload: string) {
    const write = notesWrites.current
      .catch(() => {})
      .then(() => writeNotes(payload));
    notesWrites.current = write;
    return write;
  }

  async function scan(path = root) {
    if (!path) return;
    setLoading(true);
    setError("");
    try {
      const result = await scanSd(path);
      setScannedRoot(path);
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
          "No hay carpetas con filelist.csv aquí. Elige la carpeta ROMS de la tarjeta.",
        );
      }
    } catch (e) {
      setError(String(e));
      setScannedRoot(path);
      setSystems([]);
      setGames([]);
    } finally {
      setLoading(false);
    }
  }

  async function selectSystem(system: System) {
    setSelected(system);
    libraryView.resetFilters();
    setLoadingGames(system.id !== selected?.id);
    try {
      await reloadGames(system);
    } finally {
      setLoadingGames(false);
    }
  }

  /** Vuelve a leer los juegos sin tocar la búsqueda ni el filtro activos. */
  async function reloadGames(system: System) {
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
          await saveNotes(JSON.stringify(notes));
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
      const archive = selected
        ? archiveAdvice(file, systemFolder(selected))
        : null;
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
        archive,
        extract: archive !== null && settings.settings.autoExtract,
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
          extract: draft.extract,
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
      await reloadGames(selected);
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

  function startEdit(game: Game) {
    setTargetGame(game);
    setModal("edit");
  }

  async function saveGameEdit(title: string, saga: string | undefined) {
    if (!selected || !targetGame) return;
    setLoading(true);
    try {
      if (title !== targetGame.title) {
        await renameGame(selected.path, targetGame.fileName, title);
      }
      await sagas.setSaga(systemFolder(selected), targetGame.fileName, saga);
      setModal(null);
      setNotice("Juego actualizado");
      await reloadGames(selected);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function applyOrganization(groups: GameGroup<Game>[]) {
    if (!selected) return;
    setLoading(true);
    try {
      await reorderGames(selected.path, flattenOrder(groups));
      setModal(null);
      libraryView.setSortBy("console");
      setNotice("Orden aplicado a la consola");
      await reloadGames(selected);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
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

  function clearNotes() {
    if (
      !confirm(
        `¿Borrar los ${notes.length} juegos de la lista de pendientes? Esta acción no se puede deshacer.`,
      )
    )
      return;
    setNotes([]);
    setNotesLoaded(true);
    setNotice("Lista de pendientes vaciada");
  }

  function handleGlobalKeys(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && modal) setModal(null);
  }

  function focusPageSearch() {
    const selector = ".search-box input, .notes-toolbar input";
    const input = document.querySelector<HTMLInputElement>(selector);
    if (input) return input.focus();
    setActiveTab("library");
    requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>(selector)?.focus(),
    );
  }

  const openLibrary = (run: () => void) => () => {
    setActiveTab("library");
    run();
  };

  const commands: Command[] = [
    { id: "go-library", group: "Ir a", label: "Biblioteca", shortcut: "Ctrl+1", run: () => setActiveTab("library") },
    { id: "go-notes", group: "Ir a", label: "Lista de pendientes", shortcut: "Ctrl+2", run: () => setActiveTab("notes") },
    { id: "go-settings", group: "Ir a", label: "Configuración", keywords: "ajustes opciones", shortcut: "Ctrl+3", run: () => setActiveTab("settings") },
    { id: "search", group: "Acciones", label: "Buscar en la página", shortcut: "Ctrl+F", run: focusPageSearch },
    ...(selected
      ? [
          { id: "add-game", group: "Acciones", label: "Añadir juegos", keywords: "rom nuevo", shortcut: "Ctrl+N", run: openLibrary(openAdd) },
          { id: "organize", group: "Acciones", label: "Organizar juegos en la consola", keywords: "ordenar alfabetico sagas orden", run: openLibrary(() => setModal("organize")) },
          { id: "missing-covers", group: "Acciones", label: "Buscar carátulas faltantes", keywords: "portadas imagenes", run: openLibrary(artwork.searchMissingCovers) },
          { id: "open-system", group: "Acciones", label: `Abrir carpeta de ${selected.name}`, keywords: "explorador emulador", run: () => void openSdFolder(selected.path) },
        ]
      : []),
    ...(notes.length
      ? [{ id: "clear-notes", group: "Acciones", label: "Vaciar lista de pendientes", keywords: "borrar eliminar todo", run: clearNotes }]
      : []),
    ...(root
      ? [
          { id: "rescan", group: "Tarjeta", label: "Volver a escanear", keywords: "recargar actualizar", shortcut: "Ctrl+R", run: () => void scan() },
          { id: "open-sd", group: "Tarjeta", label: "Abrir carpeta de la SD", keywords: "explorador microsd", run: () => void openSdFolder(root) },
          { id: "eject", group: "Tarjeta", label: "Expulsar microSD", keywords: "sacar desconectar", run: () => void ejectSd() },
        ]
      : []),
    { id: "choose-root", group: "Tarjeta", label: root ? "Cambiar tarjeta SD" : "Elegir carpeta ROMS", keywords: "microsd", run: () => void chooseRoot() },
    { id: "theme-light", group: "Tema", label: "Tema claro", run: () => settings.updateSettings({ theme: "light" }) },
    { id: "theme-dark", group: "Tema", label: "Tema oscuro", run: () => settings.updateSettings({ theme: "dark" }) },
    { id: "theme-system", group: "Tema", label: "Tema del sistema", run: () => settings.updateSettings({ theme: "system" }) },
    { id: "auto-extract", group: "Juegos", label: settings.settings.autoExtract ? "Preguntar antes de extraer comprimidos" : "Extraer siempre los comprimidos", keywords: "zip 7z descomprimir rom", run: () => settings.updateSettings({ autoExtract: !settings.settings.autoExtract }) },
    { id: "font-up", group: "Letra", label: "Aumentar letra", keywords: "tamaño fuente", shortcut: "Ctrl+Plus", run: () => settings.updateSettings({ fontScale: stepFontScale(settings.settings.fontScale, 1) }) },
    { id: "font-down", group: "Letra", label: "Reducir letra", keywords: "tamaño fuente", shortcut: "Ctrl+Minus", run: () => settings.updateSettings({ fontScale: stepFontScale(settings.settings.fontScale, -1) }) },
    ...systems.map((system) => ({
      id: `system-${system.id}`,
      group: "Sistemas",
      label: system.name,
      keywords: "emulador consola",
      run: openLibrary(() => void selectSystem(system)),
    })),
    ...games.map((game) => ({
      id: `game-${game.id}`,
      group: "Carátula",
      label: game.title,
      keywords: game.fileName,
      run: openLibrary(() => startImage(game)),
    })),
  ];

  useShortcuts(commands, () => setPaletteOpen((open) => !open));

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
        scanning={loading}
        diskSpace={diskSpace}
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
          onOpenCommands={() => setPaletteOpen(true)}
        />

        {activeTab === "library" && (
          <LibraryPage
            view={libraryView}
            root={root}
            systems={systems}
            selected={selected}
            totalGames={totalGames}
            error={error}
            loadingSystems={loading && !systems.length}
            loadingGames={loadingGames}
            batchProgress={artwork.batchProgress}
            markedNoCover={artwork.markedNoCover}
            onChooseRoot={chooseRoot}
            onOpenFolder={openSdFolder}
            onAddGame={openAdd}
            onDismissError={() => setError("")}
            onSearchMissingCovers={artwork.searchMissingCovers}
            onChangeImage={startImage}
            onEditGame={startEdit}
            onOrganize={() => setModal("organize")}
            onRemoveGame={removeGameFromCatalog}
          />
        )}
        {activeTab === "settings" && (
          <SettingsPage {...settings} commands={commands} />
        )}
        {activeTab === "notes" && (
          <NotesPage
            view={notesView}
            notes={notes}
            loading={!notesLoaded}
            pendingNotes={pendingNotes}
            systems={systems}
            fullLibrary={fullLibrary}
            loadingLibrary={loadingFullLibrary}
            onLoadLibrary={loadFullLibrary}
            onImportAiItems={importAiItems}
            onToggleNote={toggleNote}
            onDeleteNote={deleteNote}
            onClearNotes={clearNotes}
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
          onDraftExtractChange={(id, extract) => updateDraft(id, { extract })}
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

      {modal === "edit" && targetGame && (
        <EditGameModal
          game={targetGame}
          saga={sagaOverrides[targetGame.fileName]}
          knownSagas={Array.from(
            new Set(games.map((game) => sagaOf(game, sagaOverrides)).filter((s): s is string => Boolean(s))),
          ).sort((a, b) => a.localeCompare(b, "es"))}
          saving={loading}
          onClose={() => setModal(null)}
          onSave={saveGameEdit}
        />
      )}

      {modal === "organize" && selected && (
        <OrganizeModal
          systemName={selected.name}
          games={games}
          overrides={sagaOverrides}
          saving={loading}
          onClose={() => setModal(null)}
          onApply={applyOrganization}
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

      {paletteOpen && (
        <CommandPalette
          commands={commands}
          onClose={() => setPaletteOpen(false)}
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

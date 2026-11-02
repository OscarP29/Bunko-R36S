import { useEffect, useMemo, useRef, useState } from "react";

import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertCircle,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Disc3,
  ExternalLink,
  FolderOpen,
  Gamepad2,
  HardDrive,
  Image as ImageIcon,
  LayoutGrid,
  ListTodo,
  LogOut,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { AddGameModal } from "./components/AddGameModal.tsx";
import { AiListOrganizer } from "./components/AiListOrganizer.tsx";
import { ArtworkModal } from "./components/ArtworkModal.tsx";
import { GameCard } from "./components/GameCard.tsx";
import { NoteCard } from "./components/NoteCard.tsx";
import { findAlias } from "./lib/aliases.ts";
import {
  ARTWORK_CATEGORIES,
  ARTWORK_TTL,
  categoryOfPath,
  dedupeMatches,
  githubRepoName,
  parseGithubTree,
  parseLibretroListing,
  pickAutomaticMatch,
  pickConfidentMatch,
  rankArtworkMatches,
  type ArtworkCategory,
} from "./lib/artwork.ts";
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
import { formatSize } from "./lib/format.ts";
import { webFetch } from "./lib/http.ts";
import {
  cleanRomName,
  cleanTitle,
  guessLibretroSystem,
  makeArtworkUrl,
  stem,
} from "./lib/rom.ts";
import {
  readCachedJson,
  readLocalJson,
  writeCachedJson,
  writeLocalJson,
} from "./lib/store.ts";
import type {
  ArtworkEntry,
  ArtworkIndex,
  ArtworkMatch,
  Filter,
  FullEntry,
  Game,
  ImageStatus,
  NewGameDraft,
  Note,
  SortBy,
  System,
  Tab,
  ViewMode,
} from "./lib/types.ts";

const ROOT_KEY = "r36s-manager-root";
const NOTES_KEY = "r36s-manager-notes";
const ARTWORK_CACHE_PREFIX = "r36s-artwork-index:";
const ARTWORK_CHOICE_PREFIX = "r36s-artwork-choice:";

const systemFolder = (system: System) => system.path.split(/[\\/]/).pop() || "";
const choiceKey = (libretroSystem: string, fileName: string) =>
  `${ARTWORK_CHOICE_PREFIX}${libretroSystem}:${cleanRomName(fileName)}`;

function App() {
  const [root, setRoot] = useState(() => localStorage.getItem(ROOT_KEY) || "");
  const [systems, setSystems] = useState<System[]>([]);
  const [selected, setSelected] = useState<System | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("library");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"add" | "image" | null>(null);
  const [targetGame, setTargetGame] = useState<Game | null>(null);
  const [drafts, setDrafts] = useState<NewGameDraft[]>([]);
  const [fullLibrary, setFullLibrary] = useState<FullEntry[]>([]);
  const [loadingFullLibrary, setLoadingFullLibrary] = useState(false);
  const [imageBytes, setImageBytes] = useState<number[] | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageStatus, setImageStatus] = useState<ImageStatus>("idle");
  const [artworkMatches, setArtworkMatches] = useState<ArtworkMatch[]>([]);
  const [artworkProgress, setArtworkProgress] = useState("");
  const [artworkWarning, setArtworkWarning] = useState("");
  const [markedNoCover, setMarkedNoCover] = useState<string[]>([]);
  const [batchProgress, setBatchProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [ejecting, setEjecting] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [hideCompletedNotes, setHideCompletedNotes] = useState(false);
  const [noteSearch, setNoteSearch] = useState("");
  const [notePriorityFilter, setNotePriorityFilter] = useState<
    "all" | "alta" | "media" | "baja"
  >("all");
  const [noteSystemFilter, setNoteSystemFilter] = useState("all");
  const [notesGroupBy, setNotesGroupBy] = useState<"category" | "system">(
    "category",
  );
  const [expandedNoteGroups, setExpandedNoteGroups] = useState<Set<string>>(
    new Set(),
  );
  const [noteGroupsInitialized, setNoteGroupsInitialized] = useState(false);
  const [noteCategoryDraft, setNoteCategoryDraft] = useState("");
  const [noteSystemDraft, setNoteSystemDraft] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  /** Raíz cuyas notas están cargadas: evita copiar la libreta a otra tarjeta. */
  const notesRoot = useRef("");
  const batchCancel = useRef(false);
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
    setSearch("");
    setFilter("all");
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
    batchCancel.current = true;
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
      setSearch("");
      setFilter("all");
      setBatchProgress(null);
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

  async function selectImage(file: File, options?: { preview?: string }) {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    setImageBytes(bytes);
    setImagePreview(options?.preview ?? URL.createObjectURL(file));
    setImageStatus("idle");
  }

  async function loadArtworkIndex(
    libretroSystem: string,
  ): Promise<ArtworkEntry[]> {
    const cacheKey = ARTWORK_CACHE_PREFIX + libretroSystem;
    const cached = await readCachedJson<ArtworkIndex>(cacheKey);
    if (
      cached &&
      Date.now() - cached.savedAt < ARTWORK_TTL &&
      Array.isArray(cached.files)
    ) {
      return cached.files;
    }

    const repo = githubRepoName(libretroSystem);
    const response = await webFetch(
      `https://api.github.com/repos/libretro-thumbnails/${encodeURIComponent(repo)}/git/trees/master?recursive=1`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!response.ok) {
      throw new Error(
        `GitHub respondió ${response.status} al cargar el índice de ${libretroSystem}.`,
      );
    }
    const tree = (await response.json()) as {
      truncated?: boolean;
      tree?: { path: string; type: string }[];
    };

    if (tree.truncated) {
      setArtworkWarning(
        `GitHub devolvió un índice truncado para ${libretroSystem}. Probé el listado público del servidor de thumbnails como alternativa.`,
      );
      const fallback = await webFetch(
        `https://thumbnails.libretro.com/${encodeURIComponent(libretroSystem)}/Named_Boxarts/`,
      );
      if (!fallback.ok) {
        throw new Error(
          "El índice de GitHub llegó truncado y el servidor de thumbnails no ofreció un listado alternativo. Puedes probar una búsqueda exacta.",
        );
      }
      const files = parseLibretroListing(
        await fallback.text(),
        "Named_Boxarts",
      );
      if (!files.length)
        throw new Error(
          "La alternativa pública no devolvió nombres de carátulas.",
        );
      await writeCachedJson(cacheKey, {
        savedAt: Date.now(),
        files,
      } satisfies ArtworkIndex);
      return files;
    }

    const files = parseGithubTree(tree.tree ?? []);
    if (!files.length) {
      throw new Error(
        `No encontré Named_Boxarts en el repositorio ${repo}. Revisa el nombre del sistema.`,
      );
    }
    await writeCachedJson(cacheKey, {
      savedAt: Date.now(),
      files,
    } satisfies ArtworkIndex);
    return files;
  }

  async function loadCategoryFallbacks(
    libretroSystem: string,
  ): Promise<{ category: ArtworkCategory; entries: ArtworkEntry[] }[]> {
    const result: { category: ArtworkCategory; entries: ArtworkEntry[] }[] = [];
    for (const category of ["Named_Titles", "Named_Snaps"] as const) {
      try {
        const response = await webFetch(
          `https://thumbnails.libretro.com/${encodeURIComponent(libretroSystem)}/${category}/`,
        );
        if (!response.ok) continue;
        const entries = parseLibretroListing(await response.text(), category);
        if (entries.length) result.push({ category, entries });
      } catch {
        // fallback no disponible para este sistema
      }
    }
    return result;
  }

  async function previewArtworkMatch(
    match: ArtworkMatch,
    fileName: string,
    forNewGame: boolean,
  ) {
    if (!selected) return;
    const libretroSystem = guessLibretroSystem(systemFolder(selected));
    const category = categoryOfPath(match.path);
    setImageStatus("searching");
    setArtworkProgress(`Cargando ${match.name}…`);
    const response = await webFetch(
      makeArtworkUrl(libretroSystem, category, match.name),
    );
    if (!response.ok)
      throw new Error(
        `No se pudo descargar ${match.name} (${response.status}).`,
      );
    const blob = await response.blob();
    const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
    if (!forNewGame) await saveImage(selected.path, fileName, bytes);
    setImageBytes(bytes);
    setImagePreview(URL.createObjectURL(blob));
    setImageStatus("found");
    writeLocalJson(choiceKey(libretroSystem, fileName), match);
    setArtworkProgress("");
  }

  async function searchArtwork(
    gameTitle: string,
    fileName: string,
    forNewGame: boolean,
  ) {
    setImageStatus("searching");
    setImageBytes(null);
    setImagePreview("");
    setArtworkMatches([]);
    setArtworkWarning("");
    setArtworkProgress("Preparando índice…");
    try {
      const libretroSystem = selected
        ? guessLibretroSystem(systemFolder(selected))
        : "";
      let files: ArtworkEntry[] = [];
      try {
        files = await loadArtworkIndex(libretroSystem);
      } catch (indexError) {
        setArtworkWarning(
          `${String(indexError)} Probaré las categorías públicas de carátulas, títulos y capturas.`,
        );
      }

      const original = stem(fileName);
      const queries = Array.from(
        new Set(
          [findAlias(original), gameTitle, original].filter(
            (value): value is string => Boolean(value),
          ),
        ),
      );

      let searchFiles = files.filter((item) =>
        item.path.includes("Named_Boxarts"),
      );
      let matchGroups = searchFiles.length
        ? queries.map((query) => rankArtworkMatches(searchFiles, query))
        : [];

      if (files.length && !matchGroups.some((group) => group.length)) {
        const fallbacks = files.some((item) =>
          item.path.includes("Named_Titles"),
        )
          ? (["Named_Titles", "Named_Snaps"] as const).map((category) => ({
              category,
              entries: files.filter((item) => item.path.includes(category)),
            }))
          : await loadCategoryFallbacks(libretroSystem);
        for (const fallback of fallbacks) {
          const fallbackMatches = queries.map((query) =>
            rankArtworkMatches(fallback.entries, query),
          );
          if (fallbackMatches.some((group) => group.length)) {
            matchGroups = fallbackMatches;
            searchFiles = fallback.entries;
            break;
          }
        }
      }

      let matches: ArtworkMatch[] =
        matchGroups.find((group) => group.length)?.slice() || [];

      const savedChoice = readLocalJson<ArtworkMatch>(
        choiceKey(libretroSystem, fileName),
      );
      if (savedChoice) {
        const known = searchFiles.find(
          (item) => item.path === savedChoice.path,
        );
        if (known) {
          matches = [
            { ...known, score: 0 },
            ...matches.filter((item) => item.path !== known.path),
          ];
        }
      }

      if (!matches.length) {
        // Último intento: ruta exacta, por si el nombre del archivo ya es el de Libretro.
        const exact = [original, gameTitle].filter(Boolean);
        for (const candidate of exact) {
          for (const category of ARTWORK_CATEGORIES) {
            const fileNames = files.length
              ? files
                  .filter((item) => item.path.includes(category))
                  .map((item) => item.name)
              : [candidate];
            const fallbackMatch = files.length
              ? rankArtworkMatches(
                  fileNames.map((name) => ({
                    path: `${category}/${name}.png`,
                    name,
                  })),
                  candidate,
                )[0]
              : null;
            if (files.length && !fallbackMatch) continue;
            const response = await webFetch(
              makeArtworkUrl(
                libretroSystem,
                category,
                fallbackMatch?.name || candidate,
              ),
            );
            if (!response.ok) continue;
            const blob = await response.blob();
            const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
            if (!forNewGame && selected)
              await saveImage(selected.path, fileName, bytes);
            setImageBytes(bytes);
            setImagePreview(URL.createObjectURL(blob));
            setImageStatus("found");
            setArtworkProgress("");
            return;
          }
        }
        setImageStatus("missing");
        setArtworkProgress("");
        return;
      }

      setArtworkMatches(matches);
      const automatic = pickAutomaticMatch(matches);
      if (automatic) {
        await previewArtworkMatch(automatic, fileName, forNewGame);
      } else {
        setImageStatus("idle");
        setArtworkProgress("");
      }
    } catch (e) {
      setImageStatus("missing");
      setArtworkProgress("");
      setError(String(e));
    }
  }

  function openAdd() {
    setTargetGame(null);
    setDrafts([]);
    setImageBytes(null);
    setImagePreview("");
    setImageStatus("idle");
    setArtworkMatches([]);
    setArtworkProgress("");
    setArtworkWarning("");
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

  async function searchDraftCover(id: string) {
    if (!selected) return;
    const draft = drafts.find((item) => item.id === id);
    if (!draft) return;
    updateDraft(id, { searching: true, error: "", imageStatus: "searching" });
    try {
      const libretroSystem = guessLibretroSystem(systemFolder(selected));
      let files: ArtworkEntry[] = [];
      try {
        files = await loadArtworkIndex(libretroSystem);
      } catch (indexError) {
        setArtworkWarning(String(indexError));
      }

      const original = stem(draft.fileName);
      const queries = Array.from(
        new Set(
          [
            findAlias(original),
            draft.title || cleanTitle(draft.fileName),
            original,
          ].filter((value): value is string => Boolean(value)),
        ),
      );

      let searchFiles = files.filter((item) =>
        item.path.includes("Named_Boxarts"),
      );
      let matchGroups = searchFiles.length
        ? queries.map((query) => rankArtworkMatches(searchFiles, query))
        : [];

      if (files.length && !matchGroups.some((group) => group.length)) {
        const fallbacks = files.some((item) =>
          item.path.includes("Named_Titles"),
        )
          ? (["Named_Titles", "Named_Snaps"] as const).map((category) => ({
              category,
              entries: files.filter((item) => item.path.includes(category)),
            }))
          : await loadCategoryFallbacks(libretroSystem);
        for (const fallback of fallbacks) {
          const fallbackMatches = queries.map((query) =>
            rankArtworkMatches(fallback.entries, query),
          );
          if (fallbackMatches.some((group) => group.length)) {
            matchGroups = fallbackMatches;
            searchFiles = fallback.entries;
            break;
          }
        }
      }

      let matches: ArtworkMatch[] =
        matchGroups.find((group) => group.length)?.slice() || [];

      const savedChoice = readLocalJson<ArtworkMatch>(
        choiceKey(libretroSystem, draft.fileName),
      );
      if (savedChoice) {
        const known = searchFiles.find(
          (item) => item.path === savedChoice.path,
        );
        if (known) {
          matches = [
            { ...known, score: 0 },
            ...matches.filter((item) => item.path !== known.path),
          ];
        }
      }

      if (!matches.length) {
        let found = false;
        for (const candidate of [original, draft.title].filter(Boolean)) {
          for (const category of ARTWORK_CATEGORIES) {
            const response = await webFetch(
              makeArtworkUrl(libretroSystem, category, candidate),
            );
            if (!response.ok) continue;
            const blob = await response.blob();
            const bytes = Array.from(
              new Uint8Array(await blob.arrayBuffer()),
            );
            updateDraft(id, {
              imageBytes: bytes,
              imagePreview: URL.createObjectURL(blob),
              imageStatus: "found",
              searching: false,
              error: "",
            });
            found = true;
            break;
          }
          if (found) break;
        }
        if (!found) {
          updateDraft(id, {
            searching: false,
            imageStatus: "missing",
            error: "Sin coincidencias en Libretro.",
          });
        }
        return;
      }

      const automatic = pickAutomaticMatch(matches) ?? matches[0];
      const category = categoryOfPath(automatic.path);
      const response = await webFetch(
        makeArtworkUrl(libretroSystem, category, automatic.name),
      );
      if (!response.ok)
        throw new Error(
          `No se pudo descargar ${automatic.name} (${response.status}).`,
        );
      const blob = await response.blob();
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      updateDraft(id, {
        imageBytes: bytes,
        imagePreview: URL.createObjectURL(blob),
        imageStatus: "found",
        searching: false,
        error: "",
      });
    } catch (e) {
      updateDraft(id, {
        searching: false,
        imageStatus: "missing",
        error: String(e),
      });
    }
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
    if (!selected || !targetGame || !imageBytes) return;
    setLoading(true);
    try {
      // Si la carátula vino de la búsqueda ya se guardó al previsualizarla.
      if (imageStatus !== "found") {
        await saveImage(selected.path, targetGame.fileName, imageBytes);
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

  async function chooseArtwork(match: ArtworkMatch) {
    if (!targetGame) return;
    try {
      await previewArtworkMatch(match, targetGame.fileName, false);
    } catch (e) {
      setError(String(e));
      setImageStatus("missing");
    }
  }

  function markCurrentGameNoCover() {
    if (targetGame) {
      setMarkedNoCover((items) =>
        Array.from(new Set([...items, targetGame.fileName])),
      );
    }
    setArtworkMatches([]);
    setImageBytes(null);
    setImagePreview("");
    setImageStatus("missing");
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
    setImageBytes(null);
    setImagePreview("");
    setImageStatus("idle");
    setArtworkMatches([]);
    setArtworkProgress("");
    setArtworkWarning("");
    setMarkedNoCover((items) => items.filter((item) => item !== game.fileName));
    setModal("image");
  }

  async function searchMissingCovers() {
    if (!selected) return;
    batchCancel.current = false;
    const missing = games.filter(
      (game) => !game.hasImage && !markedNoCover.includes(game.fileName),
    );
    setBatchProgress({ done: 0, total: missing.length });
    const libretroSystem = guessLibretroSystem(systemFolder(selected));

    // El índice se carga una vez para todos los juegos: antes cada worker lo pedía.
    let files: ArtworkEntry[] = [];
    try {
      files = await loadArtworkIndex(libretroSystem);
    } catch {
      // sin índice se intenta la ruta exacta juego por juego
    }

    let next = 0;
    const workers = Array.from({ length: 6 }, async () => {
      while (next < missing.length) {
        if (batchCancel.current) return;
        const game = missing[next++];
        try {
          if (!files.length) {
            const exact = stem(game.fileName);
            for (const category of ARTWORK_CATEGORIES) {
              const response = await webFetch(
                makeArtworkUrl(libretroSystem, category, exact),
              );
              if (!response.ok) continue;
              const bytes = Array.from(
                new Uint8Array(await (await response.blob()).arrayBuffer()),
              );
              await saveImage(selected.path, game.fileName, bytes);
              break;
            }
          } else {
            const alias = findAlias(game.fileName);
            const candidates = dedupeMatches([
              ...(alias ? rankArtworkMatches(files, alias) : []),
              ...rankArtworkMatches(files, game.fileName),
            ]);
            let match = pickConfidentMatch(candidates);
            let category: ArtworkCategory = match
              ? categoryOfPath(match.path)
              : "Named_Boxarts";
            if (!match) {
              for (const fallbackCategory of [
                "Named_Titles",
                "Named_Snaps",
              ] as const) {
                const fallbackList = files.filter((item) =>
                  item.path.includes(fallbackCategory),
                );
                const confident = pickConfidentMatch(
                  fallbackList.length
                    ? rankArtworkMatches(fallbackList, game.fileName)
                    : [],
                );
                if (confident) {
                  match = confident;
                  category = fallbackCategory;
                  break;
                }
              }
            }
            if (match) {
              const response = await webFetch(
                makeArtworkUrl(libretroSystem, category, match.name),
              );
              if (response.ok) {
                const bytes = Array.from(
                  new Uint8Array(await (await response.blob()).arrayBuffer()),
                );
                await saveImage(selected.path, game.fileName, bytes);
              }
            }
          }
        } catch {
          // un juego sin resultado no detiene la búsqueda del resto
        }
        setBatchProgress((value) =>
          value ? { ...value, done: value.done + 1 } : value,
        );
      }
    });

    try {
      await Promise.all(workers);
      await selectSystem(selected);
      setSystems(await scanSd(root));
    } finally {
      setBatchProgress(null);
    }
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

  function addNote() {
    let text = noteDraft.trim();
    if (!text) return;
    const category = noteCategoryDraft.trim();
    const system = noteSystemDraft.trim();
    if (category) text = `[${category}] ${text}`;
    if (system) text = `${text} (${system})`;
    setNotes((items) => [
      {
        id: crypto.randomUUID(),
        text,
        title: noteDraft.trim(),
        done: false,
        category: category || undefined,
        system: system || undefined,
      },
      ...items,
    ]);
    setNoteDraft("");
    setNoteCategoryDraft("");
    setNoteSystemDraft("");
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

  const visibleGames = useMemo(
    () =>
      games
        .filter((game) => {
          const query = search.toLowerCase();
          const matches =
            game.title.toLowerCase().includes(query) ||
            game.fileName.toLowerCase().includes(query);
          return matches && (filter === "all" || !game.hasImage);
        })
        .sort((a, b) =>
          sortBy === "name"
            ? a.title.localeCompare(b.title, "es", { sensitivity: "base" })
            : a.fileName.localeCompare(b.fileName, "es", {
                sensitivity: "base",
              }),
        ),
    [games, search, filter, sortBy],
  );
  const totalGames = systems.reduce(
    (total, system) => total + system.gameCount,
    0,
  );
  const noImageTotal = systems.reduce(
    (total, system) => total + system.missingImages,
    0,
  );
  const pendingNotes = notes.filter((note) => !note.done).length;

  const availableNoteSystems = useMemo(() => {
    const set = new Set<string>();
    for (const note of notes) {
      const system = note.system || note.text.match(/\\(([^)]+)\\)\\s*$/)?.[1]?.trim();
      if (system) set.add(system);
    }
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" }),
    );
  }, [notes]);

  const filteredNotes = useMemo(() => {
    const query = noteSearch.trim().toLowerCase();
    return notes.filter((note) => {
      if (hideCompletedNotes && note.done) return false;
      if (notePriorityFilter !== "all" && note.priority !== notePriorityFilter)
        return false;
      if (noteSystemFilter !== "all") {
        const system =
          note.system || note.text.match(/\\(([^)]+)\\)\\s*$/)?.[1]?.trim();
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
    hideCompletedNotes,
    notePriorityFilter,
    noteSystemFilter,
    noteSearch,
  ]);

  const priorityWeight = (p?: string) =>
    p === "alta" ? 0 : p === "media" ? 1 : p === "baja" ? 2 : 3;

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

  useEffect(() => {
    if (!noteGroupsInitialized && notesGrouped.length) {
      setExpandedNoteGroups(new Set(notesGrouped.map(([k]) => k)));
      setNoteGroupsInitialized(true);
    }
  }, [notesGrouped, noteGroupsInitialized]);

  return (
    <div className="app-shell" onKeyDown={handleGlobalKeys} tabIndex={-1}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Gamepad2 size={20} strokeWidth={2.3} />
          </div>
          <div>
            <strong>
              R36S<span>MANAGER</span>
            </strong>
            <small>tu biblioteca, en orden</small>
          </div>
        </div>

        <div className="side-label">ESPACIO DE TRABAJO</div>
        <button
          className={`nav-item ${activeTab === "library" ? "active" : ""} `}
          onClick={() => setActiveTab("library")}
        >
          <Gamepad2 size={17} />
          <span>Biblioteca</span>
          <span className="nav-count">{formatSize(totalGames)}</span>
        </button>
        <button
          className={`nav-item ${activeTab === "notes" ? "active" : ""} `}
          onClick={() => setActiveTab("notes")}
        >
          <ListTodo size={17} />
          <span>Lista de pendientes</span>
          <span className="nav-count">{pendingNotes}</span>
        </button>

        <div className="side-section">
          <div className="side-label">
            SISTEMAS <span>{systems.length}</span>
          </div>
          <div className="system-list">
            {systems.map((system) => (
              <button
                key={system.id}
                onClick={() => {
                  setActiveTab("library");
                  void selectSystem(system);
                }}
                className={`system-item ${
                  selected?.id === system.id && activeTab === "library"
                    ? "selected"
                    : ""
                }`}
              >
                <span className="system-dot" />
                <span className="system-name">{system.name}</span>
                <span className="system-count">
                  {formatSize(system.gameCount)}
                </span>
              </button>
            ))}
            {!systems.length && (
              <p className="empty-systems">Conecta tu tarjeta para empezar</p>
            )}
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className="storage-card">
            <div className="storage-icon">
              <HardDrive size={16} />
            </div>
            <div className="storage-copy">
              <strong>
                {root ? "MicroSD conectada" : "Sin tarjeta conectada"}
              </strong>
              <span>
                {root
                  ? root.split(/[\\/]/).slice(-2).join("/")
                  : "Elige la carpeta ROMS"}
              </span>
            </div>
            <span className={`connection-dot ${root ? "on" : ""}`} />
          </div>
          {root && (
            <button
              className="settings-row open-folder-row"
              onClick={() => openSdFolder(root)}
            >
              <ExternalLink size={15} />
              <span>Abrir carpeta de la SD</span>
              <ChevronRight size={14} />
            </button>
          )}
          {root && (
            <button
              className="settings-row eject-row"
              onClick={ejectSd}
              disabled={ejecting}
              title="Liberar acceso para extraer la tarjeta con seguridad"
            >
              {ejecting ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <LogOut size={15} />
              )}
              <span>
                {ejecting ? "Liberando microSD…" : "Expulsar microSD"}
              </span>
              <ChevronRight size={14} />
            </button>
          )}
          <button className="settings-row" onClick={chooseRoot}>
            <SlidersHorizontal size={15} />
            <span>Cambiar tarjeta SD</span>
            <ChevronRight size={14} />
          </button>
          <div className="sidebar-footer">
            <span className="version-dot" />
            R36S Manager <span>v0.1.0</span>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Consola</span>
            <ChevronRight size={13} />
            <strong>
              {activeTab === "notes"
                ? "Pendientes"
                : selected?.name || "Biblioteca"}
            </strong>
          </div>
          <div className="top-actions">
            <div className="drive-indicator">
              <span className={`connection-dot ${root ? "on" : ""}`} />
              {root ? "MicroSD lista" : "Sin conexión"}
            </div>
            <button
              className="icon-button"
              title="Volver a escanear"
              onClick={() => scan()}
              disabled={!root || loading}
            >
              <RefreshCw size={15} className={loading ? "spin" : ""} />
            </button>
            {root && (
              <button
                className="icon-button"
                title="Expulsar microSD"
                onClick={ejectSd}
                disabled={ejecting}
              >
                {ejecting ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <LogOut size={15} />
                )}
              </button>
            )}
            <div className="avatar">R</div>
          </div>
        </header>

        {true && (
          <div className="content">
            {!root ? (
              <section className="welcome-card">
                <div className="welcome-orb">
                  <Disc3 size={42} />
                </div>
                <span className="eyebrow">TU CONSOLA, A TU MANERA</span>
                <h1>
                  Todo tu catálogo.
                  <br />
                  <em>En un solo lugar.</em>
                </h1>
                <p>
                  Conecta la microSD de tu R36S para organizar juegos, carátulas
                  y tu próxima lista de partidas.
                </p>
                <button className="primary-button" onClick={chooseRoot}>
                  <FolderOpen size={16} /> Elegir carpeta ROMS{" "}
                  <ChevronRight size={15} />
                </button>
                <div className="welcome-note">
                  <CheckCircle2 size={15} /> Tus archivos se quedan en la
                  tarjeta
                </div>
              </section>
            ) : (
              <>
                <section className="page-heading">
                  <div>
                    <div className="eyebrow">
                      BIBLIOTECA DE JUEGOS <span className="eyebrow-line" />
                    </div>
                    <h1>
                      {selected?.name || "Tu colección"}
                      <span className="heading-period">.</span>
                    </h1>
                    <p>
                      {selected
                        ? `Explora y organiza tus juegos de ${selected.name}.`
                        : "Selecciona un emulador para ver sus juegos."}
                    </p>
                  </div>
                  <div className="heading-actions">
                    {selected && (
                      <button
                        className="secondary-button"
                        onClick={() => openSdFolder(selected.path)}
                      >
                        <FolderOpen size={14} /> Abrir emulador
                      </button>
                    )}
                    <button
                      className="primary-button add-button"
                      onClick={openAdd}
                      disabled={!selected}
                    >
                      <Plus size={17} /> Añadir juego
                    </button>
                  </div>
                </section>

                <section className="stats-row">
                  <div className="stat-card">
                    <div className="stat-icon purple">
                      <Gamepad2 size={17} />
                    </div>
                    <div>
                      <span>JUEGOS EN TOTAL</span>
                      <strong>{formatSize(totalGames)}</strong>
                      <small>en {systems.length} sistemas</small>
                    </div>
                    <div className="stat-spark">✦─✦╰✦╯✦</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon teal">
                      <ImageIcon size={17} />
                    </div>
                    <div>
                      <span>CARÁTULAS PENDIENTES</span>
                      <strong>{formatSize(noImageTotal)}</strong>
                      <small>
                        {noImageTotal
                          ? "Algunos juegos esperan imagen"
                          : "Toda la colección tiene imagen"}
                      </small>
                    </div>
                    <div className="stat-status">
                      <span />
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon amber">
                      <HardDrive size={17} />
                    </div>
                    <div>
                      <span>SISTEMAS DETECTADOS</span>
                      <strong>{systems.length}</strong>
                      <small>carpetas de emuladores</small>
                    </div>
                    <div className="stat-device">
                      <Disc3 size={29} />
                    </div>
                  </div>
                </section>

                {error && (
                  <div className="error-banner">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                    <button onClick={() => setError("")}>
                      <X size={15} />
                    </button>
                  </div>
                )}

                {!systems.length ? (
                  <div className="no-systems">
                    <Gamepad2 size={25} />
                    <div>
                      <strong>No encontré emuladores todavía</strong>
                      <span>
                        Elige la carpeta que contiene las carpetas de tus
                        sistemas.
                      </span>
                    </div>
                    <button className="secondary-button" onClick={chooseRoot}>
                      Elegir otra carpeta
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="toolbar">
                      <div className="search-box">
                        <Search size={16} />
                        <input
                          placeholder="Buscar un juego..."
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                        />
                        <kbd>⌘ K</kbd>
                      </div>
                      <div className="filter-group">
                        <button
                          className={filter === "all" ? "filter-active" : ""}
                          onClick={() => setFilter("all")}
                        >
                          Todos <span>{selected?.gameCount ?? 0}</span>
                        </button>
                        <button
                          className={
                            filter === "missing" ? "filter-active" : ""
                          }
                          onClick={() => setFilter("missing")}
                        >
                          <span className="mini-dot" />
                          Sin carátula{" "}
                          <span>{selected?.missingImages ?? 0}</span>
                        </button>
                      </div>
                      <button
                        className="secondary-button sort-button"
                        onClick={() =>
                          setSortBy((value) =>
                            value === "name" ? "file" : "name",
                          )
                        }
                        title="Cambiar orden"
                      >
                        <ArrowUpDown size={13} />
                        {sortBy === "name" ? "Nombre" : "Archivo"}
                      </button>
                      <button
                        className="secondary-button view-toggle"
                        onClick={() =>
                          setViewMode((value) =>
                            value === "grid" ? "list" : "grid",
                          )
                        }
                        title="Cambiar vista"
                      >
                        <LayoutGrid size={13} />
                        {viewMode === "grid" ? "Cuadrícula" : "Lista"}
                      </button>
                      <div className="view-label">
                        {formatSize(visibleGames.length)} juegos
                      </div>
                      <button
                        className="secondary-button"
                        onClick={searchMissingCovers}
                        disabled={Boolean(batchProgress) || !noImageTotal}
                      >
                        <Sparkles size={13} /> Buscar faltantes
                      </button>
                    </div>

                    {batchProgress && (
                      <div className="batch-progress">
                        <span>
                          <LoaderCircle size={14} className="spin" /> Buscando
                          carátulas: {batchProgress.done} de{" "}
                          {batchProgress.total}
                        </span>
                        <div>
                          <i
                            style={{
                              width: `${
                                batchProgress.total
                                  ? (batchProgress.done / batchProgress.total) *
                                    100
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <div
                      className={`games-grid ${viewMode === "list" ? "list-mode" : ""}`}
                    >
                      {visibleGames.map((game) => (
                        <GameCard
                          key={game.id}
                          game={game}
                          onImage={() => startImage(game)}
                          onRemove={() => removeGameFromCatalog(game)}
                          markedNoCover={markedNoCover.includes(game.fileName)}
                        />
                      ))}
                    </div>

                    {!visibleGames.length && (
                      <div className="empty-state">
                        <div>
                          <Search size={20} />
                        </div>
                        <strong>No hay juegos para mostrar</strong>
                        <span>
                          {filter === "missing"
                            ? "¡Todos los juegos de este sistema tienen carátula!"
                            : "Prueba otra búsqueda o añade un juego a tu colección."}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
        {activeTab === "notes" && (
          <div className="content notes-content notes-drawer">
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
              <button
                className="icon-button"
                aria-label="Cerrar lista de pendientes"
                onClick={() => setActiveTab("library")}
              >
                <X size={17} />
              </button>
              <div className="note-progress">
                <span>
                  {notes.filter((note) => note.done).length}/{notes.length}{" "}
                  completados
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

            <AiListOrganizer
              systems={systems}
              fullLibrary={fullLibrary}
              loadingLibrary={loadingFullLibrary}
              onLoadLibrary={loadFullLibrary}
              onImport={importAiItems}
            />

            <form
              className="note-composer note-composer-extended"
              onSubmit={(event) => {
                event.preventDefault();
                addNote();
              }}
            >
              <div className="composer-icon">
                <Pencil size={17} />
              </div>
              <input
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="¿Qué juego quieres añadir?"
              />
              <input
                className="text-field composer-category"
                value={noteCategoryDraft}
                onChange={(event) => setNoteCategoryDraft(event.target.value)}
                placeholder="Categoría (opcional, ej. JRPG)"
              />
              <select
                className="text-field composer-system"
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
              <button className="primary-button" disabled={!noteDraft.trim()}>
                <Plus size={16} /> Añadir
              </button>
            </form>

            <div className="notes-toolbar">
              <input
                className="text-field notes-search"
                value={noteSearch}
                onChange={(event) => setNoteSearch(event.target.value)}
                placeholder="Buscar en la lista..."
              />
              <select
                className="text-field"
                value={notePriorityFilter}
                onChange={(event) =>
                  setNotePriorityFilter(
                    event.target.value as "all" | "alta" | "media" | "baja",
                  )
                }
              >
                <option value="all">Todas las prioridades</option>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
              <select
                className="text-field"
                value={noteSystemFilter}
                onChange={(event) => setNoteSystemFilter(event.target.value)}
              >
                <option value="all">Todas las consolas</option>
                {availableNoteSystems.map((system) => (
                  <option key={system} value={system}>
                    {system}
                  </option>
                ))}
              </select>
              <select
                className="text-field"
                value={notesGroupBy}
                onChange={(event) =>
                  setNotesGroupBy(event.target.value as "category" | "system")
                }
              >
                <option value="category">Agrupar por categoría</option>
                <option value="system">Agrupar por consola</option>
              </select>
              <label className="notes-toggle">
                <input
                  type="checkbox"
                  checked={hideCompletedNotes}
                  onChange={(event) =>
                    setHideCompletedNotes(event.target.checked)
                  }
                />
                <span>Ocultar conseguidos</span>
              </label>
            </div>

            <div className="notes-heading">
              <span>JUEGOS POR AÑADIR</span>
              <span>
                {filteredNotes.length} de {notes.length} · {pendingNotes} pendientes
              </span>
            </div>

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
                const isOpen = expandedNoteGroups.has(group);
                return (
                  <section className="notes-group" key={group}>
                    <header
                      className="notes-group-header"
                      onClick={() =>
                        setExpandedNoteGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(group)) next.delete(group);
                          else next.add(group);
                          return next;
                        })
                      }
                      role="button"
                      tabIndex={0}
                    >
                      <ChevronDown
                        size={14}
                        className={isOpen ? "rotated" : ""}
                      />
                      <strong>{group}</strong>
                      <span>{groupNotes.length}</span>
                    </header>
                    {isOpen && (
                      <div className="notes-group-items">
                        {groupNotes.map((note) => (
                          <NoteCard
                            key={note.id}
                            note={note}
                            onToggle={() => toggleNote(note.id)}
                            onDelete={() => deleteNote(note.id)}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>

            <div className="note-tip">
              <Sparkles size={15} />
              <span>
                Consejo: usa categoría y consola para mantener la lista
                organizada por emulador.
              </span>
            </div>
          </div>
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
          onDraftSelectImage={setDraftImage}
          onDraftClearImage={clearDraftImage}
          onToggleNote={toggleNote}
          onSave={saveNewGames}
        />
      )}

      {modal === "image" && (
        <ArtworkModal
          game={targetGame}
          imagePreview={imagePreview}
          imageStatus={imageStatus}
          imageBytes={imageBytes}
          progress={artworkProgress}
          warning={artworkWarning}
          matches={artworkMatches}
          loading={loading}
          onClose={() => setModal(null)}
          onSearch={() => {
            if (targetGame)
              void searchArtwork(targetGame.title, targetGame.fileName, false);
          }}
          onChooseMatch={chooseArtwork}
          onSelectImage={selectImage}
          onSave={saveGameImage}
          onMarkNoCover={markCurrentGameNoCover}
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

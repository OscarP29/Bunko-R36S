import { useEffect, useRef, useState } from "react";

import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  CheckCircle2,
} from "lucide-react";
import { AddGameModal } from "./components/AddGameModal.tsx";
import { ArtworkModal } from "./components/ArtworkModal.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Topbar } from "./components/Topbar.tsx";
import { useLibraryView } from "./hooks/useLibraryView.ts";
import { useNotesView } from "./hooks/useNotesView.ts";
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
  FullEntry,
  Game,
  ImageStatus,
  NewGameDraft,
  Note,
  System,
  Tab,
} from "./lib/types.ts";
import { LibraryPage } from "./pages/LibraryPage.tsx";
import { NotesPage } from "./pages/NotesPage.tsx";

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
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  /** Raíz cuyas notas están cargadas: evita copiar la libreta a otra tarjeta. */
  const notesRoot = useRef("");
  const batchCancel = useRef(false);
  const libraryView = useLibraryView(games);
  const notesView = useNotesView(notes, addNote);
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
      libraryView.resetFilters();
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
            batchProgress={batchProgress}
            markedNoCover={markedNoCover}
            onChooseRoot={chooseRoot}
            onOpenFolder={openSdFolder}
            onAddGame={openAdd}
            onDismissError={() => setError("")}
            onSearchMissingCovers={searchMissingCovers}
            onChangeImage={startImage}
            onRemoveGame={removeGameFromCatalog}
          />
        )}
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

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import Fuse from "fuse.js";
import aliases from "./aliases.json";
import { Search, HardDrive, Gamepad2, Image as ImageIcon, ListTodo, Plus, RefreshCw, X, Check, ChevronRight, AlertCircle, CheckCircle2, LoaderCircle, Trash2, Sparkles, FolderOpen, Disc3, Pencil, SlidersHorizontal, ExternalLink, LayoutGrid, ArrowUpDown } from "lucide-react";

type Game = { id: string; fileName: string; title: string; imageName: string | null; imagePath: string | null; hasImage: boolean };
type System = { id: string; name: string; path: string; gameCount: number; missingImages: number };
type Note = { id: string; text: string; done: boolean };
type Tab = "library" | "notes";
type ArtworkEntry = { path: string; name: string };
type ArtworkMatch = ArtworkEntry & { score: number };
type ArtworkIndex = { savedAt: number; files: ArtworkEntry[] };

const CACHE_KEY = "r36s-manager-root";
const NOTES_KEY = "r36s-manager-notes";
const ARTWORK_TTL = 7 * 24 * 60 * 60 * 1000;
const ARTWORK_CACHE_PREFIX = "r36s-artwork-index:";
const ARTWORK_CHOICE_PREFIX = "r36s-artwork-choice:";
const FUZZY_THRESHOLD = 0.34;
const cleanTitle = (file: string) => file.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
const stem = (file: string) => file.replace(/\.[^.]+$/, "");
export function cleanRomName(fileName: string) {
  return stem(fileName)
    .replace(/[([][^)\]]*[)\]]/g, " ")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[&*/:<>?\\|]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim().replace(/\s+/g, " ");
}
const libretroSafeName = (name: string) => name.replace(/[&*/:<>?\\|]/g, "_");
const makeArtworkUrl = (system: string, category: string, name: string) => `https://thumbnails.libretro.com/${encodeURIComponent(system)}/${category}/${encodeURIComponent(libretroSafeName(name))}.png`;
const cacheKeyForSystem = (system: string) => ARTWORK_CACHE_PREFIX + system;
const choiceKeyForGame = (system: string, fileName: string) => ARTWORK_CHOICE_PREFIX + `${system}:${cleanRomName(fileName)}`;
const regionRank = (name: string) => {
  const normalized = name.toLowerCase();
  if (/\(spain\)/.test(normalized)) return 0;
  if (/\(europe\)/.test(normalized)) return 1;
  if (/\(usa, europe\)/.test(normalized)) return 2;
  if (/\(usa\)/.test(normalized)) return 3;
  if (/\(world\)/.test(normalized)) return 4;
  return 5;
};
const imageUrl = (path: string) => isTauri() ? convertFileSrc(path) : "";
const safeDecode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };
const guessLibretroSystem = (folder: string) => {
  const key = folder.toLowerCase().replace(/[^a-z0-9]/g, "");
  const names: Record<string, string> = {
    gb: "Nintendo - Game Boy", gameboy: "Nintendo - Game Boy", gbc: "Nintendo - Game Boy Color", gameboycolor: "Nintendo - Game Boy Color",
    gba: "Nintendo - Game Boy Advance", gameboyadvance: "Nintendo - Game Boy Advance", nds: "Nintendo - Nintendo DS", nintendods: "Nintendo - Nintendo DS",
    nes: "Nintendo - Nintendo Entertainment System", nintendoentertainmentsystem: "Nintendo - Nintendo Entertainment System", famicom: "Nintendo - Nintendo Entertainment System", snes: "Nintendo - Super Nintendo Entertainment System", snes9x: "Nintendo - Super Nintendo Entertainment System", supernintendo: "Nintendo - Super Nintendo Entertainment System",
    n64: "Nintendo - Nintendo 64", psx: "Sony - PlayStation", ps1: "Sony - PlayStation", psp: "Sony - PlayStation Portable", genesis: "Sega - Mega Drive - Genesis", megadrive: "Sega - Mega Drive - Genesis",
    sms: "Sega - Master System - Mark III", gamegear: "Sega - Game Gear", dreamcast: "Sega - Dreamcast", saturn: "Sega - Saturn", arcade: "MAME", mame: "MAME", fbneo: "FB Neo - Arcade Games",
    wonderswan: "Bandai - WonderSwan", wonderswancolor: "Bandai - WonderSwan Color", pokemini: "Nintendo - Pokemon Mini", lynx: "Atari - Lynx", atari2600: "Atari - 2600", pce: "NEC - PC Engine - TurboGrafx 16", pcengine: "NEC - PC Engine - TurboGrafx 16",
  };
  return names[key] || folder.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
};
const formatSize = (count: number) => new Intl.NumberFormat("es-CO").format(count);

function App() {
  const [root, setRoot] = useState(localStorage.getItem(CACHE_KEY) || "");
  const [systems, setSystems] = useState<System[]>([]);
  const [selected, setSelected] = useState<System | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("library");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "missing">("all");
  const [sortBy, setSortBy] = useState<"name" | "file">("name");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"add" | "image" | null>(null);
  const [targetGame, setTargetGame] = useState<Game | null>(null);
  const [title, setTitle] = useState("");
  const [romPath, setRomPath] = useState("");
  const [imageBytes, setImageBytes] = useState<number[] | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageStatus, setImageStatus] = useState<"idle" | "searching" | "found" | "missing">("idle");
  const [artworkMatches, setArtworkMatches] = useState<ArtworkMatch[]>([]);
  const [artworkCategory, setArtworkCategory] = useState("Named_Boxarts");
  const [artworkProgress, setArtworkProgress] = useState("");
  const [artworkWarning, setArtworkWarning] = useState("");
  const [markedNoCover, setMarkedNoCover] = useState<string[]>([]);
  const [manualCandidate, setManualCandidate] = useState("");
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!notesLoaded) return;
    if (isTauri()) void invoke("write_notes", { path: root ? `${root.replace(/[\\/]$/, "")}/.r36s-manager-notes.json` : "", content: JSON.stringify(notes) }).catch(() => localStorage.setItem(NOTES_KEY, JSON.stringify(notes)));
    else localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  }, [notes, notesLoaded, root]);
  useEffect(() => { if (!root) return; scan(root); }, []);
  useEffect(() => {
    if (!isTauri()) { setNotesLoaded(true); return; }
    if (!root) { try { setNotes(JSON.parse(localStorage.getItem(NOTES_KEY) || "[]")); } catch { setNotes([]); } setNotesLoaded(true); return; }
    invoke<string>("read_notes", { path: `${root.replace(/[\\/]$/, "")}/.r36s-manager-notes.json` })
      .then(value => { if (value) setNotes(JSON.parse(value)); else { try { setNotes(JSON.parse(localStorage.getItem(NOTES_KEY) || "[]")); } catch { setNotes([]); } } setNotesLoaded(true); })
      .catch(() => { setNotesLoaded(true); });
  }, [root]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(""), 3000); return () => clearTimeout(t); }, [notice]);

  async function scan(path = root) {
    if (!path) return;
    setLoading(true); setError("");
    try {
      const result = await invoke<System[]>("scan_sd", { root: path });
      setRoot(path); localStorage.setItem(CACHE_KEY, path); setSystems(result);
      const keep = result.find(s => s.id === selected?.id) || result[0] || null;
      setSelected(keep);
      if (keep) {
        const listed = await invoke<Game[]>("list_games", { systemPath: keep.path });
        const withImages = await Promise.all(listed.map(async game => {
          const candidates = await invoke<string[]>("rom_candidates", { systemPath: keep.path, fileName: game.fileName });
          const imagePath = candidates[0] || game.imagePath || null;
          return { ...game, imagePath, imageName: imagePath?.split(/[\\/]/).pop() || null, hasImage: Boolean(imagePath) };
        }));
        setGames(withImages);
      } else setGames([]);
      if (result.length === 0) setError("No encontré carpetas con filelist.csv en este nivel. Prueba con la carpeta ROMS de la tarjeta.");
    } catch (e) { setError(String(e)); setSystems([]); setGames([]); }
    finally { setLoading(false); }
  }

  async function selectSystem(system: System) {
    setSelected(system); setSearch(""); setFilter("all");
    try {
      const listed = await invoke<Game[]>("list_games", { systemPath: system.path });
      const withImages = await Promise.all(listed.map(async game => {
        const candidates = await invoke<string[]>("rom_candidates", { systemPath: system.path, fileName: game.fileName });
        const imagePath = candidates[0] || game.imagePath || null;
        return { ...game, imagePath, imageName: imagePath?.split(/[\\/]/).pop() || null, hasImage: Boolean(imagePath) };
      }));
      setGames(withImages);
      setError("");
    } catch (e) { setError(String(e)); }
  }

  async function chooseRoot() {
    const picked = await open({ directory: true, multiple: false, title: "Selecciona la carpeta ROMS de la microSD" });
    if (typeof picked === "string") await scan(picked);
  }

  async function openSdFolder(path = root) {
    if (!path) return;
    try {
      if (isTauri()) await openPath(path);
      else window.open(`file:///${path.replace(/\\/g, "/")}`, "_blank");
    } catch (e) { setError(`No se pudo abrir la carpeta: ${String(e)}`); }
  }

  async function selectImage(file: File) {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    setImageBytes(bytes); setImagePreview(URL.createObjectURL(file)); setImageStatus("idle");
  }

  async function loadArtworkIndex(libretroSystem: string): Promise<ArtworkEntry[]> {
    const cacheKey = cacheKeyForSystem(libretroSystem);
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || "null") as ArtworkIndex | null;
      if (cached && Date.now() - cached.savedAt < ARTWORK_TTL && Array.isArray(cached.files)) return cached.files;
    } catch { /* cache inválida, se vuelve a descargar */ }

    const repo = libretroSystem.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const response = await fetch(`https://api.github.com/repos/libretro-thumbnails/${encodeURIComponent(repo)}/git/trees/master?recursive=1`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`GitHub respondió ${response.status} al cargar el índice de ${libretroSystem}.`);
    const tree = await response.json() as { truncated?: boolean; tree?: { path: string; type: string }[] };
    if (tree.truncated) {
      setArtworkWarning(`GitHub devolvió un índice truncado para ${libretroSystem}. Probaré el listado público del servidor de thumbnails como alternativa.`);
      const fallback = await fetch(`https://thumbnails.libretro.com/${encodeURIComponent(libretroSystem)}/Named_Boxarts/`);
      if (!fallback.ok) throw new Error("El índice de GitHub llegó truncado y el servidor de thumbnails no ofreció un listado alternativo. Puedes probar una búsqueda exacta.");
      const html = await fallback.text();
      const files = Array.from(html.matchAll(/href=["']([^"']+\.png)["']/gi), match => {
        const path = safeDecode(match[1]);
        return { path: `Named_Boxarts/${path.split("/").pop()}`, name: path.split("/").pop()!.replace(/\.png$/i, "") };
      });
      if (!files.length) throw new Error("La alternativa pública no devolvió nombres de carátulas.");
      localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), files } satisfies ArtworkIndex));
      return files;
    }
    const files = (tree.tree || []).filter(item => item.type === "blob" && /(?:^|\/)Named_Boxarts\/.*\.png$/i.test(item.path))
      .map(item => ({ path: item.path, name: item.path.split("/").pop()!.replace(/\.png$/i, "") }));
    if (!files.length) throw new Error(`No encontré Named_Boxarts en el repositorio ${repo}. Revisa el nombre del sistema.`);
    localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), files } satisfies ArtworkIndex));
    return files;
  }

  function rankArtworkMatches(files: ArtworkEntry[], query: string): ArtworkMatch[] {
    const fuse = new Fuse(files, { keys: ["name"], includeScore: true, threshold: FUZZY_THRESHOLD, ignoreLocation: true, minMatchCharLength: 3, getFn: entry => cleanRomName(entry.name) });
    return fuse.search(cleanRomName(query)).filter(match => (match.score ?? 1) <= FUZZY_THRESHOLD)
      .map(match => ({ ...match.item, score: match.score ?? 1 }))
      .sort((a, b) => regionRank(a.name) - regionRank(b.name) || a.score - b.score).slice(0, 8);
  }

  async function previewArtworkMatch(match: ArtworkMatch, fileName: string, forNewGame: boolean, selectedCategory?: string) {
    if (!selected) return;
    const folder = selected.path.split(/[\\/]/).pop() || "";
    const libretroSystem = guessLibretroSystem(folder);
    setImageStatus("searching"); setArtworkProgress(`Cargando ${match.name}…`);
    const category = selectedCategory || match.path.split("/").find(part => ["Named_Boxarts", "Named_Titles", "Named_Snaps"].includes(part)) || "Named_Boxarts";
    const response = await fetch(makeArtworkUrl(libretroSystem, category, match.name));
    if (!response.ok) throw new Error(`No se pudo descargar ${match.name} (${response.status}).`);
    const blob = await response.blob();
    const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
    if (!forNewGame) await invoke("save_image", { systemPath: selected.path, fileName, imageBytes: bytes });
    setImageBytes(bytes); setImagePreview(URL.createObjectURL(blob)); setImageStatus("found"); setManualCandidate(match.name);
    localStorage.setItem(choiceKeyForGame(libretroSystem, fileName), JSON.stringify(match));
    setArtworkProgress("");
  }

  async function loadCategoryFallbacks(libretroSystem: string): Promise<{ category: string; entries: ArtworkEntry[] }[]> {
    const result: { category: string; entries: ArtworkEntry[] }[] = [];
    for (const category of ["Named_Titles", "Named_Snaps"]) {
      try {
        const response = await fetch(`https://thumbnails.libretro.com/${encodeURIComponent(libretroSystem)}/${category}/`);
        if (!response.ok) continue;
        const html = await response.text();
        const entries = Array.from(html.matchAll(/href=["']([^"']+\.png)["']/gi), match => {
          const name = safeDecode(match[1].split("/").pop()!).replace(/\.png$/i, "");
          return { name, path: `${category}/${name}.png` };
        });
        if (entries.length) result.push({ category, entries });
      } catch { /* fallback no disponible para este sistema */ }
    }
    return result;
  }

  async function searchArtwork(gameTitle: string, fileName: string, forNewGame = false) {
    setImageStatus("searching"); setImageBytes(null); setImagePreview(""); setArtworkMatches([]); setArtworkWarning(""); setArtworkProgress("Preparando índice…");
    try {
      const folder = selected?.path.split(/[\\/]/).pop() || "";
      const libretroSystem = guessLibretroSystem(folder);
      let files: ArtworkEntry[] = [];
      try { files = await loadArtworkIndex(libretroSystem); }
      catch (indexError) {
        setArtworkWarning(`${String(indexError)} Probaré las categorías públicas de carátulas, títulos y capturas.`);
      }
      const original = stem(fileName);
      const aliasKey = cleanRomName(original);
      const aliasValue = Object.entries(aliases).find(([key]) => cleanRomName(key) === aliasKey)?.[1];
      const queries = Array.from(new Set([aliasValue, gameTitle, original].filter((value): value is string => Boolean(value))));
      let searchFiles = files.filter(item => item.path.includes("Named_Boxarts"));
      let matchGroups = searchFiles.length ? queries.map(query => rankArtworkMatches(searchFiles, query)) : [];
      if (files.length && !matchGroups.some(group => group.length)) {
        const fallbacks = files.some(item => item.path.includes("Named_Titles")) ? ["Named_Titles", "Named_Snaps"].map(category => ({ category, entries: files.filter(item => item.path.includes(category)) })) : await loadCategoryFallbacks(libretroSystem);
        for (const { category, entries: fallbackFiles } of fallbacks) {
          const fallbackMatches = queries.map(query => rankArtworkMatches(fallbackFiles, query));
          if (fallbackMatches.some(group => group.length)) { matchGroups = fallbackMatches; searchFiles = fallbackFiles; setArtworkCategory(category); break; }
        }
      }
      let matches = matchGroups.find(group => group.length)?.slice() || [];
      const saved = localStorage.getItem(choiceKeyForGame(libretroSystem, fileName));
      if (saved) {
        try {
          const choice = JSON.parse(saved) as ArtworkMatch;
          const known = searchFiles.find(item => item.path === choice.path);
          if (known) matches = [{ ...known, score: 0 }, ...matches.filter(item => item.path !== known.path)];
        } catch { /* ignore stale manual selection */ }
      }
      if (!matches.length) {
        // Keep the exact-name path as a compatible last attempt for unusual filenames.
        const exact = [original, gameTitle].filter(Boolean);
      for (const candidate of exact) {
          for (const category of ["Named_Boxarts", "Named_Titles", "Named_Snaps"]) {
            const fileNames = files.length ? files.filter(item => item.path.includes(category)).map(item => item.name) : [candidate];
            const fallbackMatch = files.length ? rankArtworkMatches(fileNames.map(name => ({ path: `${category}/${name}.png`, name })), candidate)[0] : null;
            if (files.length && !fallbackMatch) continue;
            const response = await fetch(makeArtworkUrl(libretroSystem, category, fallbackMatch?.name || candidate));
            if (!response.ok) continue;
            const blob = await response.blob();
            const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
            if (!forNewGame) await invoke("save_image", { systemPath: selected?.path, fileName, imageBytes: bytes });
            setImageBytes(bytes); setImagePreview(URL.createObjectURL(blob)); setImageStatus("found"); setArtworkCategory(category); setArtworkProgress(""); return;
          }
        }
        setImageStatus("missing"); setArtworkProgress(""); return;
      }
      const choices = matches;
      setArtworkCategory(choices[0]?.path.split("/").find(part => ["Named_Boxarts", "Named_Titles", "Named_Snaps"].includes(part)) || "Named_Boxarts");
      setArtworkMatches(choices);
      if (choices.length === 1 || (choices[0].score < 0.12 && (choices[1]?.score ?? 1) - choices[0].score > 0.09)) {
        await previewArtworkMatch(choices[0], fileName, forNewGame, artworkCategory);
      } else {
        setImageStatus("idle"); setArtworkProgress("");
      }
    } catch (e) {
      setImageStatus("missing"); setArtworkProgress(""); setError(String(e));
    }
  }

  async function findArtwork(gameTitle: string, fileName: string) {
    await searchArtwork(gameTitle, fileName, !targetGame);
  }

  async function openAdd() {
    setTitle(""); setRomPath(""); setImageBytes(null); setImagePreview(""); setImageStatus("idle"); setModal("add");
  }

  async function chooseRom() {
    const picked = await open({ multiple: false, title: "Selecciona el archivo del juego" });
    if (typeof picked === "string") { setRomPath(picked); const file = picked.split(/[\\/]/).pop() || ""; setTitle(cleanTitle(file)); }
  }

  async function saveNewGame() {
    if (!selected || !romPath) return;
    setLoading(true);
    try {
      await invoke("add_game", { systemPath: selected.path, sourcePath: romPath, title, imageBytes });
      setModal(null); setNotice("Juego añadido a " + selected.name);
      await scan(root);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  async function chooseCustomImage() {
    const picked = await open({ multiple: false, title: "Selecciona una imagen", filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "webp"] }] });
    if (typeof picked === "string") {
      const bytes = await readFile(picked); setImageBytes(Array.from(bytes)); setImagePreview(imageUrl(picked)); setImageStatus("idle");
    }
  }

  async function saveGameImage() {
    if (!selected || !targetGame || !imageBytes) return;
    setLoading(true);
    try {
      if (imageStatus !== "found") await invoke("save_image", { systemPath: selected.path, fileName: targetGame.fileName, imageBytes });
      setModal(null); setNotice("Carátula guardada en 512 × 512 px");
      await selectSystem(selected);
      setSystems(await invoke<System[]>("scan_sd", { root }));
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  async function chooseArtwork(match: ArtworkMatch) {
    if (!targetGame) return;
    try { await previewArtworkMatch({ ...match, path: `${artworkCategory}/${match.name}.png` }, targetGame.fileName, false, artworkCategory); }
    catch (e) { setError(String(e)); setImageStatus("missing"); }
  }

  function markCurrentGameNoCover() {
    if (targetGame) setMarkedNoCover(items => Array.from(new Set([...items, targetGame.fileName])));
    setArtworkMatches([]); setImageBytes(null); setImagePreview(""); setImageStatus("missing");
  }

  async function saveChoiceAndRefresh() {
    if (!imageBytes || !selected || !targetGame) return;
    try {
      await invoke("save_image", { systemPath: selected.path, fileName: targetGame.fileName, imageBytes });
      await selectSystem(selected); setSystems(await invoke<System[]>("scan_sd", { root }));
      setModal(null); setNotice("Carátula guardada");
    } catch (e) { setError(String(e)); }
  }

  async function removeGame(game: Game) {
    if (!selected || !confirm(`¿Quitar “${game.title}” del catálogo? El archivo de juego se conservará.`)) return;
    try { await invoke("remove_game", { systemPath: selected.path, fileName: game.fileName }); setGames(await invoke<Game[]>("list_games", { systemPath: selected.path })); setSystems(await invoke<System[]>("scan_sd", { root })); setNotice("Juego quitado del catálogo"); }
    catch (e) { setError(String(e)); }
  }

  function startImage(game: Game) {
    setTargetGame(game); setImageBytes(null); setImagePreview(""); setImageStatus("idle"); setArtworkMatches([]); setArtworkProgress(""); setMarkedNoCover(items => items.filter(item => item !== game.fileName)); setModal("image");
  }

  async function searchMissingCovers() {
    if (!selected) return;
    const missing = games.filter(game => !game.hasImage && !markedNoCover.includes(game.fileName));
    setBatchProgress({ done: 0, total: missing.length });
    let next = 0;
    const workers = Array.from({ length: 6 }, async () => {
      while (next < missing.length) {
        const index = next++;
        const game = missing[index];
        try {
          const folder = selected.path.split(/[\\/]/).pop() || "";
          const libretroSystem = guessLibretroSystem(folder);
          let files: ArtworkEntry[] = [];
          try { files = await loadArtworkIndex(libretroSystem); } catch { /* usa los nombres exactos como fallback */ }
          const query = cleanRomName(game.fileName);
          const aliasValue = Object.entries(aliases).find(([key]) => cleanRomName(key) === query)?.[1];
          const matches = [...(aliasValue ? rankArtworkMatches(files, aliasValue) : []), ...rankArtworkMatches(files, game.fileName)].filter((item, pos, all) => all.findIndex(other => other.path === item.path) === pos);
          let selectedMatch = matches.length && matches[0].score < 0.18 && (matches[1]?.score ?? 1) - matches[0].score > 0.08 ? matches[0] : null;
          let category = "Named_Boxarts";
          if (!selectedMatch) {
            for (const fallbackCategory of ["Named_Titles", "Named_Snaps"]) {
              const fallbackList = files.filter(item => item.path.includes(fallbackCategory));
              const fallback = fallbackList.length ? rankArtworkMatches(fallbackList, game.fileName)[0] : null;
              if (fallback && fallback.score < 0.18) { selectedMatch = fallback; category = fallbackCategory; break; }
            }
          }
          if (!files.length) {
            const exact = stem(game.fileName);
            for (const fallbackCategory of ["Named_Boxarts", "Named_Titles", "Named_Snaps"]) {
              const response = await fetch(makeArtworkUrl(libretroSystem, fallbackCategory, exact));
              if (!response.ok) continue;
              const bytes = Array.from(new Uint8Array(await (await response.blob()).arrayBuffer()));
              await invoke("save_image", { systemPath: selected.path, fileName: game.fileName, imageBytes: bytes });
              selectedMatch = { path: `${fallbackCategory}/${exact}.png`, name: exact, score: 0 }; category = fallbackCategory; break;
            }
          }
          if (selectedMatch) {
            const response = await fetch(makeArtworkUrl(libretroSystem, category, selectedMatch.name));
            if (response.ok) {
              const image = Array.from(new Uint8Array(await (await response.blob()).arrayBuffer()));
              await invoke("save_image", { systemPath: selected.path, fileName: game.fileName, imageBytes: image });
            }
          }
        } catch { /* un juego sin resultado no detiene la búsqueda del resto */ }
        setBatchProgress(value => value ? { ...value, done: value.done + 1 } : value);
      }
    });
    await Promise.all(workers);
    await selectSystem(selected);
    setSystems(await invoke<System[]>("scan_sd", { root }));
    setBatchProgress(null);
  }

  async function addNote() {
    const text = noteDraft.trim(); if (!text) return;
    setNotes(n => [{ id: crypto.randomUUID(), text, done: false }, ...n]); setNoteDraft(""); setNotesLoaded(true);
  }

  function handleGlobalKeys(event: React.KeyboardEvent<HTMLDivElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault(); document.querySelector<HTMLInputElement>(".search-box input")?.focus();
    }
    if (event.key === "Escape" && modal) setModal(null);
  }

  const visibleGames = useMemo(() => games.filter(game => {
    const matches = game.title.toLowerCase().includes(search.toLowerCase()) || game.fileName.toLowerCase().includes(search.toLowerCase());
    return matches && (filter === "all" || !game.hasImage);
  }).sort((a, b) => sortBy === "name" ? a.title.localeCompare(b.title, "es", { sensitivity: "base" }) : a.fileName.localeCompare(b.fileName, "es", { sensitivity: "base" })), [games, search, filter, sortBy]);
  const totalGames = systems.reduce((total, system) => total + system.gameCount, 0);
  const noImageTotal = systems.reduce((total, system) => total + system.missingImages, 0);

  async function gameImage(path: string | null) { if (!path) return ""; return imageUrl(path); }

  return (
    <div className="app-shell" onKeyDown={handleGlobalKeys} tabIndex={-1}>
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Gamepad2 size={20} strokeWidth={2.3}/></div><div><strong>R36S<span>MANAGER</span></strong><small>tu biblioteca, en orden</small></div></div>
        <div className="side-label">ESPACIO DE TRABAJO</div>
        <button className={`nav-item ${activeTab === "library" ? "active" : ""}`} onClick={() => setActiveTab("library")}><Gamepad2 size={17}/><span>Biblioteca</span><span className="nav-count">{formatSize(totalGames)}</span></button>
        <button className={`nav-item ${activeTab === "notes" ? "active" : ""}`} onClick={() => setActiveTab("notes")}><ListTodo size={17}/><span>Lista de pendientes</span><span className="nav-count">{notes.filter(n => !n.done).length}</span></button>
        <div className="side-section"><div className="side-label">SISTEMAS <span>{systems.length}</span></div><div className="system-list">
          {systems.map(system => <button key={system.id} onClick={() => { setActiveTab("library"); selectSystem(system); }} className={`system-item ${selected?.id === system.id && activeTab === "library" ? "selected" : ""}`}><span className="system-dot"/><span className="system-name">{system.name}</span><span className="system-count">{formatSize(system.gameCount)}</span></button>)}
          {!systems.length && <p className="empty-systems">Conecta tu tarjeta para empezar</p>}
        </div></div>
        <div className="sidebar-bottom">
          <div className="storage-card"><div className="storage-icon"><HardDrive size={16}/></div><div className="storage-copy"><strong>{root ? "MicroSD conectada" : "Sin tarjeta conectada"}</strong><span>{root ? root.split(/[\\/]/).slice(-2).join("/") : "Elige la carpeta ROMS"}</span></div><span className={`connection-dot ${root ? "on" : ""}`}/></div>
          {root && <button className="settings-row open-folder-row" onClick={() => openSdFolder(root)}><ExternalLink size={15}/><span>Abrir carpeta de la SD</span><ChevronRight size={14}/></button>}
          <button className="settings-row" onClick={chooseRoot}><SlidersHorizontal size={15}/><span>Cambiar tarjeta SD</span><ChevronRight size={14}/></button>
          <div className="sidebar-footer"><span className="version-dot"/>R36S Manager <span>v0.1.0</span></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Consola</span><ChevronRight size={13}/><strong>{activeTab === "notes" ? "Pendientes" : selected?.name || "Biblioteca"}</strong></div><div className="top-actions"><div className="drive-indicator"><span className={`connection-dot ${root ? "on" : ""}`}/>{root ? "MicroSD lista" : "Sin conexión"}</div><button className="icon-button" title="Volver a escanear" onClick={() => scan()} disabled={!root || loading}><RefreshCw size={15} className={loading ? "spin" : ""}/></button><div className="avatar">R</div></div></header>

        {activeTab === "library" ? <div className="content">
          {!root ? <section className="welcome-card"><div className="welcome-orb"><Disc3 size={42}/></div><span className="eyebrow">TU CONSOLA, A TU MANERA</span><h1>Todo tu catálogo.<br/><em>En un solo lugar.</em></h1><p>Conecta la microSD de tu R36S para organizar juegos, carátulas y tu próxima lista de partidas.</p><button className="primary-button" onClick={chooseRoot}><FolderOpen size={16}/> Elegir carpeta ROMS <ChevronRight size={15}/></button><div className="welcome-note"><CheckCircle2 size={15}/> Tus archivos se quedan en la tarjeta</div></section> : <>
            <section className="page-heading"><div><div className="eyebrow">BIBLIOTECA DE JUEGOS <span className="eyebrow-line"/></div><h1>{selected?.name || "Tu colección"}<span className="heading-period">.</span></h1><p>{selected ? `Explora y organiza tus juegos de ${selected.name}.` : "Selecciona un emulador para ver sus juegos."}</p></div><div className="heading-actions">{selected && <button className="secondary-button" onClick={() => openSdFolder(selected.path)}><FolderOpen size={14}/> Abrir emulador</button>}<button className="primary-button add-button" onClick={openAdd} disabled={!selected}><Plus size={17}/> Añadir juego</button></div></section>
            <section className="stats-row"><div className="stat-card"><div className="stat-icon purple"><Gamepad2 size={17}/></div><div><span>JUEGOS EN TOTAL</span><strong>{formatSize(totalGames)}</strong><small>en {systems.length} sistemas</small></div><div className="stat-spark">▂▄▃▅▆▄▇</div></div><div className="stat-card"><div className="stat-icon teal"><ImageIcon size={17}/></div><div><span>CARÁTULAS PENDIENTES</span><strong>{formatSize(noImageTotal)}</strong><small>{noImageTotal ? "Algunos juegos esperan imagen" : "Toda la colección tiene imagen"}</small></div><div className="stat-status"><span/></div></div><div className="stat-card"><div className="stat-icon amber"><HardDrive size={17}/></div><div><span>SISTEMAS DETECTADOS</span><strong>{systems.length}</strong><small>carpetas de emuladores</small></div><div className="stat-device"><Disc3 size={29}/></div></div></section>
            {error && <div className="error-banner"><AlertCircle size={16}/><span>{error}</span><button onClick={() => setError("")}><X size={15}/></button></div>}
            {!systems.length ? <div className="no-systems"><Gamepad2 size={25}/><div><strong>No encontré emuladores todavía</strong><span>Elige la carpeta que contiene las carpetas de tus sistemas.</span></div><button className="secondary-button" onClick={chooseRoot}>Elegir otra carpeta</button></div> : <>
              <div className="toolbar"><div className="search-box"><Search size={16}/><input placeholder="Buscar un juego..." value={search} onChange={e => setSearch(e.target.value)}/><kbd>⌘ K</kbd></div><div className="filter-group"><button className={filter === "all" ? "filter-active" : ""} onClick={() => setFilter("all")}>Todos <span>{selected?.gameCount ?? 0}</span></button><button className={filter === "missing" ? "filter-active" : ""} onClick={() => setFilter("missing")}><span className="mini-dot"/>Sin carátula <span>{selected?.missingImages ?? 0}</span></button></div><button className="secondary-button sort-button" onClick={() => setSortBy(value => value === "name" ? "file" : "name")} title="Cambiar orden"><ArrowUpDown size={13}/>{sortBy === "name" ? "Nombre" : "Archivo"}</button><button className="secondary-button view-toggle" onClick={() => setViewMode(value => value === "grid" ? "list" : "grid")} title="Cambiar vista"><LayoutGrid size={13}/>{viewMode === "grid" ? "Cuadrícula" : "Lista"}</button><div className="view-label">{formatSize(visibleGames.length)} juegos</div><button className="secondary-button" onClick={searchMissingCovers} disabled={Boolean(batchProgress) || !noImageTotal}><Sparkles size={13}/> Buscar faltantes</button></div>
              {batchProgress && <div className="batch-progress"><span><LoaderCircle size={14} className="spin"/> Buscando carátulas: {batchProgress.done} de {batchProgress.total}</span><div><i style={{ width: `${batchProgress.total ? batchProgress.done / batchProgress.total * 100 : 0}%` }}/></div></div>}
              <div className={`games-grid ${viewMode === "list" ? "list-mode" : ""}`}>{visibleGames.map(game => <GameCard key={game.id} game={game} onImage={() => startImage(game)} onRemove={() => removeGame(game)} markedNoCover={markedNoCover.includes(game.fileName)}/>)}</div>
              {!visibleGames.length && <div className="empty-state"><div><Search size={20}/></div><strong>No hay juegos para mostrar</strong><span>{filter === "missing" ? "¡Todos los juegos de este sistema tienen carátula!" : "Prueba otra búsqueda o añade un juego a tu colección."}</span></div>}
            </>}
          </>}
        </div> : <div className="content notes-content"><section className="page-heading"><div><div className="eyebrow">TU PRÓXIMA MARATÓN <span className="eyebrow-line"/></div><h1>Lista de pendientes<span className="heading-period">.</span></h1><p>Apunta los juegos que quieres añadir y márcalos cuando ya estén en tu consola.</p></div><div className="note-progress"><span>{notes.filter(n => n.done).length}/{notes.length} completados</span><div><i style={{ width: `${notes.length ? notes.filter(n => n.done).length / notes.length * 100 : 0}%` }}/></div></div></section><form className="note-composer" onSubmit={e => { e.preventDefault(); addNote(); }}><div className="composer-icon"><Pencil size={17}/></div><input value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="¿Qué juego quieres añadir?"/><button className="primary-button" disabled={!noteDraft.trim()}><Plus size={16}/> Añadir a la lista</button></form><div className="notes-heading"><span>JUEGOS POR AÑADIR</span><span>{notes.filter(n => !n.done).length} pendientes</span></div><div className="notes-list">{notes.map(note => <div className={`note-row ${note.done ? "done" : ""}`} key={note.id}><button className="note-check" onClick={() => { setNotes(n => n.map(item => item.id === note.id ? { ...item, done: !item.done } : item)); setNotesLoaded(true); }} aria-label={note.done ? "Marcar pendiente" : "Marcar completado"}>{note.done && <Check size={14}/>}</button><span>{note.text}</span><button className="note-delete" onClick={() => { setNotes(n => n.filter(item => item.id !== note.id)); setNotesLoaded(true); }} aria-label="Eliminar"><X size={15}/></button></div>)}{!notes.length && <div className="empty-state notes-empty"><div><ListTodo size={20}/></div><strong>Tu lista empieza aquí</strong><span>Anota esos juegos que tienes ganas de probar.</span></div>}</div><div className="note-tip"><Sparkles size={15}/><span>Consejo: puedes añadir juegos a la lista antes de tener la microSD conectada.</span></div></div>}
      </main>

      {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><section className="modal"><div className="modal-header"><div><div className="eyebrow">{modal === "add" ? "AMPLÍA TU COLECCIÓN" : "PERSONALIZA TU CATÁLOGO"}</div><h2>{modal === "add" ? "Añadir un juego" : "Carátula del juego"}</h2></div><button className="icon-button" onClick={() => setModal(null)}><X size={17}/></button></div>
        {modal === "add" ? <div className="modal-body"><label className="field-label">SISTEMA DESTINO</label><div className="selected-system"><Gamepad2 size={17}/><strong>{selected?.name}</strong><span>Se guardará en este emulador</span></div><label className="field-label">ARCHIVO DEL JUEGO</label><button className="file-picker" onClick={chooseRom}>{romPath ? <><Disc3 size={17}/><span>{romPath.split(/[\\/]/).pop()}</span><CheckCircle2 size={16} className="picker-check"/></> : <><Plus size={17}/><span>Selecciona el archivo de juego</span><ChevronRight size={15}/></>}</button><label className="field-label">NOMBRE DEL JUEGO</label><input className="text-field" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Castlevania: Symphony of the Night"/><div className="artwork-heading"><label className="field-label">CARÁTULA <span>OPCIONAL</span></label><button className="text-button" onClick={() => romPath && findArtwork(title || cleanTitle(romPath.split(/[\\/]/).pop() || ""), romPath.split(/[\\/]/).pop() || "")} disabled={!romPath || imageStatus === "searching"}>{imageStatus === "searching" ? <LoaderCircle size={14} className="spin"/> : <Sparkles size={14}/>}Buscar en Libretro</button></div>{imagePreview ? <div className="image-preview-row"><img src={imagePreview} alt="Vista previa"/><div><strong>{imageStatus === "found" ? "Carátula encontrada" : "Imagen seleccionada"}</strong><span>Se ajustará a 512 × 512 px al guardarla.</span></div><button className="icon-button" onClick={() => { setImageBytes(null); setImagePreview(""); }}><X size={15}/></button></div> : <button className="image-drop" onClick={() => fileInput.current?.click()}><ImageIcon size={17}/><span>{imageStatus === "missing" ? "No encontramos carátula. Sube una imagen manualmente." : "O sube tu propia imagen"}</span><ChevronRight size={15}/></button>}<input type="file" ref={fileInput} accept="image/png,image/jpeg,image/webp" hidden onChange={e => e.target.files?.[0] && selectImage(e.target.files[0])}/>{imageStatus === "missing" && <div className="inline-info"><AlertCircle size={14}/> Revisa el nombre del sistema o selecciona una imagen desde tu equipo.</div>}<div className="modal-footer"><span><CheckCircle2 size={14}/> El juego se copiará a la microSD</span><button className="primary-button" onClick={saveNewGame} disabled={!romPath || loading}>{loading ? <LoaderCircle size={15} className="spin"/> : <Plus size={16}/>} Añadir juego</button></div></div> : <div className="modal-body"><div className="target-game"><div className="target-cover">{targetGame?.imagePath ? <img src={convertFileSrc(targetGame.imagePath)} alt=""/> : <Gamepad2 size={20}/>}</div><div><span>JUEGO SELECCIONADO</span><strong>{targetGame?.title}</strong></div></div><div className="artwork-search-card"><div className="search-art-icon"><Sparkles size={17}/></div><div><strong>Buscar en Libretro Thumbnails</strong><span>Carátulas PNG de la comunidad para tu consola</span></div><button className="secondary-button" onClick={() => targetGame && findArtwork(targetGame.title, targetGame.fileName)} disabled={imageStatus === "searching"}>{imageStatus === "searching" ? <LoaderCircle size={14} className="spin"/> : "Buscar"}</button></div>{artworkProgress && <div className="inline-info"><LoaderCircle size={14} className="spin"/>{artworkProgress}</div>}{artworkMatches.length > 1 && <div className="candidate-list"><div className="field-label">VARIAS COINCIDENCIAS · ELIGE UNA</div>{artworkMatches.map(match => <button key={match.path} onClick={() => chooseArtwork(match)}><span>{match.name}</span><small>{Math.round((1-match.score)*100)}% · {match.name.match(/\(([^)]*)\)/)?.[1] || "Otra región"}</small></button>)}</div>}{imagePreview ? <div className="artwork-large-preview"><img src={imagePreview} alt="Carátula seleccionada"/><div><strong>{imageStatus === "found" ? "¡Encontramos una carátula!" : "Vista previa"}<span className="found-badge"><Check size={11}/> Lista</span></strong><span>Se redimensionará a 512 × 512 px y se guardará en images/.</span></div></div> : <button className="image-drop image-drop-large" onClick={chooseCustomImage}><ImageIcon size={18}/><span>{imageStatus === "missing" ? "Sin resultados. Selecciona una imagen de tu equipo." : "O selecciona una imagen desde tu equipo"}</span><ChevronRight size={15}/></button>}{imageStatus === "missing" && <div className="inline-info"><AlertCircle size={14}/> No hay una coincidencia exacta en Libretro. Puedes añadir una imagen manualmente.</div>}<button className="text-button no-cover-button" onClick={markCurrentGameNoCover}><X size={13}/> Marcar como sin carátula</button><div className="modal-footer"><span><ImageIcon size={14}/> Formato PNG · 512 × 512 px</span><button className="primary-button" disabled={!imageBytes || loading} onClick={saveGameImage}>{loading ? <LoaderCircle size={15} className="spin"/> : <Check size={16}/>} Guardar carátula</button></div></div>}
      </section></div>}
      {notice && <div className="toast"><CheckCircle2 size={16}/>{notice}</div>}
    </div>
  );
}

function GameCard({ game, onImage, onRemove, markedNoCover }: { game: Game; onImage: () => void; onRemove: () => void; markedNoCover: boolean }) {
  return <article className="game-card"><div className={`game-cover ${game.hasImage ? "has-art" : "no-art"}`}>{game.imagePath ? <img src={imageUrl(game.imagePath)} alt={`Carátula de ${game.title}`} loading="lazy"/> : <><div className="cover-glow"/><Gamepad2 size={29}/><span>{game.title.slice(0, 1).toUpperCase()}</span></>}<div className="cover-hover"><button onClick={onImage}><ImageIcon size={14}/>{game.hasImage ? "Cambiar imagen" : "Añadir carátula"}</button></div>{!game.hasImage && <span className="missing-badge"><ImageIcon size={10}/> {markedNoCover ? "Sin carátula" : "Sin imagen"}</span>}</div><div className="game-info"><div className="game-title" title={game.title}>{game.title}</div><div className="game-meta"><span>{game.fileName.split(".").pop()?.toUpperCase()}</span><span className="meta-divider"/>{game.hasImage ? <span className="meta-art"><Check size={11}/> Carátula</span> : <span className="meta-missing">{markedNoCover ? "Sin carátula" : "Pendiente"}</span>}<button className="remove-game" title="Quitar del catálogo" onClick={onRemove}><Trash2 size={13}/></button></div></div></article>;
}

export default App;

import { invoke } from "@tauri-apps/api/core";
import type { Game, System } from "./types.ts";

/** Envoltorios tipados de los comandos Rust. Un solo lugar para los nombres y argumentos. */

export const scanSd = (root: string) => invoke<System[]>("scan_sd", { root });

export const listGames = (systemPath: string) => invoke<Game[]>("list_games", { systemPath });

export type NewGameInput = {
  sourcePath: string;
  title: string;
  imageBytes: number[] | null;
  /** Si la ROM viene en .zip/.7z, copia solo el archivo de dentro. */
  extract?: boolean;
};

export const addGames = (systemPath: string, games: NewGameInput[]) =>
  invoke<Game[]>("add_games", { systemPath, games });

// Compatibilidad con el flujo anterior (un solo juego).
export const addGame = (systemPath: string, sourcePath: string, title: string, imageBytes: number[] | null) =>
  addGames(systemPath, [{ sourcePath, title, imageBytes }]).then((games) => games[0]);

export const removeGame = (systemPath: string, fileName: string) =>
  invoke<void>("remove_game", { systemPath, fileName });

export const renameGame = (systemPath: string, fileName: string, title: string) =>
  invoke<void>("rename_game", { systemPath, fileName, title });

/** Reescribe `filelist.csv` en este orden, que es el que muestra la consola. */
export const reorderGames = (systemPath: string, order: string[]) =>
  invoke<void>("reorder_games", { systemPath, order });

/** Juego marcado como favorito en la consola (`cubegm/favorites.lst`). */
export type Favorite = { system: string; fileName: string };

export const readFavorites = () => invoke<Favorite[]>("read_favorites");

export type SavesSummary = {
  owned: number;
  ownedBytes: number;
  orphans: number;
  orphanBytes: number;
};

export type SavesReport = { folder: string; files: number; bytes: number };

/** Ficha de la tarjeta (`.bunko-card.json`): identifica la consola. */
export type CardInfo = { id: string; name: string; profile: string };

export const cardInfo = () => invoke<CardInfo>("card_info");

export const updateCard = (name: string, profile: string) =>
  invoke<CardInfo>("update_card", { name, profile });

export const savesSummary = () => invoke<SavesSummary>("saves_summary");

/** Partida de un juego que está en la tarjeta. */
export type SaveEntry = {
  relative: string;
  bytes: number;
  kind: "save" | "state";
  system: string;
  title: string;
};

export const listSaves = () => invoke<SaveEntry[]>("list_saves");

/** Copia al PC las partidas elegidas (todas si `files` no se indica). */
export const backupSaves = (workDir: string, label: string, files?: string[]) =>
  invoke<SavesReport>("backup_saves", { workDir, label, files: files ?? null });

export type BackupFile = {
  relative: string;
  bytes: number;
  system: string;
  title: string;
  /** Su juego está en la tarjeta: solo así se puede restaurar. */
  onCard: boolean;
  /** Reemplazaría una partida que ya está en la tarjeta. */
  replaces: boolean;
};

export type BackupInfo = {
  folder: string;
  label: string;
  kind: "partidas" | "sobrantes" | "antes-de-restaurar";
  files: BackupFile[];
};

/** Copias de esta tarjeta, de la más reciente a la más antigua. */
export const listBackups = (workDir: string) =>
  invoke<BackupInfo[]>("list_backups", { workDir });

export const restoreSaves = (workDir: string, folder: string, files: string[], label: string) =>
  invoke<SavesReport>("restore_saves", { workDir, folder, files, label });

export const openBackupsFolder = (workDir: string) =>
  invoke<void>("open_backups_folder", { workDir });

/** Mueve al PC las partidas de juegos que ya no están y las quita de la tarjeta. */
export const cleanOrphanSaves = (workDir: string, label: string) =>
  invoke<SavesReport>("clean_orphan_saves", { workDir, label });

export const readSagas = () => invoke<string>("read_sagas");

export const writeSagas = (content: string) => invoke<void>("write_sagas", { content });

export const saveImage = (systemPath: string, fileName: string, imageBytes: number[]) =>
  invoke<string>("save_image", { systemPath, fileName, imageBytes });

export const openFolder = (systemPath: string) =>
  invoke<void>("open_folder", { systemPath });

export type DiskSpace = { freeBytes: number; totalBytes: number };

export const getDiskSpace = () => invoke<DiskSpace>("disk_space");

export const readNotes = () => invoke<string>("read_notes");

export const writeNotes = (content: string) => invoke<void>("write_notes", { content });

/** Caché en disco (evita el límite de localStorage). */
export const readCache = (key: string) => invoke<string | null>("read_cache", { key });

export const writeCache = (key: string, value: string) => invoke<void>("write_cache", { key, value });

export const unmountSd = () => invoke<void>("unmount_sd");

/** Sonido del menú de la consola, según `cubegm/setting.xml`. */
export type ConsoleSound = {
  slot: string;
  file: string;
  exists: boolean;
  bytes: number;
  /** Bunko lo cambió y guarda el original en la carpeta de trabajo. */
  customized: boolean;
};

export const consoleSounds = (workDir: string) =>
  invoke<ConsoleSound[]>("console_sounds", { workDir });

export const readConsoleSound = (slot: string) =>
  invoke<ArrayBuffer>("read_console_sound", { slot });

/** `bytes`: un WAV ya convertido. `sourcePath`: un MP3 del PC (la música). */
export const replaceConsoleSound = (
  workDir: string,
  slot: string,
  source: { bytes: number[] } | { sourcePath: string },
) =>
  invoke<ConsoleSound>("replace_console_sound", {
    workDir,
    slot,
    bytes: "bytes" in source ? source.bytes : null,
    sourcePath: "sourcePath" in source ? source.sourcePath : null,
  });

export const restoreConsoleSound = (workDir: string, slot: string) =>
  invoke<void>("restore_console_sound", { workDir, slot });

/** Fondo de pantalla completa de `cubegm/UI_Res.cpd`. */
export type ConsoleBackground = { name: string; customized: boolean };

export const consoleBackgrounds = (workDir: string) =>
  invoke<ConsoleBackground[]>("console_backgrounds", { workDir });

/** Miniatura JPEG de 320×240. */
export const consoleBackgroundPreview = (name: string) =>
  invoke<ArrayBuffer>("console_background_preview", { name });

export const replaceConsoleBackground = (workDir: string, name: string, sourcePath: string) =>
  invoke<void>("replace_console_background", { workDir, name, sourcePath });

export const restoreConsoleBackground = (workDir: string, name: string) =>
  invoke<void>("restore_console_background", { workDir, name });

/** Logo de arranque (`boot`) o apagado (`poweroff`) de la consola. */
export type ConsoleLogo = { id: string; file: string; width: number; height: number; customized: boolean };

export const consoleLogos = (workDir: string) => invoke<ConsoleLogo[]>("console_logos", { workDir });

/** El logo en PNG, a su tamaño real. */
export const consoleLogoPreview = (id: string) => invoke<ArrayBuffer>("console_logo_preview", { id });

export const replaceConsoleLogo = (workDir: string, id: string, sourcePath: string) =>
  invoke<void>("replace_console_logo", { workDir, id, sourcePath });

export const restoreConsoleLogo = (workDir: string, id: string) =>
  invoke<void>("restore_console_logo", { workDir, id });

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

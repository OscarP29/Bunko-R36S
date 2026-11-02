/** Funciones puras sobre la lista de pendientes. */
import { guessLibretroSystem } from "./rom.ts";
import type { Note } from "./types.ts";

/** Consola de una nota: la indicada o la que va entre paréntesis al final del texto. */
export const noteSystem = (note: Note) =>
  note.system?.trim() || note.text.match(/\(([^)]+)\)\s*$/)?.[1]?.trim() || "";

/**
 * Si una nota corresponde al emulador de `folder` o no tiene consola.
 * Compara por carpeta y por nombre de consola en Libretro, así «GBA» y
 * «Game Boy Advance» se reconocen como el mismo sistema.
 */
export function noteFitsSystem(note: Note, folder: string) {
  const candidates = [note.folder?.trim(), noteSystem(note)].filter(Boolean) as string[];
  if (!candidates.length) return true;
  const key = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = guessLibretroSystem(folder);
  return candidates.some(
    (candidate) => key(candidate) === key(folder) || guessLibretroSystem(candidate) === target,
  );
}

/** Categorías sugeridas al escribir a mano, además de las que ya usa la lista. */
export const DEFAULT_NOTE_CATEGORIES = [
  "Acción",
  "Arcade",
  "Aventura",
  "Beat 'em up",
  "Carreras",
  "Deportes",
  "Estrategia",
  "Lucha",
  "Metroidvania",
  "Musical",
  "Party",
  "Plataformas",
  "Puzle",
  "Reemplazar",
  "RPG",
  "JRPG",
  "Rol táctico",
  "Shoot 'em up",
  "Shooter",
  "Sigilo",
  "Simulación",
  "Survival horror",
  "Run and gun",
  "Roguelike",
  "Visual novel",
];

const titleKey = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Títulos de juego que contienen `query`, sacados de los nombres de Libretro
 * sin etiquetas de región ni versión: «Chrono Trigger (USA)» → «Chrono Trigger».
 */
export function gameTitleSuggestions(names: string[], query: string, limit = 40): string[] {
  const needle = titleKey(query);
  if (needle.length < 2) return [];
  const seen = new Set<string>();
  const starts: string[] = [];
  const contains: string[] = [];
  for (const name of names) {
    const title = name.replace(/\s*[([][^)\]]*[)\]]/g, "").trim();
    const key = titleKey(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (key.startsWith(needle)) starts.push(title);
    else if (key.includes(needle)) contains.push(title);
  }
  const byName = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" });
  return [...starts.sort(byName), ...contains.sort(byName)].slice(0, limit);
}

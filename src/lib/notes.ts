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

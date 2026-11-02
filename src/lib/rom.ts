/** Funciones puras de nombres de ROM. No dependen de Tauri ni del DOM. */

/** Quita la extensión final: "Juego.gba" → "Juego". */
export const stem = (file: string) => file.replace(/\.[^.]+$/, "");

/** Nombre legible a partir de un archivo: "Mi_juego-2.gba" → "Mi juego 2". */
export const cleanTitle = (file: string) =>
  stem(file).replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Normaliza un nombre de ROM para compararlo con los títulos de Libretro:
 * quita etiquetas entre paréntesis/corchetes, acentos y todo lo que no sea
 * letras o números.
 */
export function cleanRomName(fileName: string): string {
  return stem(fileName)
    .replace(/[([][^)\]]*[)\]]/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[&*/:<>?\\|]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Libretro sustituye estos caracteres por guion bajo en sus archivos. */
export const libretroSafeName = (name: string) => name.replace(/[&*/:<>?\\|]/g, "_");

export const makeArtworkUrl = (system: string, category: string, name: string) =>
  `https://thumbnails.libretro.com/${encodeURIComponent(system)}/${category}/${encodeURIComponent(
    libretroSafeName(name),
  )}.png`;

/** Prioridad de regiones al ordenar coincidencias: España, Europa, USA/Europa, USA, World. */
export function regionRank(name: string): number {
  const normalized = name.toLowerCase();
  if (/\(spain\)/.test(normalized)) return 0;
  if (/\(europe\)/.test(normalized)) return 1;
  if (/\(usa, europe\)/.test(normalized)) return 2;
  if (/\(usa\)/.test(normalized)) return 3;
  if (/\(world\)/.test(normalized)) return 4;
  return 5;
}

/**
 * Traduce el nombre de la carpeta del emulador al nombre exacto de la consola
 * en Libretro. Para añadir un sistema, agrega una entrada a `names`; la clave es
 * el nombre de carpeta en minúsculas y sin signos ni espacios.
 */
export function guessLibretroSystem(folder: string): string {
  const key = folder.toLowerCase().replace(/[^a-z0-9]/g, "");
  const names: Record<string, string> = {
    gb: "Nintendo - Game Boy",
    gameboy: "Nintendo - Game Boy",
    gbc: "Nintendo - Game Boy Color",
    gameboycolor: "Nintendo - Game Boy Color",
    gba: "Nintendo - Game Boy Advance",
    gameboyadvance: "Nintendo - Game Boy Advance",
    nds: "Nintendo - Nintendo DS",
    nintendods: "Nintendo - Nintendo DS",
    nes: "Nintendo - Nintendo Entertainment System",
    nintendoentertainmentsystem: "Nintendo - Nintendo Entertainment System",
    famicom: "Nintendo - Nintendo Entertainment System",
    snes: "Nintendo - Super Nintendo Entertainment System",
    snes9x: "Nintendo - Super Nintendo Entertainment System",
    supernintendo: "Nintendo - Super Nintendo Entertainment System",
    n64: "Nintendo - Nintendo 64",
    psx: "Sony - PlayStation",
    ps1: "Sony - PlayStation",
    psp: "Sony - PlayStation Portable",
    genesis: "Sega - Mega Drive - Genesis",
    megadrive: "Sega - Mega Drive - Genesis",
    sms: "Sega - Master System - Mark III",
    gamegear: "Sega - Game Gear",
    dreamcast: "Sega - Dreamcast",
    saturn: "Sega - Saturn",
    arcade: "MAME",
    mame: "MAME",
    fbneo: "FB Neo - Arcade Games",
    wonderswan: "Bandai - WonderSwan",
    wonderswancolor: "Bandai - WonderSwan Color",
    pokemini: "Nintendo - Pokemon Mini",
    lynx: "Atari - Lynx",
    atari2600: "Atari - 2600",
    pce: "NEC - PC Engine - TurboGrafx 16",
    pcengine: "NEC - PC Engine - TurboGrafx 16",
  };
  return names[key] || folder.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
}

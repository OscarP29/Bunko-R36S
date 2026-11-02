/** Qué hace cada sonido de `cubegm/setting.xml` en el menú de CubeGM. */
const SOUND_LABELS: Record<string, string> = {
  bgm: "Música de fondo",
  effect0: "Moverse por el menú",
  effect1: "Abrir un juego",
  effect2: "Asignar teclas",
  effect3: "Confirmar",
  effect4: "Transición vertical",
  effect5: "Transición horizontal",
  effect6: "Volver",
  effect7: "Ventana emergente",
  effect8: "Recorrer la lista",
};

export const soundLabel = (slot: string) => SOUND_LABELS[slot] ?? `Efecto ${slot.replace(/\D/g, "")}`;

/** La música es un MP3 que se copia tal cual; los efectos se convierten a WAV. */
export const isMusicSlot = (file: string) => file.toLowerCase().endsWith(".mp3");

type BackgroundGroup = "Menú" | "Sistemas" | "Multimedia" | "Ajustes";

/** Qué pantalla de CubeGM usa cada fondo de `UI_Res.cpd`. */
const BACKGROUNDS: Record<string, { label: string; group: BackgroundGroup }> = {
  AllEMU: { label: "Todos los juegos", group: "Menú" },
  FAVORITE: { label: "Favoritos", group: "Menú" },
  HISTORY: { label: "Recientes", group: "Menú" },
  DOWNLOAD: { label: "Descargas", group: "Menú" },
  ATARI: { label: "Atari", group: "Sistemas" },
  FC: { label: "NES / Famicom", group: "Sistemas" },
  SFC: { label: "Super Nintendo", group: "Sistemas" },
  GB: { label: "Game Boy", group: "Sistemas" },
  GBC: { label: "Game Boy Color", group: "Sistemas" },
  GBA: { label: "Game Boy Advance", group: "Sistemas" },
  MD: { label: "Mega Drive", group: "Sistemas" },
  SMS: { label: "Master System", group: "Sistemas" },
  GG: { label: "Game Gear", group: "Sistemas" },
  PCE: { label: "PC Engine", group: "Sistemas" },
  NGPC: { label: "Neo Geo Pocket", group: "Sistemas" },
  SWC: { label: "WonderSwan", group: "Sistemas" },
  PS1: { label: "PlayStation", group: "Sistemas" },
  MAME: { label: "Arcade", group: "Sistemas" },
  MovieBg: { label: "Vídeos", group: "Multimedia" },
  MusicBg: { label: "Música", group: "Multimedia" },
  PhotoBg: { label: "Fotos", group: "Multimedia" },
  "E-BookBg": { label: "Libros", group: "Multimedia" },
  SetVolume: { label: "Volumen", group: "Ajustes" },
  SetLight: { label: "Brillo", group: "Ajustes" },
  SetScreen: { label: "Pantalla", group: "Ajustes" },
  SetLanguage: { label: "Idioma", group: "Ajustes" },
  SetKeyMap: { label: "Asignar teclas", group: "Ajustes" },
  KeyMapping: { label: "Mapa de teclas", group: "Ajustes" },
  SetFacRest: { label: "Restablecer", group: "Ajustes" },
};

const GROUP_ORDER: BackgroundGroup[] = ["Menú", "Sistemas", "Multimedia", "Ajustes"];

export function backgroundInfo(name: string) {
  const stem = name.replace(/\.raw$/i, "");
  return BACKGROUNDS[stem] ?? { label: stem, group: "Ajustes" as BackgroundGroup };
}

/** Agrupa los fondos en el orden del menú, conservando el del archivo dentro de cada grupo. */
export function groupBackgrounds<T extends { name: string }>(items: T[]) {
  const order = Object.keys(BACKGROUNDS);
  const rank = (item: T) => {
    const index = order.indexOf(item.name.replace(/\.raw$/i, ""));
    return index === -1 ? order.length : index;
  };
  return GROUP_ORDER.map((group) => ({
    group,
    items: items.filter((item) => backgroundInfo(item.name).group === group).sort((a, b) => rank(a) - rank(b)),
  })).filter((section) => section.items.length > 0);
}

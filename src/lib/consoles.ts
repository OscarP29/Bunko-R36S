/**
 * Perfiles de consola: cada firmware guarda favoritos y partidas en sitios
 * distintos. Bunko solo usa esas funciones con un perfil que las conozca.
 */
export type ConsoleProfileId = "r36sx" | "arkos" | "rocknix" | "muos";

export type ConsoleProfile = {
  id: ConsoleProfileId;
  label: string;
  /** Firmware o carpeta que lo identifica, para la descripción. */
  detail: string;
  available: boolean;
  /** Lee `cubegm/favorites.lst` y gestiona `cubegm/saves` y `cubegm/states`. */
  cubegm: boolean;
};

export const CONSOLE_PROFILES: readonly ConsoleProfile[] = [
  { id: "r36sx", label: "R36SX", detail: "Clon con firmware CubeGM", available: true, cubegm: true },
  { id: "arkos", label: "ArkOS", detail: "R36S original", available: false, cubegm: false },
  { id: "rocknix", label: "ROCKNIX", detail: "R36S original", available: false, cubegm: false },
  { id: "muos", label: "muOS", detail: "Otras portátiles", available: false, cubegm: false },
];

/** Perfil guardado en la ficha de la tarjeta; uno desconocido no habilita nada. */
export const consoleProfile = (id: string | undefined) =>
  CONSOLE_PROFILES.find((profile) => profile.id === id);

/** Nombre de carpeta para una copia: `partidas-2026-11-02_1530`. */
export function backupLabel(prefix: string, date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${prefix}-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

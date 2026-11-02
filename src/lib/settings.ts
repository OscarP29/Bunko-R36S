import { readLocalJson, writeLocalJson } from "./store.ts";

const SETTINGS_KEY = "r36s-manager-settings";

export type ThemeMode = "light" | "dark" | "system";

export type Settings = {
  theme: ThemeMode;
  /** Multiplicador de todos los tamaños de letra (`--font-scale`). */
  fontScale: number;
  /** Extrae sin preguntar los .zip/.7z que no conviene copiar comprimidos. */
  autoExtract: boolean;
  /** Carpeta del PC para las copias de seguridad. Vacía = Documentos\Bunko. */
  workDir: string;
};

export const FONT_SCALES = [
  { value: 1, label: "Compacta" },
  { value: 1.2, label: "Normal" },
  { value: 1.35, label: "Grande" },
  { value: 1.5, label: "Muy grande" },
] as const;

export const DEFAULT_SETTINGS: Settings = {
  theme: "light",
  fontScale: 1.2,
  autoExtract: false,
  workDir: "",
};

const THEMES: readonly ThemeMode[] = ["light", "dark", "system"];

export function loadSettings(): Settings {
  const saved = readLocalJson<Partial<Settings>>(SETTINGS_KEY);
  return {
    theme: THEMES.includes(saved?.theme as ThemeMode)
      ? (saved?.theme as ThemeMode)
      : DEFAULT_SETTINGS.theme,
    fontScale: FONT_SCALES.some((scale) => scale.value === saved?.fontScale)
      ? (saved?.fontScale as number)
      : DEFAULT_SETTINGS.fontScale,
    autoExtract:
      typeof saved?.autoExtract === "boolean"
        ? saved.autoExtract
        : DEFAULT_SETTINGS.autoExtract,
    workDir: typeof saved?.workDir === "string" ? saved.workDir : DEFAULT_SETTINGS.workDir,
  };
}

/** Tamaño contiguo en `FONT_SCALES`; se queda en el extremo si no hay más. */
export function stepFontScale(current: number, step: 1 | -1): number {
  const index = FONT_SCALES.findIndex((scale) => scale.value === current);
  const next = Math.min(Math.max(index + step, 0), FONT_SCALES.length - 1);
  return FONT_SCALES[next].value;
}

export const saveSettings = (settings: Settings) =>
  writeLocalJson(SETTINGS_KEY, settings);

export const systemThemeQuery = () =>
  window.matchMedia("(prefers-color-scheme: dark)");

export function applySettings({ theme, fontScale }: Settings) {
  const dark =
    theme === "dark" || (theme === "system" && systemThemeQuery().matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.style.setProperty("--font-scale", String(fontScale));
}

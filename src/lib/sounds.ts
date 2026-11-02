/// <reference types="vite/client" />

/**
 * Sonidos de la interfaz. Los archivos van en `src/assets/sounds/` con estos
 * nombres y cualquier extensión de audio (`.mp3`, `.wav`, `.ogg`):
 *
 * - `interaccion`: al pulsar un botón.
 * - `exito`: cuando aparece un aviso (juego añadido, carátula guardada…).
 *
 * Si falta un archivo, ese sonido simplemente no suena.
 */
export type SoundName = "interaccion" | "exito";

export type SoundMode = "all" | "alerts" | "off";

const files = import.meta.glob("../assets/sounds/*.{mp3,wav,ogg}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const urls = new Map<string, string>(
  Object.entries(files).map(([path, url]) => [
    path.split("/").pop()!.replace(/\.[^.]+$/, "").toLowerCase(),
    url,
  ]),
);

const cache = new Map<SoundName, HTMLAudioElement>();

/** Volumen de cada sonido: los clics se oyen más bajo que los avisos. */
const VOLUME: Record<SoundName, number> = { interaccion: 0.35, exito: 0.6 };

export function playSound(name: SoundName) {
  const url = urls.get(name);
  if (!url) return;
  let audio = cache.get(name);
  if (!audio) {
    audio = new Audio(url);
    audio.volume = VOLUME[name];
    cache.set(name, audio);
  }
  // Un clon permite que dos clics seguidos suenen sin cortarse.
  const instance = audio.paused ? audio : (audio.cloneNode() as HTMLAudioElement);
  instance.volume = VOLUME[name];
  instance.currentTime = 0;
  instance.play().catch(() => {
    // El navegador puede bloquear el audio hasta la primera interacción.
  });
}

/** Si un modo permite un sonido concreto. */
export const soundAllowed = (mode: SoundMode, name: SoundName) =>
  mode === "all" || (mode === "alerts" && name === "exito");

import { useEffect, useRef, useState } from "react";
import {
  consoleSounds,
  readConsoleSound,
  replaceConsoleSound,
  restoreConsoleSound,
  type ConsoleSound,
} from "../lib/backend.ts";
import { toConsoleWav } from "../lib/wav.ts";

type ConsoleSoundsOptions = {
  /** Hay tarjeta R36SX conectada y carpeta de trabajo. */
  enabled: boolean;
  cardId: string | undefined;
  workDir: string;
};

/** Sonidos del menú de la consola: escuchar, cambiar y volver al original. */
export function useConsoleSounds({ enabled, cardId, workDir }: ConsoleSoundsOptions) {
  const [sounds, setSounds] = useState<ConsoleSound[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  async function refresh() {
    if (!enabled) return setSounds(null);
    try {
      setSounds(await consoleSounds(workDir));
    } catch (e) {
      setSounds([]);
      setResult({ ok: false, text: String(e) });
    }
  }

  useEffect(() => {
    setResult(null);
    void refresh();
  }, [enabled, cardId, workDir]);

  function stop() {
    if (!audio.current) return;
    audio.current.pause();
    URL.revokeObjectURL(audio.current.src);
    audio.current = null;
    setPlaying(null);
  }

  useEffect(() => stop, []);

  async function play(slot: string) {
    const again = playing === slot;
    stop();
    if (again) return;
    try {
      const bytes = await readConsoleSound(slot);
      const element = new Audio(URL.createObjectURL(new Blob([bytes])));
      element.onended = stop;
      audio.current = element;
      setPlaying(slot);
      await element.play();
    } catch (e) {
      stop();
      setResult({ ok: false, text: `No se pudo reproducir: ${e}` });
    }
  }

  async function run(slot: string, task: () => Promise<unknown>, done: string) {
    stop();
    setBusy(slot);
    setResult(null);
    try {
      await task();
      setResult({ ok: true, text: done });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  return {
    sounds,
    busy,
    playing,
    result,
    play,
    replaceEffect: (slot: string, file: File) =>
      run(
        slot,
        async () => {
          const wav = await toConsoleWav(file);
          await replaceConsoleSound(workDir, slot, { bytes: Array.from(wav) });
        },
        "Sonido cambiado en la consola",
      ),
    replaceMusic: (slot: string, sourcePath: string) =>
      run(slot, () => replaceConsoleSound(workDir, slot, { sourcePath }), "Música copiada a la consola"),
    restore: (slot: string) =>
      run(slot, () => restoreConsoleSound(workDir, slot), "Sonido original restaurado"),
  };
}

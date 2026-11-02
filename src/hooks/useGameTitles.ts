import { useEffect, useState } from "react";
import { libretroSystemOf, loadArtworkIndex } from "../lib/artworkSource.ts";
import type { System } from "../lib/types.ts";

export type GameTitlesStatus = "idle" | "loading" | "ready" | "error";

/**
 * Nombres de juegos de la consola elegida, para autocompletar la lista de
 * pendientes. Reutiliza el índice de carátulas de Libretro (y su caché).
 */
export function useGameTitles(systems: System[], systemName: string) {
  const [names, setNames] = useState<string[]>([]);
  const [status, setStatus] = useState<GameTitlesStatus>("idle");
  const system = systems.find((candidate) => candidate.name === systemName);
  const libretroSystem = system ? libretroSystemOf(system) : "";

  useEffect(() => {
    setNames([]);
    if (!libretroSystem) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    loadArtworkIndex(libretroSystem, () => {})
      .then((files) => {
        if (cancelled) return;
        setNames(files.map((file) => file.name));
        setStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("Sin nombres para autocompletar", error);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [libretroSystem]);

  return { names, status };
}

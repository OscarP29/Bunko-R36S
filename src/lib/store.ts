import { isTauri } from "@tauri-apps/api/core";
import { readCache, writeCache } from "./backend.ts";

/**
 * Caché de datos grandes (índice de carátulas). En Tauri se guarda en el
 * directorio de caché de la app para no chocar con la cuota de localStorage;
 * en el navegador (modo dev con Vite) se usa localStorage y se ignora el fallo
 * por cuota, porque perder la caché solo implica volver a descargarla.
 */
export async function readCachedJson<T>(key: string): Promise<T | null> {
  try {
    const raw = isTauri() ? await readCache(key) : localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeCachedJson(key: string, value: unknown): Promise<void> {
  const raw = JSON.stringify(value);
  if (isTauri()) {
    try {
      await writeCache(key, raw);
      return;
    } catch {
      // Si el disco falla, se intenta localStorage como último recurso.
    }
  }
  try {
    localStorage.setItem(key, raw);
  } catch (error) {
    console.warn("No se pudo guardar la caché de carátulas", error);
  }
}

export const readLocalJson = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export const writeLocalJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

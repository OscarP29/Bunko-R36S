import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

/**
 * Peticiones a GitHub y a thumbnails.libretro.com.
 *
 * En Tauri se usa el plugin HTTP (lado Rust), que no depende de las cabeceras
 * CORS del servidor y respeta el scope configurado en `capabilities`. Si el
 * plugin falla, se reintenta con el `fetch` del webview.
 */
export async function webFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!isTauri()) return fetch(input, init);
  try {
    return await tauriFetch(input, init);
  } catch (error) {
    console.warn("Fallo el fetch vía plugin-http; reintentando desde el webview", error);
    return fetch(input, init);
  }
}

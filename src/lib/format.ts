import { convertFileSrc, isTauri } from "@tauri-apps/api/core";

/** URL para mostrar una imagen local dentro del webview. */
export const fileUrl = (path: string | null) =>
  path && isTauri() ? convertFileSrc(path) : "";

export const formatSize = (count: number) => new Intl.NumberFormat("es-CO").format(count);

import { convertFileSrc, isTauri } from "@tauri-apps/api/core";

/** URL para mostrar una imagen local dentro del webview. */
export const fileUrl = (path: string | null) =>
  path && isTauri() ? convertFileSrc(path) : "";

export const formatSize = (count: number) => new Intl.NumberFormat("es-CO").format(count);

/** En base 1024, como el Explorador de Windows, para que las cifras coincidan. */
export function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const size = new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: unit >= 3 ? 1 : 0,
  }).format(value);
  return `${size} ${units[unit]}`;
}

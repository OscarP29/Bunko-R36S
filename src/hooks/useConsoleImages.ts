import { useEffect, useRef, useState } from "react";

/** Imagen de la consola que Bunko puede cambiar y restaurar. */
type ConsoleImage = { customized: boolean };

type ConsoleImagesOptions<T extends ConsoleImage> = {
  /** Hay tarjeta R36SX conectada y carpeta de trabajo. */
  enabled: boolean;
  cardId: string | undefined;
  workDir: string;
  /** Identificador que entienden los comandos (nombre del fondo, id del logo). */
  keyOf: (item: T) => string;
  list: (workDir: string) => Promise<T[]>;
  preview: (key: string) => Promise<ArrayBuffer>;
  previewType: string;
  replace: (workDir: string, key: string, sourcePath: string) => Promise<void>;
  restore: (workDir: string, key: string) => Promise<void>;
  messages: { replaced: string; restored: string };
  /** Otras imágenes que cambian a la vez que `key` y necesitan nueva vista previa. */
  linked?: (key: string) => string[];
};

/** Imágenes de la consola (fondos, logos): vista previa, cambiar y volver al original. */
export function useConsoleImages<T extends ConsoleImage>(options: ConsoleImagesOptions<T>) {
  const { enabled, cardId, workDir } = options;
  const [items, setItems] = useState<T[] | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const urls = useRef<Record<string, string>>({});

  function setPreview(key: string, url: string | null) {
    if (urls.current[key]) URL.revokeObjectURL(urls.current[key]);
    if (url) urls.current[key] = url;
    else delete urls.current[key];
    setPreviews({ ...urls.current });
  }

  async function loadPreview(key: string) {
    try {
      const bytes = await options.preview(key);
      setPreview(key, URL.createObjectURL(new Blob([bytes], { type: options.previewType })));
    } catch {
      setPreview(key, null);
    }
  }

  async function refresh() {
    if (!enabled) return setItems(null);
    try {
      setItems(await options.list(workDir));
    } catch (e) {
      setItems([]);
      setResult({ ok: false, text: String(e) });
    }
  }

  useEffect(() => {
    setResult(null);
    void refresh();
  }, [enabled, cardId, workDir]);

  // Las vistas previas se cargan una vez por tarjeta, de una en una.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const list = await options.list(workDir).catch(() => []);
      for (const item of list) {
        if (cancelled) return;
        await loadPreview(options.keyOf(item));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, cardId]);

  useEffect(
    () => () => Object.values(urls.current).forEach((url) => URL.revokeObjectURL(url)),
    [],
  );

  async function run(key: string, task: () => Promise<void>, done: string) {
    setBusy(key);
    setResult(null);
    try {
      await task();
      setResult({ ok: true, text: done });
      for (const changed of [key, ...(options.linked?.(key) ?? [])]) await loadPreview(changed);
    } catch (e) {
      setResult({ ok: false, text: String(e) });
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  return {
    items,
    previews,
    busy,
    result,
    replace: (key: string, sourcePath: string) =>
      run(key, () => options.replace(workDir, key, sourcePath), options.messages.replaced),
    restore: (key: string) => run(key, () => options.restore(workDir, key), options.messages.restored),
  };
}

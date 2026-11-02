import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { documentDir, join } from "@tauri-apps/api/path";
import {
  backupSaves,
  cleanOrphanSaves,
  listBackups,
  listSaves,
  openBackupsFolder,
  restoreSaves,
  savesSummary,
  type SavesReport,
  type SavesSummary,
} from "../lib/backend.ts";
import { backupLabel } from "../lib/consoles.ts";

type SavesOptions = {
  /** Hay tarjeta conectada y su perfil sabe dónde están las partidas. */
  enabled: boolean;
  /** Id de la tarjeta: al cambiar de microSD se vuelve a contar. */
  cardId: string | undefined;
  /** Carpeta elegida en Configuración; vacía usa Documentos\Bunko. */
  workDir: string;
};

type Busy = "backup" | "clean" | "restore" | null;

/** Resumen, copias, restauración y limpieza de las partidas de la tarjeta. */
export function useSaves({ enabled, cardId, workDir }: SavesOptions) {
  const [summary, setSummary] = useState<SavesSummary | null>(null);
  const [defaultWorkDir, setDefaultWorkDir] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const ready = isTauri() && enabled && Boolean(cardId);
  const effectiveWorkDir = workDir || defaultWorkDir;

  useEffect(() => {
    if (!isTauri()) return;
    documentDir()
      .then((dir) => join(dir, "Bunko"))
      .then(setDefaultWorkDir)
      .catch(() => setDefaultWorkDir(""));
  }, []);

  async function refresh() {
    if (!ready) return setSummary(null);
    try {
      setSummary(await savesSummary());
    } catch {
      setSummary(null);
    }
  }

  useEffect(() => {
    setResult(null);
    void refresh();
    // Se relee al cambiar de tarjeta o de perfil.
  }, [ready, cardId]);

  /** Ejecuta una operación; devuelve `true` si terminó bien. */
  async function run(kind: Exclude<Busy, null>, task: () => Promise<SavesReport>, verb: string) {
    setBusy(kind);
    setResult(null);
    try {
      const report = await task();
      setResult({ ok: true, text: `${report.files} partidas ${verb}` });
      return true;
    } catch (e) {
      setResult({ ok: false, text: String(e) });
      return false;
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  return {
    ready,
    summary,
    busy,
    result,
    effectiveWorkDir,
    listSaves,
    listBackups: () => listBackups(effectiveWorkDir),
    backup: (files: string[]) =>
      run("backup", () => backupSaves(effectiveWorkDir, backupLabel("partidas"), files), "copiadas al PC"),
    restore: (folder: string, files: string[]) =>
      run(
        "restore",
        () => restoreSaves(effectiveWorkDir, folder, files, backupLabel("r")),
        "restauradas en la consola",
      ),
    clean: () =>
      run(
        "clean",
        () => cleanOrphanSaves(effectiveWorkDir, backupLabel("sobrantes")),
        "movidas al PC y quitadas de la tarjeta",
      ),
    openFolder: async () => {
      try {
        await openBackupsFolder(effectiveWorkDir);
      } catch (e) {
        setResult({ ok: false, text: String(e) });
      }
    },
  };
}

export type SavesState = ReturnType<typeof useSaves>;

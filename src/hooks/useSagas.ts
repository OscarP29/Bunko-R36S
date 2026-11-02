import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { readSagas, writeSagas } from "../lib/backend.ts";
import { parseSagaStore, type SagaOverrides, type SagaStore } from "../lib/sagas.ts";

const SAGAS_KEY = "r36s-manager-sagas";
const NO_OVERRIDES: SagaOverrides = {};

/**
 * Sagas elegidas a mano. Con una tarjeta se guardan en ella, para que sigan
 * ahí al usarla en otro equipo; sin tarjeta (modo navegador), en localStorage.
 */
export function useSagas(root: string, scannedRoot: string) {
  const [store, setStore] = useState<SagaStore>({});
  /** Raíz cuyas sagas están cargadas: evita escribirlas en otra tarjeta. */
  const loadedRoot = useRef<string | null>(null);

  useEffect(() => {
    loadedRoot.current = null;
    if (!isTauri() || !root) {
      setStore(parseSagaStore(localStorage.getItem(SAGAS_KEY) || ""));
      loadedRoot.current = root;
      return;
    }
    if (scannedRoot !== root) return;
    let current = true;
    readSagas()
      .then((content) => {
        if (!current) return;
        setStore(parseSagaStore(content));
        loadedRoot.current = root;
      })
      .catch(() => current && setStore({}));
    return () => {
      current = false;
    };
  }, [root, scannedRoot]);

  async function setSaga(system: string, fileName: string, saga: string | undefined) {
    if (loadedRoot.current !== root) return;
    const overrides = { ...store[system] };
    if (saga === undefined) delete overrides[fileName];
    else overrides[fileName] = saga.trim();
    const next = { ...store, [system]: overrides };
    setStore(next);
    const content = JSON.stringify(next);
    if (isTauri() && root) await writeSagas(content);
    else localStorage.setItem(SAGAS_KEY, content);
  }

  return {
    overridesFor: (system: string) => store[system] ?? NO_OVERRIDES,
    setSaga,
  };
}

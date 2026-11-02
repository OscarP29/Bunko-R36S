import { useEffect, useState } from "react";
import {
  applySettings,
  loadSettings,
  saveSettings,
  systemThemeQuery,
  type Settings,
} from "../lib/settings.ts";

/** Preferencias de la app: se aplican y guardan en cuanto cambian. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    applySettings(settings);
    saveSettings(settings);
    if (settings.theme !== "system") return;
    const query = systemThemeQuery();
    const follow = () => applySettings(settings);
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, [settings]);

  function updateSettings(patch: Partial<Settings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  return { settings, updateSettings };
}

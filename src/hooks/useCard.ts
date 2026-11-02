import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { cardInfo, updateCard, type CardInfo } from "../lib/backend.ts";

/**
 * Ficha de la microSD conectada. Identifica la consola para que las copias
 * de una tarjeta no se restauren en otra y guarda su modelo de firmware.
 */
export function useCard(root: string, scannedRoot: string) {
  const [card, setCard] = useState<CardInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setCard(null);
    if (!isTauri() || !root || scannedRoot !== root) return;
    let current = true;
    cardInfo()
      .then((info) => current && setCard(info))
      .catch((e) => current && setError(String(e)));
    return () => {
      current = false;
    };
  }, [root, scannedRoot]);

  async function update(patch: Partial<Pick<CardInfo, "name" | "profile">>) {
    if (!card) return;
    setError("");
    try {
      setCard(await updateCard(patch.name ?? card.name, patch.profile ?? card.profile));
    } catch (e) {
      setError(String(e));
    }
  }

  return { card, error, update };
}

export type CardState = ReturnType<typeof useCard>;

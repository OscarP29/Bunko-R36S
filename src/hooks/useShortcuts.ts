import { useEffect, useRef } from "react";
import { shortcutFromEvent, type Command } from "../lib/commands.ts";

export const PALETTE_SHORTCUT = "Ctrl+K";

/** Atajos globales. Con un modal abierto solo responde la paleta, para no actuar detrás. */
export function useShortcuts(commands: Command[], togglePalette: () => void) {
  const latest = useRef({ commands, togglePalette });
  latest.current = { commands, togglePalette };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const shortcut = shortcutFromEvent(event);
      if (!shortcut) return;
      if (shortcut === PALETTE_SHORTCUT) {
        event.preventDefault();
        if (
          !document.querySelector(".modal-backdrop:not(.palette-backdrop)")
        ) {
          latest.current.togglePalette();
        }
        return;
      }
      if (document.querySelector(".modal-backdrop")) return;
      const command = latest.current.commands.find(
        (item) => item.shortcut === shortcut,
      );
      if (!command) return;
      event.preventDefault();
      command.run();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

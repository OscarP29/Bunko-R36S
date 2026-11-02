export type Command = {
  id: string;
  label: string;
  group: string;
  keywords?: string;
  /** Combinación normalizada, como la devuelve `shortcutFromEvent`. */
  shortcut?: string;
  run: () => void;
};

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/** Todas las palabras deben aparecer; las que empiezan por la búsqueda van primero. */
export function filterCommands(commands: Command[], query: string): Command[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return commands;
  const matches = commands.filter((command) => {
    const haystack = normalize(
      `${command.label} ${command.group} ${command.keywords ?? ""}`,
    );
    return words.every((word) => haystack.includes(word));
  });
  const startsWith = (command: Command) =>
    normalize(command.label).startsWith(words[0]) ? 0 : 1;
  return matches
    .map((command, index) => ({ command, index }))
    .sort((a, b) => startsWith(a.command) - startsWith(b.command) || a.index - b.index)
    .map(({ command }) => command);
}

type KeyPress = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/** `Ctrl+Shift+T`, `Ctrl+Plus`… o `null` si la tecla no forma un atajo. */
export function shortcutFromEvent(event: KeyPress): string | null {
  if (event.key === "F5") return "F5";
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  if (["Control", "Meta", "Shift", "Alt"].includes(event.key)) return null;
  const key =
    event.key === "+" || event.key === "="
      ? "Plus"
      : event.key === "-" || event.key === "_"
        ? "Minus"
        : event.key.length === 1
          ? event.key.toUpperCase()
          : event.key;
  return `Ctrl+${event.shiftKey && key !== "Plus" ? "Shift+" : ""}${key}`;
}

/** Texto para mostrar un atajo: `Ctrl+Plus` → `Ctrl +`. */
export const formatShortcut = (shortcut: string) =>
  shortcut
    .split("+")
    .map((part) => (part === "Plus" ? "+" : part === "Minus" ? "-" : part))
    .join(" ");

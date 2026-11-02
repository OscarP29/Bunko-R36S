import { useId, useState } from "react";
import type { GameTitlesStatus } from "../hooks/useGameTitles.ts";

type GameTitleInputProps = {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  status: GameTitlesStatus;
};

const PLACEHOLDERS: Record<GameTitlesStatus, string> = {
  idle: "Elige consola para ver sugerencias",
  loading: "Cargando sugerencias…",
  ready: "Ej. Chrono Trigger",
  error: "Sin sugerencias: no hay conexión",
};

/** Campo de título con sugerencias desplegables (combobox accesible). */
export function GameTitleInput({ value, onChange, suggestions, status }: GameTitleInputProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const visible = open && suggestions.length > 0;

  function pick(title: string) {
    onChange(title);
    setOpen(false);
    setActive(-1);
  }

  function handleKeys(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!suggestions.length) return;
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (suggestions.length + current + step) % suggestions.length);
    } else if (event.key === "Enter" && visible && active >= 0) {
      event.preventDefault();
      pick(suggestions[active]);
    } else if (event.key === "Escape" && visible) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="combobox">
      <input
        className="text-field"
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeys}
        placeholder={PLACEHOLDERS[status]}
      />
      {visible && (
        <ul className="context-menu combobox-list" id={listId} role="listbox">
          {suggestions.map((title, index) => (
            <li
              key={title}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? "active" : ""}
              // Sin esto, el campo pierde el foco y la lista se cierra antes del clic.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(title)}
            >
              {title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

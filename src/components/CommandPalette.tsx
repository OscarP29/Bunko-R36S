import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import {
  filterCommands,
  formatShortcut,
  type Command,
} from "../lib/commands.ts";
import { ModalBackdrop } from "./ui/Modal.tsx";

type CommandPaletteProps = {
  commands: Command[];
  onClose: () => void;
};

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const results = useMemo(
    () => filterCommands(commands, query),
    [commands, query],
  );

  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function run(command: Command | undefined) {
    if (!command) return;
    onClose();
    command.run();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(results[active]);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!results.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((results.length + active + step) % results.length);
    }
  }

  return (
    <ModalBackdrop className="palette-backdrop" onClose={onClose}>
      <section className="modal command-palette" role="dialog" aria-label="Comandos">
        <div className="palette-search">
          <Search size={18} />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={
              results[active] ? `palette-${results[active].id}` : undefined
            }
            aria-label="Buscar comando"
            placeholder="Busca una acción, sistema o juego…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>

        <ul className="palette-list" id="palette-results" role="listbox" ref={list}>
          {results.map((command, index) => (
            <li
              key={command.id}
              id={`palette-${command.id}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? "active" : ""}
              onMouseMove={() => setActive(index)}
              onClick={() => run(command)}
            >
              <span>{command.label}</span>
              <small>{command.group}</small>
              {command.shortcut && <kbd>{formatShortcut(command.shortcut)}</kbd>}
            </li>
          ))}
        </ul>
        {!results.length && <p className="palette-empty">Sin resultados</p>}

        <div className="modal-footer palette-footer">
          <span>
            <kbd>↑ ↓</kbd> Moverse
          </span>
          <span>
            <kbd>Enter</kbd> Ejecutar
          </span>
          <span>
            <kbd>Esc</kbd> Cerrar
          </span>
        </div>
      </section>
    </ModalBackdrop>
  );
}
